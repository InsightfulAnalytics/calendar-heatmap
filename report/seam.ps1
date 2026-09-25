<#
.SYNOPSIS
    The report seam loop for the Daily Sales PBIP: validate, apply the on-disk model and report,
    refresh data in Desktop twice, reload the canvas, screenshot every page and run the DAX
    tie-out suite.

.DESCRIPTION
    Run it with Windows PowerShell 5.1 while Power BI Desktop has report\Daily Sales.pbip open (one
    instance only, secure local APIs preview on), from any working directory:

        powershell -NoProfile -ExecutionPolicy Bypass -File "<project>\report\seam.ps1" -OutDir "<folder>"

    Steps, in order. Any failure stops the loop and the script exits 1.
      1. Find the one Desktop instance that holds this PBIP (pbir desktop list --json).
      2. Validate the Report by its absolute path. The first output line must read
         "Validating Daily Sales", which proves no active pbir connection hijacked the path. Then a
         full validate (--all --json) whose errors must all be on the known-false-positive list below.
      3. Apply the on-disk model and report: click Desktop's "Apply external changes" banner
         (and confirm its overwrite dialog) when Desktop has noticed an on-disk change. No banner
         means Desktop already holds what is on disk.
      4. Refresh data inside Desktop (the Home ribbon Refresh button, through UI Automation), wait
         until every partition reports a newer refresh time, fingerprint the data; do it twice. The
         two fingerprints must match (a fixed-formula generator).
      5. Reload the canvas (pbir desktop refresh).
      6. Screenshot every page into -OutDir (pbir desktop screenshot --all). Open the PNGs and look.
      7. Run every check in tieout.json: each evaluates a report expression and an independent
         expression over the fact and date tables, and any difference fails the loop.

    Two routes are deliberately NOT used. `pbir desktop refresh -m` refuses a model that defines a
    culture, and Desktop writes cultures\en-US.tmdl on its first save. An external TMSL "full"
    refresh over XMLA hangs Desktop once the model has been re-applied from outside: the engine asks
    Desktop's mashup host for a package session it no longer has. See the project LEARNINGS.

    The loop never saves. A data refresh leaves Desktop with unsaved changes; that is harmless to
    the next run, whose step 3 applies the disk copy over them. Save, or close without saving,
    deliberately and per the checklist protocol.

.PARAMETER OutDir
    Folder for the all-pages screenshot. Created if missing.

.PARAMETER Suite
    Tie-out suite file. Defaults to tieout.json beside this script.

.PARAMETER SkipScreenshot
    Skip step 6 (for a quick DAX-only rerun).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$Suite,
    [switch]$SkipScreenshot
)

$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# $PSScriptRoot is empty inside a param default under Windows PowerShell 5.1, so resolve here.
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Suite) { $Suite = Join-Path $Here 'tieout.json' }
$ReportName = 'Daily Sales'
$Pbip = Join-Path $Here "$ReportName.pbip"
$Report = Join-Path $Here "$ReportName.Report"

# pbir validate --fields reports the text box dynamic-value shape Desktop itself writes (a Min over
# a Subquery column) as a Column bound to a measure. That is a false positive: the title renders.
# Each entry must match an error exactly to be forgiven.
$KnownValidationFalsePositives = @(
    @{ code = 'FIELD_KIND_MISMATCH'; location = 'dailyOverview/titleText/visual.json'; field = 'Measure Table.Dates Selected' }
)

