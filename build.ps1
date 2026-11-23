param([string]$ConfigPath = (Join-Path $PSScriptRoot 'config.local.json'), [string]$NativeDll = (Join-Path $PSScriptRoot 'build/native/NirnCommandNative.dll'), [string]$NativeLicenses = (Join-Path $PSScriptRoot 'build/native/licenses'))
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
& node (Join-Path $PSScriptRoot 'tests/search.test.js')
if ($LASTEXITCODE -ne 0) { throw 'Search tests failed' }
& node (Join-Path $PSScriptRoot 'tests/categories.test.js')
if ($LASTEXITCODE -ne 0) { throw 'Category tests failed' }
& node (Join-Path $PSScriptRoot 'tests/palette.test.js')
if ($LASTEXITCODE -ne 0) { throw 'Palette tests failed' }
& node (Join-Path $PSScriptRoot 'tests/editor.test.js')
if ($LASTEXITCODE -ne 0) { throw 'Editor tests failed' }
foreach ($path in @($config.compiler, $config.flags, $config.skyrimMaster, $config.xDump) + @($config.imports)) {
    if (!$path -or !(Test-Path -LiteralPath $path)) { throw "Build input missing: $path" }
}
if (!(Test-Path -LiteralPath $NativeDll -PathType Leaf)) { throw "Native DLL missing: $NativeDll" }
if (!(Test-Path -LiteralPath $NativeLicenses -PathType Container)) { throw "Native licenses missing: $NativeLicenses" }
$build = Join-Path $PSScriptRoot 'build'
$stage = Join-Path $build 'package'
if (Test-Path -LiteralPath $stage) {
    $resolvedBuild = (Resolve-Path -LiteralPath $build).Path.TrimEnd('\') + '\'
    $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
    if (!$resolvedStage.StartsWith($resolvedBuild, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe package directory' }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage, (Join-Path $stage 'Scripts'), (Join-Path $stage 'SEQ'), (Join-Path $build 'verify') | Out-Null
& node (Join-Path $PSScriptRoot 'tools/create-plugin.js') (Join-Path $stage 'NirnCommand.esp')
if ($LASTEXITCODE -ne 0) { throw 'ESP generation failed' }
& node (Join-Path $PSScriptRoot 'tools/check-plugin.js') (Join-Path $stage 'NirnCommand.esp')
if ($LASTEXITCODE -ne 0) { throw 'ESP structural validation failed' }
& (Join-Path $PSScriptRoot 'compile.ps1') -Compiler $config.compiler -Flags $config.flags -ImportDirectories $config.imports -OutputDirectory (Join-Path $stage 'Scripts')
if (!(Test-Path -LiteralPath (Join-Path $stage 'Scripts/NirnCommand_PlayerAlias.pex'))) { throw 'Compiled script is missing' }
[IO.File]::WriteAllBytes((Join-Path $stage 'SEQ/NirnCommand.seq'),[byte[]](0x62,0x0d,0x00,0x01))
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Magelight') -Destination $stage -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'SKSE/Plugins') | Out-Null
Copy-Item -LiteralPath $NativeDll -Destination (Join-Path $stage 'SKSE/Plugins/NirnCommandNative.dll')
Copy-Item -LiteralPath $NativeLicenses -Destination (Join-Path $stage 'licenses') -Recurse
foreach ($script in Get-ChildItem -LiteralPath (Join-Path $stage 'Magelight/NirnCommand/views/palette') -Filter '*.js') {
    & node --check $script.FullName
    if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $($script.Name)" }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'docs') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'examples') -Destination $stage -Recurse
foreach ($name in @('README.md','KNOWN_ISSUES.md','BUG_REPORT_TEMPLATE.md')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $stage -Force }
Copy-Item -LiteralPath (Join-Path $stage 'NirnCommand.esp') -Destination (Join-Path $build 'verify/NirnCommand.esp') -Force
$verifyMaster = Join-Path $build 'verify/Skyrim.esm'
if (!(Test-Path -LiteralPath $verifyMaster) -or (Get-FileHash -LiteralPath $config.skyrimMaster).Hash -ne (Get-FileHash -LiteralPath $verifyMaster).Hash) {
    Copy-Item -LiteralPath $config.skyrimMaster -Destination $verifyMaster -Force
}
$dump = & $config.xDump -sse -q -check (Join-Path $build 'verify/NirnCommand.esp') 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $dump -match '(?im)^.*(?:error:|exception|fatal).*$' -or $dump -notmatch 'Checking: GRUP Top "QUST"' -or $dump -notmatch 'All Done\.') { throw "xEdit check failed: $dump" }
Set-Content -LiteralPath (Join-Path $build 'verify/xedit-check.log') -Value $dump -Encoding utf8
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'dist') | Out-Null
$archive = Join-Path $PSScriptRoot 'dist/NirnCommand-v0.5.0.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -Force
& node (Join-Path $PSScriptRoot 'tools/check-package.js') $archive
if ($LASTEXITCODE -ne 0) { throw 'Archive validation failed' }
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($archive + '.sha256'), "$hash  $([IO.Path]::GetFileName($archive))`n", [Text.UTF8Encoding]::new($false))
Write-Output "Built $archive"
Write-Output "SHA-256: $hash"
