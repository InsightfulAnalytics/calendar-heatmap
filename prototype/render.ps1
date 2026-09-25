# Render the calendar heatmap prototype.
# 1. prep.py merges config.json into _render-spec.json (render.mjs has no --config flag).
# 2. render.mjs parses and draws it under Deneb 1.9 and 2.0 rules (a parse check; its pbiColor
#    stub is the Power BI default theme, so its colours are not BI Nexus).
# 3. browser_render.py renders render-bi-nexus.png in headless Edge with the BI Nexus theme and
#    replays a drag, a click, a right click and a clear.
# 4. compare.py stacks the site card, the purple render and the BI Nexus render into compare.png.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$renderer = "B:\VS Code Files\PBI_Agentic_Dev\plugins\custom-visuals\skills\deneb-pbir\renderer\render.mjs"
py "$here\prep.py" | Out-Null
foreach ($v in "1.9", "2.0") {
  node $renderer "$here\_render-spec.json" "$here\_check-$v.png" `
    --data "$here\sample-data.json" --provider vega --width 1080 --height 362 --scale 1 --deneb $v
}
py "$here\browser_render.py"
py "$here\compare.py" | Out-Null