$script:Failures = New-Object System.Collections.ArrayList
function Step([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Pass([string]$Text) { Write-Host "  PASS  $Text" -ForegroundColor Green }
function Note([string]$Text) { Write-Host "  ....  $Text" }
function Fail([string]$Text) { Write-Host "  FAIL  $Text" -ForegroundColor Red; [void]$script:Failures.Add($Text) }
function Stop-IfFailed {
    if ($script:Failures.Count -gt 0) {
        Write-Host ''
        Write-Host "SEAM FAILED ($($script:Failures.Count)):" -ForegroundColor Red
        $script:Failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        exit 1
    }
}
function Invoke-Pbir([string[]]$Arguments, [switch]$StdoutOnly) {
    # Windows PowerShell 5.1 turns a native command's redirected stderr into a terminating error
    # under ErrorActionPreference Stop, so relax it for the call. JSON callers drop stderr.
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($StdoutOnly) { $out = & pbir @Arguments 2>$null | ForEach-Object { "$_" } }
        else { $out = & pbir @Arguments 2>&1 | ForEach-Object { "$_" } }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $saved }
    return [pscustomobject]@{ Code = $code; Lines = @($out) }
}

# ---------------------------------------------------------------------------------------------
# UI Automation helpers for the running Desktop window (Windows and Desktop only).
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [Windows.Automation.AutomationElement]
function New-Cond($Property, $Value) { New-Object Windows.Automation.PropertyCondition($Property, $Value) }
function Get-DesktopWindows([int]$ProcessId) {
    @($AE::RootElement.FindAll([Windows.Automation.TreeScope]::Children, (New-Cond $AE::ProcessIdProperty $ProcessId)))
}
function Find-Button([int]$ProcessId, [string]$Name, [string]$ClassPattern = '') {
    $cond = New-Object Windows.Automation.AndCondition(
        (New-Cond $AE::ControlTypeProperty ([Windows.Automation.ControlType]::Button)),
        (New-Cond $AE::NameProperty $Name))
    foreach ($w in Get-DesktopWindows $ProcessId) {
        foreach ($b in $w.FindAll([Windows.Automation.TreeScope]::Descendants, $cond)) {
            if (-not $ClassPattern -or $b.Current.ClassName -match $ClassPattern) { return $b }
        }
    }
    return $null
}
function Find-ById([int]$ProcessId, [string]$AutomationId) {
    foreach ($w in Get-DesktopWindows $ProcessId) {
        $hit = $w.FindFirst([Windows.Automation.TreeScope]::Descendants, (New-Cond $AE::AutomationIdProperty $AutomationId))
        if ($hit) { return $hit }
    }
    return $null
}
function Invoke-Element($Element) { $Element.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke() }

# ---------------------------------------------------------------------------------------------
Step '1. Desktop instance'
if (-not (Get-Command pbir -ErrorAction SilentlyContinue)) { Fail 'pbir is not on PATH'; Stop-IfFailed }
$list = Invoke-Pbir @('desktop', 'list', '--json') -StdoutOnly
try { $instances = (($list.Lines -join "`n") | ConvertFrom-Json).instances } catch { $instances = @() }
$mine = @($instances | Where-Object { $_.currentFilePath -and ([IO.Path]::GetFullPath($_.currentFilePath) -eq [IO.Path]::GetFullPath($Pbip)) })
if ($mine.Count -ne 1) {
    Fail "expected exactly one Desktop instance holding $Pbip, found $($mine.Count). Open it with Start-Process on the absolute .pbip path, and check the secure local APIs preview is on"
    Stop-IfFailed
}
$DesktopPid = [int]$mine[0].pid
Pass "PID $DesktopPid holds $Pbip (unsaved changes: $($mine[0].hasUnsavedChanges))"

# ---------------------------------------------------------------------------------------------
Step '2. Validate the Report by absolute path'
$v = Invoke-Pbir @('validate', $Report)
$first = ($v.Lines | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1)
if ($first -ne "Validating $ReportName") { Fail "first validate line was '$first', not 'Validating $ReportName' (a pbir connection may have hijacked the path)" }
elseif ($v.Code -ne 0) { Fail "pbir validate exited $($v.Code)"; $v.Lines | ForEach-Object { Write-Host "    $_" } }
else { Pass "pbir validate: $first, exit 0" }

$va = Invoke-Pbir @('validate', $Report, '--all', '--json') -StdoutOnly
try { $vj = ($va.Lines -join "`n") | ConvertFrom-Json } catch { $vj = $null }
if (-not $vj) { Fail 'pbir validate --all --json did not return JSON' }
elseif ($vj.report -ne $ReportName) { Fail "validate --all checked '$($vj.report)', not '$ReportName'" }
else {
    $unexpected = @($vj.errors | Where-Object {
        $e = $_
        -not ($KnownValidationFalsePositives | Where-Object { $_.code -eq $e.code -and $_.location -eq $e.location -and $_.field -eq $e.details.field_ref })
    })
    $forgiven = @($vj.errors).Count - $unexpected.Count
    if ($unexpected.Count -gt 0) { $unexpected | ForEach-Object { Fail "validate --all: $($_.code) at $($_.location): $($_.message)" } }
    else { Pass "pbir validate --all: 0 unexpected errors ($forgiven known false positive(s) forgiven)" }
    @($vj.warnings) | Where-Object { $_ } | ForEach-Object { Write-Host "  WARN  $($_.code) at $($_.location): $($_.message)" -ForegroundColor Yellow }
}
Stop-IfFailed

# ---------------------------------------------------------------------------------------------
Step '3. Apply the on-disk model and report in Desktop'
$banner = $null
for ($i = 0; $i -lt 6 -and -not $banner; $i++) {
    $banner = Find-Button $DesktopPid 'Apply external changes'
    if (-not $banner) { Start-Sleep -Seconds 2 }
}
if (-not $banner) {
    Pass 'no "Apply external changes" banner: Desktop already holds the on-disk model and report'
} else {
    Invoke-Element $banner
    Note 'clicked Apply external changes'
    # With unsaved edits in Desktop a confirm dialog ("Overwrite your unsaved edits") follows.
    # The disk copy is the source of truth, so confirm it.
    $ok = $null
    for ($i = 0; $i -lt 8 -and -not $ok; $i++) { Start-Sleep -Seconds 1; $ok = Find-ById $DesktopPid 'okButton' }
    if ($ok) { Invoke-Element $ok; Note "confirmed '$($ok.Current.Name)' on the overwrite dialog" }
    $gone = $false
    for ($i = 0; $i -lt 90 -and -not $gone; $i++) { Start-Sleep -Seconds 2; $gone = -not (Find-Button $DesktopPid 'Apply external changes') }
    if (-not $gone) { Fail 'the Apply external changes banner did not clear within 3 minutes; look at Desktop for a dialog'; Stop-IfFailed }
    Start-Sleep -Seconds 5
    Pass 'on-disk model and report applied'
}

# ---------------------------------------------------------------------------------------------
# ADOMD.NET client (.NET Framework build, so Windows PowerShell 5.1 can load it). Probe the usual
# installs; set $env:PBIR_ADOMD_DIR to force a folder.
$candidates = @($env:PBIR_ADOMD_DIR,
    "$env:ProgramFiles\DAX Studio\bin",
    "$env:TEMP\tom_nuget\Microsoft.AnalysisServices.AdomdClient.retail.amd64\lib\net45") | Where-Object { $_ }
$adomdDir = $candidates | Where-Object { Test-Path (Join-Path $_ 'Microsoft.AnalysisServices.AdomdClient.dll') } | Select-Object -First 1
if (-not $adomdDir) { Fail 'no Microsoft.AnalysisServices.AdomdClient.dll found (install DAX Studio, or set PBIR_ADOMD_DIR)'; Stop-IfFailed }
Add-Type -Path (Join-Path $adomdDir 'Microsoft.AnalysisServices.AdomdClient.dll')

$engine = Get-CimInstance Win32_Process -Filter "Name='msmdsrv.exe'" | Where-Object { $_.ParentProcessId -eq $DesktopPid } | Select-Object -First 1
if (-not $engine) { Fail "no msmdsrv.exe under Desktop PID $DesktopPid"; Stop-IfFailed }
$Port = (Get-NetTCPConnection -State Listen | Where-Object OwningProcess -eq $engine.ProcessId | Select-Object -First 1).LocalPort
$ConnStr = "Data Source=localhost:$Port"

function ConvertTo-Dax($Expr) { if ($Expr -is [array]) { return ($Expr -join "`n") } else { return [string]$Expr } }
function Invoke-DaxRows([string]$Query) {
    $conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection($ConnStr)
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query
        $r = $cmd.ExecuteReader()
        $rows = New-Object System.Collections.ArrayList
        try {
            while ($r.Read()) {
                $vals = New-Object object[] $r.FieldCount
                for ($i = 0; $i -lt $r.FieldCount; $i++) { $x = $r.GetValue($i); if ($x -isnot [DBNull]) { $vals[$i] = $x } }
                [void]$rows.Add($vals)
            }
        }
        finally { $r.Close() }
        return ,$rows
    } finally { $conn.Close() }
}
function Invoke-DaxScalar([string]$Expr) {
    $rows = Invoke-DaxRows "EVALUATE ROW ( ""v"", $Expr )"
    if ($rows.Count -gt 0) { return $rows[0][0] } else { return $null }
}
function Format-DaxValue($Value) {
    if ($null -eq $Value) { return '(blank)' }
    if ($Value -is [datetime]) { if ($Value.TimeOfDay.Ticks -eq 0) { return $Value.ToString('yyyy-MM-dd') } else { return $Value.ToString('s') } }
    if ($Value -is [bool]) { return $Value.ToString().ToLower() }
    return [string]$Value
}
function Test-DaxEqual($A, $B, [double]$Tolerance) {
    if ($null -eq $A -or $null -eq $B) { return ($null -eq $A -and $null -eq $B) }
    $numeric = { param($x) $x -is [int] -or $x -is [long] -or $x -is [double] -or $x -is [decimal] -or $x -is [single] -or $x -is [int16] }
    if ((& $numeric $A) -and (& $numeric $B)) { return ([math]::Abs([double]$A - [double]$B) -le $Tolerance) }
    return ((Format-DaxValue $A) -ceq (Format-DaxValue $B))
}
function Get-PartitionTimes { Invoke-DaxRows 'EVALUATE SELECTCOLUMNS ( INFO.PARTITIONS (), "Name", [Name], "Refreshed", [RefreshedTime] )' }

