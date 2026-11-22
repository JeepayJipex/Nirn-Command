param([string]$ConfigPath = (Join-Path $PSScriptRoot 'config.local.json'))
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
& node (Join-Path $PSScriptRoot 'tests/palette.test.js')
if ($LASTEXITCODE -ne 0) { throw 'Palette tests failed' }
& node (Join-Path $PSScriptRoot 'tests/editor.test.js')
if ($LASTEXITCODE -ne 0) { throw 'Editor tests failed' }
& node (Join-Path $PSScriptRoot 'tests/scanner.test.js')
if ($LASTEXITCODE -ne 0) { throw 'Scanner tests failed' }
foreach ($path in @($config.compiler, $config.flags, $config.skyrimMaster, $config.xDump) + @($config.imports)) {
    if (!$path -or !(Test-Path -LiteralPath $path)) { throw "Build input missing: $path" }
}
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
foreach ($script in Get-ChildItem -LiteralPath (Join-Path $stage 'Magelight/NirnCommand/views/palette') -Filter '*.js') {
    & node --check $script.FullName
    if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $($script.Name)" }
}
foreach ($name in @('README.md','KNOWN_ISSUES.md','BUG_REPORT_TEMPLATE.md')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $stage -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'tools') | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tools/scan-shortcuts.js') -Destination (Join-Path $stage 'tools') -Force
Copy-Item -LiteralPath (Join-Path $stage 'NirnCommand.esp') -Destination (Join-Path $build 'verify/NirnCommand.esp') -Force
$verifyMaster = Join-Path $build 'verify/Skyrim.esm'
if (!(Test-Path -LiteralPath $verifyMaster) -or (Get-FileHash -LiteralPath $config.skyrimMaster).Hash -ne (Get-FileHash -LiteralPath $verifyMaster).Hash) {
    Copy-Item -LiteralPath $config.skyrimMaster -Destination $verifyMaster -Force
}
$dump = & $config.xDump -sse -q -check (Join-Path $build 'verify/NirnCommand.esp') 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $dump -match '(?im)^.*(?:error:|exception|fatal).*$' -or $dump -notmatch 'Checking: GRUP Top "QUST"' -or $dump -notmatch 'All Done\.') { throw "xEdit check failed: $dump" }
Set-Content -LiteralPath (Join-Path $build 'verify/xedit-check.log') -Value $dump -Encoding utf8
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'dist') | Out-Null
$archive = Join-Path $PSScriptRoot 'dist/NirnCommand-Personal-AllIn.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -Force
& node (Join-Path $PSScriptRoot 'tools/check-package.js') $archive
if ($LASTEXITCODE -ne 0) { throw 'Archive validation failed' }
Write-Output "Built $archive"
