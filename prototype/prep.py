"""Merge config.json into the spec for the offline render (Deneb applies jsonConfig itself;
render.mjs has no --config flag). Paints a white background so the PNG reads like the
Power BI visual container. Optional argv[1]: a JSON object of signal values to preset
(used to preview the drag-select state, which the offline render cannot exercise)."""
import json
import sys
from pathlib import Path

here = Path(__file__).parent
spec = json.loads((here / "calendar-heatmap.json").read_text(encoding="utf-8"))
config = json.loads((here / "config.json").read_text(encoding="utf-8"))
config["background"] = "#ffffff"
spec["config"] = config
out = here / "_render-spec.json"
if len(sys.argv) > 1:
    preset = json.loads(sys.argv[1])
    for s in spec["signals"]:
        if s["name"] in preset:
            s.pop("on", None)
            s.pop("update", None)
            s["value"] = preset[s["name"]]
    out = here / "_render-spec-preset.json"
out.write_text(json.dumps(spec, indent=1), encoding="utf-8")
print(out)
