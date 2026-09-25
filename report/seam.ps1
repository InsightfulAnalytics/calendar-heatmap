<#
.SYNOPSIS
    The report seam loop for the Daily Sales PBIP: validate, apply the on-disk model and report,
    refresh data in Desktop twice, reload the canvas, screenshot every page and run the DAX
    tie-out suite.

.DESCRIPTION
    Run it with Windows PowerShell 5.1 while Power BI Desktop has report\Daily Sales.pbip open (one
    instance only, secure local APIs preview on), from any working directory:

        powershell -NoProfile -ExecutionPolicy Bypass -File "<project>\report\seam.ps1" -OutDir "<folder>" [-OverwriteUnsaved]

    Steps, in order. Any failure stops the loop and the script exits 1.
      1. Find the one Desktop instance that holds this PBIP (pbir desktop list --json).
      2. Validate the Report by its absolute path. The first output line must read
         "Validating Daily Sales", which proves no active pbir connection hijacked the path. Then a
         full validate (--all --json) whose errors must all be on the known-false-positive list below.
         Then the model's offline round trip (validate-model.ps1): the TMDL deserializes, and every
         measure and format string written comes back.
      3. Apply the on-disk model and report: click Desktop's "Apply external changes" banner when
         Desktop has noticed an on-disk change. No banner means Desktop already holds what is on
         disk. If Desktop then asks "Overwrite your unsaved edits", the loop confirms only when
         -OverwriteUnsaved was passed; otherwise it cancels the dialog, changes nothing and fails.
      4. Refresh data inside Desktop (the Home ribbon Refresh button, through UI Automation), wait
         until every partition reports a newer refresh time, fingerprint the data; do it twice. The
         two fingerprints must match (a fixed-formula generator).
      5. Reload the canvas (pbir desktop refresh).
      6. Screenshot every page into -OutDir (pbir desktop screenshot --all). Open the PNGs and look.
      7. Run every check in tieout.json: each evaluates a report expression and an independent
         expression over the fact and date tables, and any difference fails the loop. A blank on
         either side fails too, unless the check sets "blankExpected": true, in which case both
         sides must be blank.

    Every DAX query (the compatibility level, the refresh-completion poll, the fingerprint and the
    tie-out) goes through `pbir model <absolute Report path> -q --json`, which finds the local
    engine of the Desktop instance that has this Report open. `pbir model` takes no --pid; step 1
    has already failed unless exactly one instance holds the PBIP, so the match is unambiguous.
    pbir's JSON output cannot serialize a datetime cell, so the queries never return one: each
    value comes back as flags, text and a number (see Invoke-DaxValues). The fallback, only if
    pbir model -q stops being able to run a query, is the connect-pbid skill's ADOMD route; the
    loop never opens its own connection.

    Two routes are deliberately NOT used. `pbir desktop refresh -m` refuses a model that defines a
    culture, and Desktop writes cultures\en-US.tmdl on its first save. An external TMSL "full"
    refresh over XMLA hangs Desktop once the model has been re-applied from outside: the engine asks
    Desktop's mashup host for a package session it no longer has. See the project LEARNINGS.

    The loop never saves. A data refresh leaves Desktop with unsaved changes, and Desktop marks
    this PBIP as changed as soon as it opens, so the overwrite dialog in step 3 appears on almost
    every run that has something to apply. Pass -OverwriteUnsaved only after checking that nobody
    has canvas work open in that Desktop instance.

.PARAMETER OutDir
    Folder for the all-pages screenshot. Created if missing.

.PARAMETER Suite
    Tie-out suite file. Defaults to tieout.json beside this script.

.PARAMETER SkipScreenshot
    Skip step 6 (for a quick DAX-only rerun).

.PARAMETER OverwriteUnsaved
    Confirm Desktop's "Overwrite your unsaved edits" dialog in step 3, putting the disk copy over
    whatever Desktop holds. Pass it only after checking that nobody has canvas work open in that
    Desktop instance. Without it the loop cancels the dialog and fails, having changed nothing.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$Suite,
    [switch]$SkipScreenshot,
    [switch]$OverwriteUnsaved
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

