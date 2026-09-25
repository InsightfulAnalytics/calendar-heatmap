<#
.SYNOPSIS
    Offline round trip of the Daily Sales model's TMDL, before Desktop sees it.

.DESCRIPTION
    Run with Windows PowerShell 5.1, from any folder:

        powershell -NoProfile -ExecutionPolicy Bypass -File "<project>\report\validate-model.ps1"

    Deserializes the model's definition folder with the TOM TmdlSerializer (no engine, no Desktop)
    and checks the round trip, not only the parse: every measure, format string and dynamic format
    string written in the .tmdl files must come back on the deserialized model. A measure body
    written at the depth of its properties still parses, but swallows its format string, and only
    this comparison catches it (pbip:tmdl skill, references/authoring-gotchas.md).

    DAX user-defined functions (functions.tmdl) need a TOM assembly that knows them. An older
    assembly throws "function is not a supported property" at functions.tmdl line 1. When that
    happens the script uses the documented workaround: it validates a copy of the folder with
    functions.tmdl removed, says so, and lists the functions it could not check. Power BI Desktop
    is then the referee for the functions themselves (the seam loop applies the model there and
    queries each function).

    Exits 0 when the round trip holds, 1 otherwise.

.PARAMETER Definition
    The model's definition folder. Defaults to the Daily Sales model beside this script.

.PARAMETER TabularDll
    A Microsoft.AnalysisServices.Tabular.dll that Windows PowerShell 5.1 can load (a .NET
    Framework build). Defaults to the first one found in DAX Studio or Tabular Editor 2.
#>
[CmdletBinding()]
param(
    [string]$Definition,
    [string]$TabularDll
)

$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Definition) { $Definition = Join-Path $Here 'Daily Sales.SemanticModel\definition' }

function Pass([string]$Text) { Write-Host "  PASS  $Text" -ForegroundColor Green }
function Note([string]$Text) { Write-Host "  ....  $Text" }
function Fail([string]$Text) { Write-Host "  FAIL  $Text" -ForegroundColor Red; $script:Failed = $true }
$script:Failed = $false

