"""Render the prototype in headless Edge with vega 6.4.0's browser bundle, in the BI Nexus theme.

Why a browser: render.mjs has no canvas package, so Vega estimates text widths and librsvg picks
the fonts. A browser measures text and resolves Segoe UI weights the way Deneb does inside Power
BI. It also lets the interaction wiring run: pbiCrossFilterApply / pbiCrossFilterClear are
shimmed to record their arguments, then a mouse drag, a click, a right click and a background
click are replayed and each recorded filter is evaluated against the dataset.

pbiColor is shimmed from theme/bi-nexus.json with the same shade maths as the Deneb repo's
tools/check-templates.mjs. None of this is Power BI's own host.

Usage: py browser_render.py [width height]   (default 1080 362, the target card's size)
Writes render-bi-nexus.png and render-bi-nexus-drag.png (suffixed when a size is given).
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

here = Path(__file__).parent
project = here.parent
VEGA = Path(r"B:\VS Code Files\PBI_Agentic_Dev\plugins\custom-visuals\skills\deneb-pbir\renderer\node_modules\vega\build\vega.min.js")
theme = json.loads((project / "theme" / "bi-nexus.json").read_text(encoding="utf-8"))
theme_js = json.dumps({k: theme[k] for k in ("dataColors", "good", "bad", "neutral", "minimum", "center", "maximum")})
spec = json.loads((here / "_render-spec.json").read_text(encoding="utf-8"))
rows = json.loads((here / "sample-data.json").read_text(encoding="utf-8"))
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1080, 362)
SUFFIX = "" if (W, H) == (1080, 362) else f"-{W}x{H}"
spec["signals"] = [{"name": "pbiContainerWidth", "value": W}, {"name": "pbiContainerHeight", "value": H}] + spec["signals"]

html = f"""<!doctype html><html><head><meta charset="utf-8">
<style>html,body{{margin:0;background:#fff}} #vis{{width:{W}px;height:{H}px}}</style>
<script>{VEGA.read_text(encoding="utf-8")}</script></head><body><div id="vis"></div>
<script>
window.__calls = [];
const THEME = {theme_js};
const shade = (hex, pct) => {{
  const n = parseInt(hex.slice(1), 16);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map(c => Math.round(pct >= 0 ? c + (255 - c) * pct : c * (1 + pct)))
    .map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}};
vega.expressionFunction('pbiColor', (which, pct = 0) => {{
  const named = {{good: THEME.good, bad: THEME.bad, neutral: THEME.neutral, min: THEME.minimum, middle: THEME.center, max: THEME.maximum}};
  const base = typeof which === 'number' ? THEME.dataColors[which % THEME.dataColors.length] : (named[which] || THEME.dataColors[1]);
  return pct ? shade(base, pct) : base;
}});
vega.expressionFunction('pbiFormat', (v, f) => v == null ? '' : new Intl.NumberFormat('en-US', {{maximumFractionDigits: 0}}).format(v));
vega.expressionFunction('pbiFormatAutoUnit', (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(2) + 'K' : String(v)));
vega.expressionFunction('pbiCrossFilterApply', (event, filter, options) => {{ window.__calls.push({{fn: 'apply', type: event && event.type, button: event && event.button, filter, options}}); return {{}}; }});
vega.expressionFunction('pbiCrossFilterClear', () => {{ window.__calls.push({{fn: 'clear'}}); return {{}}; }});
const spec = {json.dumps(spec)};
const rows = {json.dumps(rows)}.map(r => ({{...r, Date: new Date(r.Date)}}));
spec.data[0].values = rows;
window.__view = new vega.View(vega.parse(spec), {{renderer: 'svg', container: '#vis', hover: true}});
window.__ready = window.__view.runAsync().then(() => true);
</script></body></html>"""
page_path = here / "_browser.html"
page_path.write_text(html, encoding="utf-8")

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    pg.goto(page_path.as_uri())
    pg.wait_for_function("window.__ready")
    pg.wait_for_timeout(300)
    pg.locator("#vis").screenshot(path=str(here / f"render-bi-nexus{SUFFIX}.png"))
    print("palette", pg.evaluate("window.__view.signal('palette')"))

    # interaction replay: find cells by scenegraph position, drag between two of them
    cells = pg.evaluate("""() => {
      const items = window.__view.scenegraph().root.items[0].items.find(m => m.name === 'cell').items;
      const pick = k => { const it = items.find(i => i.datum.key === k); return {x: it.x + it.width / 2, y: it.y + it.height / 2}; };
      return {a: pick('2025-07-07'), b: pick('2025-08-20'), peak: pick('2025-12-17'), other: pick('2025-03-12')};
    }""")
    pg.mouse.move(cells["a"]["x"], cells["a"]["y"])
    pg.mouse.down()
    for f in (0.3, 0.6, 1.0):
        pg.mouse.move(cells["a"]["x"] + (cells["b"]["x"] - cells["a"]["x"]) * f, cells["a"]["y"] + (cells["b"]["y"] - cells["a"]["y"]) * f, steps=6)
    pg.wait_for_timeout(150)
    pg.locator("#vis").screenshot(path=str(here / f"render-bi-nexus-drag{SUFFIX}.png"))
    pg.mouse.up()
    pg.wait_for_timeout(100)
    pg.mouse.click(cells["peak"]["x"], cells["peak"]["y"])          # single day
    pg.wait_for_timeout(100)
    pg.mouse.click(cells["other"]["x"], cells["other"]["y"], button="right")  # must NOT filter
    pg.wait_for_timeout(100)
    pg.mouse.click(W / 2, 6)                                         # background: clear
    pg.wait_for_timeout(100)
    calls = pg.evaluate("window.__calls")
    for c in calls:
        if c.get("filter"):
            c["matchedRows"] = pg.evaluate("""(f) => {
              const pred = new Function('datum', 'toDate', 'time', 'inrange',
                'return ' + f.replace(/datum\\["Date"\\]/g, 'datum.Date'));
              const toDate = d => d instanceof Date ? d : new Date(d);
              const time = d => new Date(d).getTime();
              const inrange = (v, r) => v >= Math.min(...r) && v <= Math.max(...r);
              const hit = window.__view.data('dataset').filter(r => pred(r, toDate, time, inrange));
              return {n: hit.length, first: hit.length ? hit[0].Date.toISOString() : null, last: hit.length ? hit[hit.length - 1].Date.toISOString() : null};
            }""", c["filter"])
    print(json.dumps(calls, indent=1))
    b.close()
