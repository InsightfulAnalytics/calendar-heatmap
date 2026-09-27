"""Embed the Template and the Report's own Deneb specs into every Deneb visual of the Report.

Each Calendar is the Template (template/calendar-heatmap/) written by the harness's
`npm run template` with that Calendar's own field names and settings, so every Calendar carries
the same Template revision and differs only in the settings listed here. The KPI strip, Sales by
month, Top days and Day summary's week are the specs in report/specs/. Embedding goes through the deneb-pbir skill's
deneb_spec.py, which keeps the legacy container signal names Deneb 1.9 needs. Run after any
Template or spec change:

    py report/embed.py

Set DENEB_SPEC to move deneb_spec.py.
"""
import json
import os
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
HARNESS = HERE.parent / 'harness'
PAGES = HERE / 'Daily Sales.Report' / 'definition' / 'pages'
OUT = HARNESS / 'out' / 'embed'
DENEB_SPEC = os.environ.get('DENEB_SPEC', str(Path.home() / '.claude/skills/custom-visuals/skills/deneb-pbir/scripts/deneb_spec.py'))

FONT = 'Arial, Segoe UI, Helvetica Neue, sans-serif'
REPORT = ['windowMode=fiscal', 'fiscalStartMonth=7', 'everyDateHasRow=true']

# (page, visual) -> (field mappings, settings beyond the Report-wide ones)
CALENDARS = {
    ('dailyOverview', 'calendar'): ([], []),
    ('dailyOverview', 'supportCalendar'): (['__1__=Total Tickets'], ['titleText=Support tickets', 'cellShape=square', 'showLegend=false']),
    ('dailyOverview', 'webCalendar'): (['__1__=Total Sessions'], ['titleText=Web sessions', 'gapRatio=0.1', 'showLegend=false']),
    ('targets', 'targetCalendar'): ([], ['titleText=Sales against target', 'targetField=Total Target']),
}
# Every region keeps its legend, so the four Calendars are the same size
for region in ['North', 'South', 'EMEA', 'APAC']:
    CALENDARS[('byRegion', f'cal{region}')] = ([], [f'titleText={region}', 'scaleField=Region Scale Max'])

SPECS = {
    ('dailyOverview', 'kpiStrip'): 'kpi-strip.json',
    ('dailyOverview', 'salesByMonth'): 'sales-by-month.json',
    ('dailyOverview', 'topDays'): 'top-days.json',
    ('daySummary', 'weekSummary'): 'day-summary.json',
}


def run(args, cwd=None):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, shell=(os.name == 'nt' and args[0] == 'npm'))
    if result.returncode:
        raise SystemExit(f'{" ".join(args)} failed:\n{result.stdout}\n{result.stderr}')
    return result.stdout


def embed(page, visual, spec, config):
    target = PAGES / page / 'visuals' / visual / 'visual.json'
    run(['py', DENEB_SPEC, 'embed', str(target), '--spec', str(spec), '--config', str(config)])
    backup = target.with_name('visual.json.bak')
    if backup.exists():
        backup.unlink()
    print(f'embedded {page}/{visual}')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    config = OUT / 'config.json'
    report_config = OUT / 'report-config.json'
    for (page, visual), (fields, settings) in CALENDARS.items():
        spec = OUT / f'{visual}.json'
        args = ['npm', 'run', '-s', 'template', '--', '--out', str(spec), '--config-out', str(config)]
        for field in fields:
            args += ['--field', field]
        for option in REPORT + settings:
            args += ['--option', option]
        run(args, cwd=HARNESS)
        # The Report's font is the theme's Arial, first in the stack; the Template's own default stays Segoe UI
        cfg = json.loads(config.read_text(encoding='utf-8'))
        cfg['font'] = FONT
        cfg.setdefault('text', {})['font'] = FONT
        report_config.write_text(json.dumps(cfg, indent=2), encoding='utf-8')
        embed(page, visual, spec, report_config)
    for (page, visual), name in SPECS.items():
        embed(page, visual, HERE / 'specs' / name, report_config)