$suiteJson = Get-Content -LiteralPath $Suite -Raw -Encoding UTF8 | ConvertFrom-Json
function Get-Fingerprint {
    $parts = foreach ($f in $suiteJson.fingerprint) { "$($f.name)=$(Format-DaxValue (Invoke-DaxScalar (ConvertTo-Dax $f.expr)))" }
    return ($parts -join '; ')
}

# ---------------------------------------------------------------------------------------------
Step "4. Refresh data in Desktop, twice (engine localhost:$Port)"
$compat = [int](Invoke-DaxRows 'SELECT [COMPATIBILITY_LEVEL] FROM $SYSTEM.DBSCHEMA_CATALOGS')[0][0]
if ($compat -ge 1702) { Pass "compatibility level $compat" } else { Fail "compatibility level $compat is below 1702" }

$prints = @()
foreach ($n in 1, 2) {
    $times = Get-PartitionTimes
    $before = ($times | ForEach-Object { [datetime]$_[1] } | Measure-Object -Maximum).Maximum
    $button = Find-Button $DesktopPid 'Refresh' 'splitPrimaryButton'
    if (-not $button) { Fail 'the Home ribbon Refresh button was not found; is Desktop in Report view?'; Stop-IfFailed }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Invoke-Element $button
    $done = $false
    while (-not $done -and $sw.Elapsed.TotalSeconds -lt 300) {
        Start-Sleep -Seconds 2
        try {
            $times = Get-PartitionTimes
            $oldest = ($times | ForEach-Object { [datetime]$_[1] } | Measure-Object -Minimum).Minimum
            $done = ($times.Count -gt 0) -and ($oldest -gt $before)
        } catch { $done = $false }
    }
    if (-not $done) { Fail "refresh $n did not finish within 5 minutes; look at Desktop for an error dialog"; Stop-IfFailed }
    Start-Sleep -Seconds 3
    $fp = Get-Fingerprint
    $prints += $fp
    Pass ("refresh {0} in {1:n0}s: {2}" -f $n, $sw.Elapsed.TotalSeconds, $fp)
}
if ($prints[0] -ceq $prints[1]) { Pass 'two refreshes give identical fingerprints' } else { Fail "fingerprints differ between refreshes: [$($prints[0])] vs [$($prints[1])]" }
Stop-IfFailed

