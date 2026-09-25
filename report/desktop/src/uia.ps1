<#
.SYNOPSIS
    UI Automation actions on a running Power BI Desktop process, for the Desktop driver
    (desktop.ts). Windows PowerShell 5.1.

.DESCRIPTION
    -Action save   Invoke the Button with AutomationId "save" that is on screen and enabled (the
                   title bar Save). The caller waits for the save to finish.
    -Action close  Close the main window, answer the save prompt with "Don't save", and wait up
                   to -TimeoutSeconds for the process to exit. It never kills the process: a hung
                   close is reported and the script exits 1.

    Prints one JSON line: {"ok": true|false, "detail": "..."}.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('save', 'close')][string]$Action,
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [int]$TimeoutSeconds = 120
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [Windows.Automation.AutomationElement]
function New-Cond($Property, $Value) { New-Object Windows.Automation.PropertyCondition($Property, $Value) }
function Get-Windows { @($AE::RootElement.FindAll([Windows.Automation.TreeScope]::Children, (New-Cond $AE::ProcessIdProperty $ProcessId))) }
function Out-Result([bool]$Ok, [string]$Detail) {
    ([pscustomobject]@{ ok = $Ok; detail = $Detail } | ConvertTo-Json -Compress)
    if ($Ok) { exit 0 } else { exit 1 }
}
function Find-Buttons([scriptblock]$Match) {
    $cond = New-Cond $AE::ControlTypeProperty ([Windows.Automation.ControlType]::Button)
    foreach ($w in Get-Windows) {
        foreach ($b in $w.FindAll([Windows.Automation.TreeScope]::Descendants, $cond)) {
            if (& $Match $b) { $b }
        }
    }
}
function Invoke-Element($Element) { $Element.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke() }

$proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
if (-not $proc) { Out-Result $false "no process $ProcessId" }

if ($Action -eq 'save') {
    $save = @(Find-Buttons { param($b) $b.Current.AutomationId -eq 'save' -and $b.Current.IsEnabled -and -not $b.Current.IsOffscreen }) | Select-Object -First 1
    if (-not $save) { Out-Result $false 'no enabled, on-screen Button with AutomationId save' }
    Invoke-Element $save
    Out-Result $true 'invoked save'
}

# close. Desktop's save prompt ("Do you want to save your changes?") is an MSHTML page (an
# "Internet Explorer_Server" child window) whose buttons UI Automation cannot see, so it is answered
# through the page's own DOM (WM_HTML_GETOBJECT): the element with role button reading Don't save.
# The close itself is tried first through the window's WindowPattern, then through the title bar's
# Close button (HTML inside each view's WebView, class "windowControl closeButton"), each attempt
# given a few seconds to raise the prompt or end the process.
Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class DesktopWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint RegisterWindowMessage(string s);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("oleacc.dll")] public static extern int ObjectFromLresult(IntPtr r, ref Guid iid, IntPtr w, [MarshalAs(UnmanagedType.IDispatch)] out object o);
  public static List<IntPtr> ChildrenOfClass(int pid, string cls) {
    var hits = new List<IntPtr>();
    EnumWindows((top, l) => {
      uint p; GetWindowThreadProcessId(top, out p);
      if (p == pid) EnumChildWindows(top, (c, l2) => { var sb = new StringBuilder(256); GetClassName(c, sb, 256); if (sb.ToString() == cls) hits.Add(c); return true; }, IntPtr.Zero);
      return true;
    }, IntPtr.Zero);
    return hits;
  }
}
"@
function Get-PromptButton([string]$Text) {
    $msg = [DesktopWin]::RegisterWindowMessage('WM_HTML_GETOBJECT')
    foreach ($h in [DesktopWin]::ChildrenOfClass($ProcessId, 'Internet Explorer_Server')) {
        $res = [IntPtr]::Zero
        [void][DesktopWin]::SendMessageTimeout($h, $msg, [IntPtr]::Zero, [IntPtr]::Zero, 2, 2000, [ref]$res)
        if ($res -eq [IntPtr]::Zero) { continue }
        $iid = [Guid]'626FC520-A41E-11CF-A731-00A0C9082637'
        $doc = $null
        if ([DesktopWin]::ObjectFromLresult($res, [ref]$iid, [IntPtr]::Zero, [ref]$doc) -ne 0 -or -not $doc) { continue }
        $all = $doc.all
        for ($i = 0; $i -lt $all.length; $i++) {
            $e = $all.item($i)
            if ($e.getAttribute('role') -eq 'button' -and ([string]$e.innerText).Trim() -match $Text) { return $e }
        }
    }
    return $null
}

$closeButtons = @(Find-Buttons { param($b) $b.Current.ClassName -match 'closeButton' -and $b.Current.IsEnabled -and -not $b.Current.IsOffscreen })
# Attempt 0 is the window's WindowPattern.Close; attempt i is title bar Close button i - 1.
$attempts = 1 + $closeButtons.Count
$answered = $false
$sw = [Diagnostics.Stopwatch]::StartNew()
$next = 0
$nextAt = 0
while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        $via = if ($next -le 1) { 'WindowPattern.Close' } else { "title bar Close button $($next - 1)" }
        if ($answered) { Out-Result $true "closed through $via, after answering Don't save" } else { Out-Result $true "closed through $via, with no save prompt" }
    }
    if (-not $answered) {
        $dont = Get-PromptButton "^Don.t save$"
        if ($dont) { $dont.click(); $answered = $true }
        elseif ($next -lt $attempts -and $sw.Elapsed.TotalSeconds -ge $nextAt) {
            try {
                if ($next -eq 0) { @(Get-Windows)[0].GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern).Close() }
                else { Invoke-Element $closeButtons[$next - 1] }
            } catch { }
            $next++
            $nextAt = $sw.Elapsed.TotalSeconds + 8
        }
    }
    Start-Sleep -Milliseconds 700
}
Out-Result $false "process $ProcessId still running after $TimeoutSeconds s; it was not killed"
