param(
    [Parameter(Mandatory)][string]$Compiler,
    [Parameter(Mandatory)][string]$Flags,
    [Parameter(Mandatory)][string[]]$ImportDirectories,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$sourceDirectory = (Resolve-Path (Join-Path $PSScriptRoot 'Scripts/Source')).Path
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$imports = @($sourceDirectory) + $ImportDirectories
foreach ($name in @('NirnCommand_PlayerAlias', 'NirnCommand_ConsoleAdapter', 'NirnCommand_SkyrimNetAdapter')) {
    $source = Join-Path $sourceDirectory ($name + '.psc')
    & $Compiler $source "-f=$Flags" "-i=$($imports -join ';')" "-o=$OutputDirectory"
    if ($LASTEXITCODE -ne 0) { throw "Papyrus compilation failed: $name" }
}