# ---------------------------------------------------------------------------------------------
# pbir, started as a process rather than through PowerShell's native-command call. Windows
# PowerShell 5.1 does not escape double quotes inside an argument it passes to an .exe, so a DAX
# query such as ROW ( "v", 1 ) would arrive with its quotes stripped. Each argument is quoted here
# by the rules the C runtime uses to split a command line.
$PbirExe = (Get-Command pbir -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
function ConvertTo-ProcessArgument([string]$Value) {
    if ($Value -ne '' -and $Value -notmatch '[\s"]') { return $Value }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    $slashes = 0
    foreach ($ch in $Value.ToCharArray()) {
        if ($ch -eq '\') { $slashes++; continue }
        if ($ch -eq '"') { [void]$sb.Append('\' * (2 * $slashes + 1)).Append('"'); $slashes = 0; continue }
        if ($slashes -gt 0) { [void]$sb.Append('\' * $slashes); $slashes = 0 }
        [void]$sb.Append($ch)
    }
    [void]$sb.Append('\' * (2 * $slashes)).Append('"')
    return $sb.ToString()
}
function Invoke-Pbir([string[]]$Arguments) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $PbirExe
    $psi.Arguments = (@($Arguments | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join ' ')
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $p = [System.Diagnostics.Process]::Start($psi)
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $errTask = $p.StandardError.ReadToEndAsync()
    $p.WaitForExit()
    $out = @($outTask.Result -split "`r?`n")
    $err = @($errTask.Result -split "`r?`n" | Where-Object { $_.Trim() -ne '' })
    return [pscustomobject]@{ Code = $p.ExitCode; Out = $out; Err = $err; Lines = @($out + $err) }
}

# ---------------------------------------------------------------------------------------------
# UI Automation helpers for the running Desktop window (Windows and Desktop only).
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [Windows.Automation.AutomationElement]
function New-Cond($Property, $Value) { New-Object Windows.Automation.PropertyCondition($Property, $Value) }
function Get-DesktopWindows([int]$ProcessId) {
    @($AE::RootElement.FindAll([Windows.Automation.TreeScope]::Children, (New-Cond $AE::ProcessIdProperty $ProcessId)))
}
function Find-Button([int]$ProcessId, [string]$Name, [string]$ClassPattern = '', [string[]]$ExcludeIds = @()) {
    $cond = New-Object Windows.Automation.AndCondition(
        (New-Cond $AE::ControlTypeProperty ([Windows.Automation.ControlType]::Button)),
        (New-Cond $AE::NameProperty $Name))
    foreach ($w in Get-DesktopWindows $ProcessId) {
        foreach ($b in $w.FindAll([Windows.Automation.TreeScope]::Descendants, $cond)) {
            if ($ExcludeIds -contains $b.Current.AutomationId) { continue }
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
if (-not $PbirExe) { Fail 'pbir is not on PATH'; Stop-IfFailed }
$list = Invoke-Pbir @('desktop', 'list', '--json')
try { $instances = (($list.Out -join "`n") | ConvertFrom-Json).instances } catch { $instances = @() }
$mine = @($instances | Where-Object { $_.currentFilePath -and ([IO.Path]::GetFullPath($_.currentFilePath) -eq [IO.Path]::GetFullPath($Pbip)) })
if ($mine.Count -ne 1) {
    Fail "expected exactly one Desktop instance holding $Pbip, found $($mine.Count). Open it with Start-Process on the absolute .pbip path, and check the secure local APIs preview is on"
    Stop-IfFailed
}
$DesktopPid = [int]$mine[0].pid
Pass "PID $DesktopPid holds $Pbip (unsaved changes: $($mine[0].hasUnsavedChanges))"

# ---------------------------------------------------------------------------------------------
Step '2. Validate the Report by absolute path, and the model offline'
$v = Invoke-Pbir @('validate', $Report)
$first = ($v.Lines | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1)
if ($first -ne "Validating $ReportName") { Fail "first validate line was '$first', not 'Validating $ReportName' (a pbir connection may have hijacked the path)" }
elseif ($v.Code -ne 0) { Fail "pbir validate exited $($v.Code)"; $v.Lines | ForEach-Object { Write-Host "    $_" } }
else { Pass "pbir validate: $first, exit 0" }

$va = Invoke-Pbir @('validate', $Report, '--all', '--json')
try { $vj = ($va.Out -join "`n") | ConvertFrom-Json } catch { $vj = $null }
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

# The model's TMDL, round-tripped offline before Desktop sees it (validate-model.ps1 beside this
# script). It runs in its own process, so its TOM assembly never meets this one's.
$rt = Start-Process -FilePath 'powershell' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $Here 'validate-model.ps1')`"") -NoNewWindow -Wait -PassThru
if ($rt.ExitCode -ne 0) { Fail "the offline model round trip failed (validate-model.ps1 exited $($rt.ExitCode))" }
else { Pass 'offline model round trip (validate-model.ps1)' }
Stop-IfFailed

# ---------------------------------------------------------------------------------------------
Step '3. Apply the on-disk model and report in Desktop'
# The overwrite dialog's confirm button is also named "Apply external changes", so the banner
# search skips the dialog's two buttons by AutomationId.
$DialogIds = @('okButton', 'cancelButton')
function Find-Banner { Find-Button $DesktopPid 'Apply external changes' -ExcludeIds $DialogIds }
function Wait-OverwriteDialog([int]$Seconds) {
    for ($i = 0; $i -le $Seconds; $i++) {
        $ok = Find-ById $DesktopPid 'okButton'
        if ($ok) { return $ok }
        if ($i -lt $Seconds) { Start-Sleep -Seconds 1 }
    }
    return $null
}
function Resolve-OverwriteDialog($Ok) {
    if ($OverwriteUnsaved) {
        Invoke-Element $Ok
        Note 'Desktop asked "Overwrite your unsaved edits"; confirmed, because -OverwriteUnsaved was passed'
        return
    }
    $cancel = Find-ById $DesktopPid 'cancelButton'
    if ($cancel) { Invoke-Element $cancel }
    $closed = $false
    for ($i = 0; $i -lt 10 -and -not $closed; $i++) { Start-Sleep -Seconds 1; $closed = -not (Find-ById $DesktopPid 'okButton') }
    if ($closed) { Note 'Desktop asked "Overwrite your unsaved edits"; cancelled it, so Desktop and the disk are as they were' }
    else { Note 'Desktop asked "Overwrite your unsaved edits" and the loop could not cancel it: press Cancel in Desktop' }
    Note 'Desktop marks this PBIP as changed as soon as it opens, and every seam run leaves a data refresh unsaved, so this dialog appears even when nobody has touched the canvas.'
    Note 'If nobody has canvas work open in this Desktop instance (an agent build, or a Desktop that has only been opened), rerun with -OverwriteUnsaved.'
    Note 'If someone does, decide first which copy wins: saving from Desktop writes over the on-disk edits waiting to be applied, and -OverwriteUnsaved discards the canvas work.'
    Fail 'Desktop holds unsaved changes and -OverwriteUnsaved was not passed; nothing was applied'
    Stop-IfFailed
}

$applying = $false
$ok = Find-ById $DesktopPid 'okButton'
if ($ok) {
    # A dialog left open by an earlier click is answered the same way, and nothing is clicked again.
    Note 'an "Overwrite your unsaved edits" dialog was already open'
    Resolve-OverwriteDialog $ok
    $applying = $true
} else {
    $banner = $null
    for ($i = 0; $i -lt 6 -and -not $banner; $i++) {
        $banner = Find-Banner
        if (-not $banner) { Start-Sleep -Seconds 2 }
    }
    if (-not $banner) {
        Pass 'no "Apply external changes" banner: Desktop already holds the on-disk model and report'
    } else {
        Invoke-Element $banner
        Note 'clicked Apply external changes'
        # With unsaved edits in Desktop a confirm dialog ("Overwrite your unsaved edits") follows.
        $ok = Wait-OverwriteDialog 8
        if ($ok) { Resolve-OverwriteDialog $ok }
        $applying = $true
    }
}
if ($applying) {
    $gone = $false
    for ($i = 0; $i -lt 90 -and -not $gone; $i++) { Start-Sleep -Seconds 2; $gone = -not (Find-Banner) }
    if (-not $gone) { Fail 'the Apply external changes banner did not clear within 3 minutes; look at Desktop for a dialog'; Stop-IfFailed }
    Start-Sleep -Seconds 5
    Pass 'on-disk model and report applied'
}

# ---------------------------------------------------------------------------------------------
# DAX through pbir model -q, against the engine of the Desktop instance that has $Report open.
function ConvertTo-Dax($Expr) { if ($Expr -is [array]) { return ($Expr -join "`n") } else { return [string]$Expr } }
function Get-Col($Row, [string]$Name) {
    $p = $Row.PSObject.Properties | Where-Object { $_.Name -eq $Name -or $_.Name -eq "[$Name]" } | Select-Object -First 1
    if ($p) { return $p.Value } else { return $null }
}
function Invoke-DaxQuery([string]$Query) {
    $r = Invoke-Pbir @('model', $Report, '-q', $Query, '--json')
    if ($r.Code -ne 0) { throw ("pbir model -q exited {0}: {1}" -f $r.Code, ($r.Err -join ' ')) }
    # Windows PowerShell 5.1's ConvertFrom-Json emits a JSON array as one object, so @() around the
    # pipeline would nest it; unroll it from a variable instead.
    $parsed = ($r.Out -join "`n") | ConvertFrom-Json
    return ,@($parsed)
}
# Evaluates scalar DAX expressions in one query. pbir's JSON output fails on a datetime cell, so
# each value comes back as flags (blank, logical, text), its text form and, for a number or a
# date, a double. A date is told from a number by its text form, which is not a plain number.
function Invoke-DaxValues([object[]]$Exprs) {
    $vars = for ($i = 0; $i -lt $Exprs.Count; $i++) { "VAR __v$i =`n    ( $(ConvertTo-Dax $Exprs[$i]) )" }
    $cols = for ($i = 0; $i -lt $Exprs.Count; $i++) {
        "`"b$i`", ISBLANK ( __v$i ), `"l$i`", ISLOGICAL ( __v$i ), `"x$i`", ISTEXT ( __v$i ), `"t$i`", __v$i & `"`", `"n$i`", IF ( ISNUMBER ( __v$i ), CONVERT ( __v$i, DOUBLE ) )"
    }
    $query = "EVALUATE`n" + ($vars -join "`n") + "`nRETURN`n    ROW (`n        " + ($cols -join ",`n        ") + "`n    )"
    $rows = Invoke-DaxQuery $query
    if ($rows.Count -ne 1) { throw "expected one row, got $($rows.Count)" }
    $row = $rows[0]
    for ($i = 0; $i -lt $Exprs.Count; $i++) {
        $t = Get-Col $row "t$i"; $n = Get-Col $row "n$i"
        $kind = 'unknown'; $num = 0.0
        if (Get-Col $row "b$i") { $kind = 'blank' }
        elseif (Get-Col $row "l$i") { $kind = 'bool' }
        elseif (Get-Col $row "x$i") { $kind = 'text' }
        elseif ($null -ne $n) {
            $parsed = 0.0
            if ([double]::TryParse([string]$t, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) { $kind = 'number' } else { $kind = 'datetime' }
            $num = [double]$n
        }
        [pscustomobject]@{ Kind = $kind; Text = [string]$t; Number = $num }
    }
}
function Format-DaxValue($V) {
    switch ($V.Kind) {
        'blank' { return '(blank)' }
        'bool' { return $V.Text.ToLower() }
        'number' { return $V.Number.ToString('R', [Globalization.CultureInfo]::InvariantCulture) }
        'datetime' {
            $d = [DateTime]::FromOADate($V.Number)
            if ($d.TimeOfDay.Ticks -eq 0) { return $d.ToString('yyyy-MM-dd') } else { return $d.ToString('s') }
        }
        default { return $V.Text }
    }
}
# Returns '' when the two values agree, otherwise the reason they do not.
function Compare-DaxValues($A, $B, [double]$Tolerance, [bool]$BlankExpected) {
    if ($BlankExpected) {
        if ($A.Kind -eq 'blank' -and $B.Kind -eq 'blank') { return '' }
        return 'the check expects blank on both sides'
    }
    if ($A.Kind -eq 'blank' -and $B.Kind -eq 'blank') { return 'blank on both sides; a blank passes only in a check that sets blankExpected' }
    if ($A.Kind -eq 'blank') { return 'blank on the report side' }
    if ($B.Kind -eq 'blank') { return 'blank on the independent side' }
    $numeric = @('number', 'datetime')
    if (($numeric -contains $A.Kind) -and ($numeric -contains $B.Kind)) {
        if ([math]::Abs($A.Number - $B.Number) -le $Tolerance) { return '' } else { return 'values differ' }
    }
    if ($A.Kind -ne $B.Kind) { return "types differ ($($A.Kind) and $($B.Kind))" }
    if ($A.Text -ceq $B.Text) { return '' } else { return 'values differ' }
}
function Get-PartitionTimes {
    $rows = Invoke-DaxQuery 'EVALUATE ROW ( "n", COUNTROWS ( INFO.PARTITIONS () ), "oldest", MINX ( INFO.PARTITIONS (), CONVERT ( [RefreshedTime], DOUBLE ) ), "newest", MAXX ( INFO.PARTITIONS (), CONVERT ( [RefreshedTime], DOUBLE ) ) )'
    $r = $rows[0]
    return [pscustomobject]@{ Count = [int](Get-Col $r 'n'); Oldest = [double](Get-Col $r 'oldest'); Newest = [double](Get-Col $r 'newest') }
}

$suiteJson = Get-Content -LiteralPath $Suite -Raw -Encoding UTF8 | ConvertFrom-Json
function Get-Fingerprint {
    $prints = @($suiteJson.fingerprint)
    $values = @(Invoke-DaxValues @($prints | ForEach-Object { , $_.expr }))
    $parts = for ($i = 0; $i -lt $prints.Count; $i++) { "$($prints[$i].name)=$(Format-DaxValue $values[$i])" }
    return ($parts -join '; ')
}

# ---------------------------------------------------------------------------------------------
Step '4. Refresh data in Desktop, twice (DAX through pbir model -q)'
$catalog = (Invoke-DaxQuery 'SELECT [COMPATIBILITY_LEVEL] FROM $SYSTEM.DBSCHEMA_CATALOGS')[0]
$compat = [int](Get-Col $catalog 'COMPATIBILITY_LEVEL')
if ($compat -ge 1702) { Pass "compatibility level $compat" } else { Fail "compatibility level $compat is below 1702" }

$prints = @()
foreach ($n in 1, 2) {
    $before = (Get-PartitionTimes).Newest
    $button = Find-Button $DesktopPid 'Refresh' 'splitPrimaryButton'
    if (-not $button) { Fail 'the Home ribbon Refresh button was not found; is Desktop in Report view?'; Stop-IfFailed }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Invoke-Element $button
    $done = $false
    while (-not $done -and $sw.Elapsed.TotalSeconds -lt 300) {
        Start-Sleep -Seconds 2
        try {
            $times = Get-PartitionTimes
            $done = ($times.Count -gt 0) -and ($times.Oldest -gt $before)
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
    $blankExpected = [bool]($c.PSObject.Properties['blankExpected'] -and $c.blankExpected)
    try {
        $values = @(Invoke-DaxValues @((, $c.report) + (, $c.independent)))
        $a = $values[0]; $b = $values[1]
        $line = "$($c.name): report $(Format-DaxValue $a), independent $(Format-DaxValue $b)"
        $why = Compare-DaxValues $a $b $tol $blankExpected
        if ($why -eq '') {
            if ($blankExpected) { $line += ' (blank expected)' }
            Pass $line
        } else { Fail "$line ($why)" }
    } catch {
        Fail "$($c.name): query error: $($_.Exception.Message)"
    }
}
Stop-IfFailed

Write-Host ''
Write-Host 'SEAM PASSED' -ForegroundColor Green
exit 0