# A .NET Framework TOM assembly: Windows PowerShell 5.1 cannot load the .NET 8 builds.
$candidates = @(
    $TabularDll,
    (Join-Path $env:ProgramFiles 'DAX Studio\bin\Microsoft.AnalysisServices.Tabular.dll'),
    (Join-Path ${env:ProgramFiles(x86)} 'Tabular Editor\Microsoft.AnalysisServices.Tabular.dll')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if (-not $candidates) { Write-Host '  FAIL  no Microsoft.AnalysisServices.Tabular.dll found; pass -TabularDll' -ForegroundColor Red; exit 1 }
$dll = @($candidates)[0]
Add-Type -Path $dll
$version = [System.Reflection.AssemblyName]::GetAssemblyName($dll).Version
Note "TOM assembly $version ($dll)"

$functionsFile = Join-Path $Definition 'functions.tmdl'
$functionNames = @()
if (Test-Path -LiteralPath $functionsFile) {
    $functionNames = @(Select-String -LiteralPath $functionsFile -Pattern "^function\s+('([^']|'')+'|\S+)" | ForEach-Object { $_.Matches[0].Groups[1].Value })
}

# Parse the folder as it is. An assembly that predates DAX UDFs fails on functions.tmdl, so fall
# back to a copy without it.
$parsed = $null
$scratch = $null
try {
    $parsed = [Microsoft.AnalysisServices.Tabular.TmdlSerializer]::DeserializeDatabaseFromFolder($Definition)
    Pass "the definition folder deserializes as it is (compatibility level $($parsed.CompatibilityLevel))"
    if ($functionNames.Count) { Pass "functions read offline: $($functionNames -join ', ')" }
} catch {
    $message = $_.Exception.Message
    if ($functionNames.Count -and $message -match 'function') {
        Note "this TOM assembly ($version) predates DAX user-defined functions: $($message.Split([char]10)[0].Trim())"
        Note 'workaround (pbip:tmdl authoring-gotchas): validating a copy of the folder without functions.tmdl'
        $scratch = Join-Path ([IO.Path]::GetTempPath()) ('tmdl-roundtrip-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
        Copy-Item -LiteralPath $Definition -Destination $scratch -Recurse
        Remove-Item -LiteralPath (Join-Path $scratch 'functions.tmdl')
        try {
            $parsed = [Microsoft.AnalysisServices.Tabular.TmdlSerializer]::DeserializeDatabaseFromFolder($scratch)
            Pass "the copy without functions.tmdl deserializes (compatibility level $($parsed.CompatibilityLevel))"
            Note "not validated offline, Desktop is the referee: $($functionNames -join ', ')"
        } catch {
            Fail "the copy without functions.tmdl does not deserialize either: $($_.Exception.Message)"
        } finally {
            Remove-Item -LiteralPath $scratch -Recurse -Force
        }
    } else {
        Fail "the definition folder does not deserialize: $message"
    }
}

if ($parsed) {
    $model = $parsed.Model
    Note ("{0} tables, {1} relationships" -f $model.Tables.Count, $model.Relationships.Count)
    if ($parsed.CompatibilityLevel -lt 1702) { Fail "compatibility level $($parsed.CompatibilityLevel) is below 1702, which DAX user-defined functions need" }

    # What the files say, read from the text: each measure's name, and which format it declares.
    $written = @{}
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $Definition 'tables') -Filter '*.tmdl') {
        $current = $null
        foreach ($line in Get-Content -LiteralPath $file.FullName -Encoding UTF8) {
            if ($line -match "^\tmeasure\s+('(?:[^']|'')+'|[^\s=]+)\s*=") {
                $current = $Matches[1] -replace "^'(.*)'$", '$1' -replace "''", "'"
                $written[$current] = [pscustomobject]@{ Table = $file.BaseName; Static = $false; Dynamic = $false }
            } elseif ($line -match '^\t(column|partition|measure|hierarchy|annotation)\b') {
                $current = $null
            } elseif ($current -and $line -match '^\t\tformatString:') {
                $written[$current].Static = $true
            } elseif ($current -and $line -match '^\t\tformatStringDefinition\s*=') {
                $written[$current].Dynamic = $true
            }
        }
    }

    $read = @{}
    foreach ($t in $model.Tables) { foreach ($m in $t.Measures) { $read[$m.Name] = $m } }
    $mismatch = @()
    foreach ($name in $written.Keys) {
        $m = $read[$name]
        $w = $written[$name]
        if (-not $m) { $mismatch += "$name is written but did not come back"; continue }
        $hasStatic = -not [string]::IsNullOrEmpty($m.FormatString)
        $hasDynamic = $null -ne $m.FormatStringDefinition
        if ($w.Static -ne $hasStatic) { $mismatch += "$name format string written $($w.Static), read $hasStatic" }
        if ($w.Dynamic -ne $hasDynamic) { $mismatch += "$name dynamic format string written $($w.Dynamic), read $hasDynamic" }
        if ($hasStatic -and $hasDynamic) { $mismatch += "$name carries both a format string and a dynamic format string (Desktop refuses the project)" }
        if ($m.Expression -match '(?m)^\s*(formatString|formatStringDefinition|displayFolder|lineageTag)\b') { $mismatch += "$name swallowed its properties into the DAX (expression written at the wrong depth)" }
    }
    foreach ($name in $read.Keys) { if (-not $written.ContainsKey($name)) { $mismatch += "$name came back but was not found in the text" } }
    if ($mismatch.Count) { $mismatch | ForEach-Object { Fail $_ } }
    else {
        $dyn = @($written.Values | Where-Object { $_.Dynamic }).Count
        $stat = @($written.Values | Where-Object { $_.Static }).Count
        Pass "round trip: $($written.Count) measures, $stat format strings and $dyn dynamic format strings written and read back"
    }
}

if ($script:Failed) { Write-Host 'MODEL ROUND TRIP FAILED' -ForegroundColor Red; exit 1 }
Write-Host 'MODEL ROUND TRIP PASSED' -ForegroundColor Green
exit 0
