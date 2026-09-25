"""Stack the renders for side-by-side review: the site's card (target_card.png, local only), the
earlier render in the site's purple, then the BI Nexus render. Writes compare.png (local only,
because it contains the site capture)."""
from pathlib import Path
from PIL import Image, ImageDraw

here = Path(__file__).parent
panels = [
    ("Target: the site's card (local capture, not committed)", "target_card.png"),
    ("Prototype in the site's purple (first pass)", "render-lumeric-purple.png"),
    ("Prototype in the BI Nexus theme (shades of theme colour 1)", "render-bi-nexus.png"),
]
shots = [(label, Image.open(here / f).convert("RGB")) for label, f in panels if (here / f).exists()]
w = max(s.width for _, s in shots)
band = 26
out = Image.new("RGB", (w, sum(s.height + band for _, s in shots)), "#ffffff")
draw = ImageDraw.Draw(out)
y = 0
for label, s in shots:
    draw.rectangle([0, y, w, y + band], fill="#e2e8f0")
    draw.text((10, y + 7), label, fill="#0b1e3f")
    out.paste(s, (0, y + band))
    y += band + s.height
out.save(here / "compare.png")
print(here / "compare.png")