# ---------------------------------------------------------------------------------------------
Step '5. Reload the canvas'
$rl = Invoke-Pbir @('desktop', 'refresh', $Report, '--pid', "$DesktopPid")
if ($rl.Code -ne 0) { Fail "pbir desktop refresh exited $($rl.Code): $($rl.Lines -join ' ')"; Stop-IfFailed }
Pass 'canvas reloaded'

# ---------------------------------------------------------------------------------------------
if (-not $SkipScreenshot) {
    Step '6. All-pages screenshot'
    $out = [IO.Path]::GetFullPath($OutDir)
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    $started = Get-Date
    $shot = Invoke-Pbir @('desktop', 'screenshot', $Report, '--all', '--output-dir', $out, '--settle', '8000', '--pid', "$DesktopPid")
    if ($shot.Code -ne 0) { Fail "pbir desktop screenshot exited $($shot.Code): $($shot.Lines -join ' ')" }
    $pngs = @(Get-ChildItem -LiteralPath $out -Filter '*.png' | Where-Object { $_.LastWriteTime -ge $started.AddSeconds(-2) })
    if ($pngs.Count -eq 0) { Fail "no fresh PNG in $out" }
    $pngs | ForEach-Object { Pass "$($_.FullName) ($([math]::Round($_.Length / 1KB)) KB): open it and look" }
    Stop-IfFailed
}

# ---------------------------------------------------------------------------------------------
Step "7. DAX tie-out ($([IO.Path]::GetFileName($Suite)), $(@($suiteJson.checks).Count) checks)"
foreach ($c in $suiteJson.checks) {
    $tol = 0.0; if ($c.PSObject.Properties['tolerance']) { $tol = [double]$c.tolerance }
    try {
        $a = Invoke-DaxScalar (ConvertTo-Dax $c.report)
        $b = Invoke-DaxScalar (ConvertTo-Dax $c.independent)
        $line = "$($c.name): report $(Format-DaxValue $a), independent $(Format-DaxValue $b)"
        if (Test-DaxEqual $a $b $tol) { Pass $line } else { Fail $line }
    } catch {
        Fail "$($c.name): query error: $($_.Exception.Message)"
    }
}
Stop-IfFailed

Write-Host ''
Write-Host 'SEAM PASSED' -ForegroundColor Green
exit 0
