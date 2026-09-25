"""Synthetic daily sales for calendar 2025, shaped like the Lumeric hero heatmap.

Weekdays high and rising to a December peak, weekends low, ~75 blank days.
Writes sample-data.csv (Date, Sales; blank Sales = null) and sample-data.json
(the rows the offline renderer feeds to the Deneb `dataset`). Weekend blanks are
missing rows; the three holiday blanks are rows with a null Sales, so the spec is
exercised on both kinds of empty day.
"""
import csv
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).parent
random.seed(7)

start = date(2025, 1, 1)
days = [start + timedelta(i) for i in range(365)]
weekend = [d for d in days if d.weekday() >= 5]
holidays = {date(2025, 1, 1), date(2025, 12, 25), date(2025, 12, 26)}

# 72 of the 104 weekend days are blank (no row); 32 carry a small value
blank_weekend = set(random.sample(weekend, 72))
PEAK = date(2025, 12, 17)  # a Wednesday, so the ring lands on the W row like the target

raw = {}
for i, d in enumerate(days):
    if d in holidays or d in blank_weekend:
        continue
    t = i / 364
    if d.weekday() >= 5:
        raw[d] = random.uniform(500, 2600) * (0.8 + 0.5 * t)
    else:
        base = 2700 + 5900 * t ** 1.35
        season = 1 + 0.06 * math.sin(2 * math.pi * (t * 4))
        raw[d] = base * season * random.lognormvariate(0, 0.16)

# scale weekdays so the year totals 1.33M, then plant the peak
TARGET = 1_330_000
weekday_keys = [d for d in raw if d.weekday() < 5 and d != PEAK]
weekend_sum = sum(v for d, v in raw.items() if d.weekday() >= 5)
peak_val = 11_620.0
k = (TARGET - weekend_sum - peak_val) / sum(raw[d] for d in weekday_keys)
for d in weekday_keys:
    raw[d] = min(raw[d] * k, 10_900.0)
raw[PEAK] = peak_val
# absorb the rounding and the cap into a mid-year weekday so the total is exact
drift = TARGET - sum(raw.values())
raw[date(2025, 6, 11)] += drift

rows = []
for d in days:
    if d in blank_weekend:
        continue  # no row at all: the spec must still draw the day
    v = raw.get(d)
    rows.append({"Date": d.isoformat(), "Sales": None if v is None else round(v, 2)})

with open(OUT / "sample-data.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Date", "Sales"])
    for r in rows:
        w.writerow([r["Date"], "" if r["Sales"] is None else f'{r["Sales"]:.2f}'])

# renderer rows: local-midnight date-times, the closest offline stand-in for a Power BI date
json_rows = [{"Date": r["Date"] + "T00:00:00", "Sales": r["Sales"], "__row__": i} for i, r in enumerate(rows)]
(OUT / "sample-data.json").write_text(json.dumps(json_rows), encoding="utf-8")

vals = [r["Sales"] for r in rows if r["Sales"] is not None]
mx = max(vals)
bins = [0] * 5
for v in vals:
    bins[min(4, int(v / (mx / 5)))] += 1
print(f"rows={len(rows)} blank={365 - len(vals)} total={sum(vals):,.0f} max={mx:,.0f} bins(equal interval)={bins}")
