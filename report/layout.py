"""Apply the Report frame's positions and container formatting to visual.json files.

pbir 0.9.32 refuses container objects (background, border, title, drop shadow) on the Deneb
custom visual and refuses to move visuals past ones it has not moved yet, so the frame is written
here, from one table, and checked with `pbir validate` afterwards. Run from any folder:

    py report/layout.py

Every run rewrites the same properties to the same values, so it is safe to repeat.
"""
import json
from pathlib import Path

PAGES = Path(__file__).parent / 'Daily Sales.Report' / 'definition' / 'pages'

WHITE, CARD_BORDER, INK = '#FFFFFF', '#E2E8F0', '#0B1E3F'

# page folder -> visual name -> (x, y, width, height, style)
# style: 'card' = white rounded card, 'bare' = no background or border, None = leave formatting alone
LAYOUT = {
    'dailyOverview': {
        'kpiStrip': (216, 80, 1048, 128, 'bare'),
        'calendar': (216, 224, 1048, 300, 'shadowCard'),
        'supportCalendar': (216, 540, 640, 200, 'card'),
        'salesByMonth': (872, 540, 392, 200, 'card'),
        'webCalendar': (216, 756, 640, 200, 'card'),
        'topDays': (872, 756, 392, 200, 'card'),
    },
    'byRegion': {
        'calNorth': (216, 80, 1048, 212, 'card'),
        'calSouth': (216, 300, 1048, 212, 'card'),
        'calEMEA': (216, 520, 1048, 212, 'card'),
        'calAPAC': (216, 740, 1048, 212, 'card'),
    },
    'targets': {
        'targetCalendar': (216, 80, 1048, 320, 'card'),
        'daysOnTarget': (216, 416, 250, 120, 'card'),
        'daysShort': (482, 416, 250, 120, 'card'),
        'meanDay': (748, 416, 250, 120, 'card'),
        'meanTarget': (1014, 416, 250, 120, 'card'),
    },
}

# The frame every visible page shares: rail, top bar and their contents. Everything in the rail
# starts at the same left edge (RAIL_X) and every slicer is the same width.
RAIL_X, RAIL_W = 12, 176
FRAME = {
    'rail': (0, 0, 200, 968, None),
    'topBar': (200, 0, 1080, 64, None),
    'titleText': (216, 10, 760, 44, None),
    'regionSlicer': (1064, 14, 192, 36, 'pill'),
    'navDaily': (RAIL_X, 100, RAIL_W, 32, None),
    'navRegion': (RAIL_X, 136, RAIL_W, 32, None),
    'navTargets': (RAIL_X, 172, RAIL_W, 32, None),
    'dateSlicer': (RAIL_X, 252, RAIL_W, 72, 'bare'),
    'fySlicer': (RAIL_X, 380, RAIL_W, 36, 'bare'),
    'channelSlicer': (RAIL_X, 448, RAIL_W, 36, 'bare'),
}
for _page in ('dailyOverview', 'byRegion', 'targets'):
    LAYOUT[_page] = {**FRAME, **LAYOUT[_page]}

# Calendars whose day hover shows the Day summary page (pbir's tooltip command has no page option
# and refuses the Deneb visual). Canvas is the enum value meaning "report page".
CANVAS_TOOLTIP = {
    'dailyOverview': ['calendar', 'supportCalendar', 'webCalendar'],
    'byRegion': ['calNorth', 'calSouth', 'calEMEA', 'calAPAC'],
    'targets': ['targetCalendar'],
}
TOOLTIP_PAGE = 'daySummary'

# Alt text per Deneb visual: the copies otherwise keep the sales Calendar's
ALT_TEXT = {
    'dailyOverview': {
        'calendar': 'Calendar: daily sales for the year, one cell per day',
        'supportCalendar': 'Calendar: daily support tickets for the year, one cell per day',
        'webCalendar': 'Calendar: daily web sessions for the year, one cell per day',
        'kpiStrip': 'KPI cards: total, mean per day, peak day and active days',
        'salesByMonth': 'Sales by month, July to June',
        'topDays': 'Top days: the five best days',
    },
    'byRegion': {f'cal{r}': f'Calendar: daily sales for {r}, on the scale shared by every region' for r in ['North', 'South', 'EMEA', 'APAC']},
    'targets': {'targetCalendar': 'Calendar: each day coloured by whether its sales met the daily target'},
}

# The page list in the rail: one button per visible page, the current page's in ink
NAV = [('navDaily', 'Daily overview', 'dailyOverview'), ('navRegion', 'By region', 'byRegion'), ('navTargets', 'Targets', 'targets')]


def lit(value):
    if isinstance(value, bool):
        text = 'true' if value else 'false'
    elif isinstance(value, (int, float)):
        text = f'{value}D'
    else:
        text = "'" + str(value).replace("'", "''") + "'"
    return {'expr': {'Literal': {'Value': text}}}


def colour(hex_):
    return {'solid': {'color': lit(hex_)}}


def container(style):
    objects = {
        'title': [{'properties': {'show': lit(False)}}],
    }
    if style in ('card', 'shadowCard', 'pill'):
        radius = 20 if style == 'pill' else 12
        objects['background'] = [{'properties': {'show': lit(True), 'color': colour(WHITE), 'transparency': lit(0)}}]
        objects['border'] = [{'properties': {'show': lit(True), 'color': colour(CARD_BORDER), 'width': lit(1), 'radius': lit(radius)}}]
        objects['dropShadow'] = [{'properties': {'show': lit(style == 'shadowCard')}}]
    elif style == 'bare':
        objects['background'] = [{'properties': {'show': lit(False)}}]
        objects['border'] = [{'properties': {'show': lit(False)}}]
        objects['dropShadow'] = [{'properties': {'show': lit(False)}}]
    return objects


# page folder -> textbox name -> (x, y, width, height, text, font size, colour, bold)
SECTION = (9, '#64748B', True)
FIELD = (9, '#64748B', False)
_RAIL_LABELS = {
    'labelPages': (RAIL_X, 72, RAIL_W, 24, 'PAGES', *SECTION),
    'labelDateRange': (RAIL_X, 224, RAIL_W, 24, 'DATE RANGE', *SECTION),
    'labelFilters': (RAIL_X, 336, RAIL_W, 24, 'FILTERS', *SECTION),
    'labelYear': (RAIL_X, 356, RAIL_W, 24, 'Fiscal year', *FIELD),
    'labelChannel': (RAIL_X, 424, RAIL_W, 24, 'Channel', *FIELD),
    'footerCredit': (RAIL_X, 928, RAIL_W, 28, 'Layout after Lumeric Visuals', 8, '#64748B', False),
}
LABELS = {page: dict(_RAIL_LABELS) for page in ('dailyOverview', 'byRegion', 'targets')}


def textbox(name, spec):
    x, y, w, h, text, size, fill, bold = spec
    style = {'fontFamily': 'Arial', 'fontSize': f'{size}pt', 'color': fill}
    if bold:
        style['fontWeight'] = 'bold'
    return {
        '$schema': 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.9.0/schema.json',
        'name': name,
        'position': {'x': x, 'y': y, 'z': 5000, 'width': w, 'height': h, 'tabOrder': 5000},
        'visual': {
            'visualType': 'textbox',
            'objects': {'general': [{'properties': {'paragraphs': [{'textRuns': [{'value': text, 'textStyle': style}]}]}}]},
            'visualContainerObjects': container('bare'),
            'drillFilterOtherVisuals': True,
        },
    }


def write_label(page, name, spec):
    folder = PAGES / page / 'visuals' / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'visual.json').write_text(json.dumps(textbox(name, spec), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def apply(page, name, spec):
    path = PAGES / page / 'visuals' / name / 'visual.json'
    visual = json.loads(path.read_text(encoding='utf-8'))
    x, y, w, h, style = spec
    visual['position'].update({'x': x, 'y': y, 'width': w, 'height': h})
    if style:
        vco = visual['visual'].setdefault('visualContainerObjects', {})
        for key, value in container(style).items():
            # keep any other properties already on the object (alt text lives in general)
            vco[key] = value
    path.write_text(json.dumps(visual, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    for page, visuals in LAYOUT.items():
        for name, spec in visuals.items():
            apply(page, name, spec)
            print(f'{page}/{name}: {spec[:4]} {spec[4] or ""}')
    for page, names in CANVAS_TOOLTIP.items():
        for name in names:
            path = PAGES / page / 'visuals' / name / 'visual.json'
            visual = json.loads(path.read_text(encoding='utf-8'))
            visual['visual'].setdefault('visualContainerObjects', {})['visualTooltip'] = [
                {'properties': {'show': lit(True), 'type': lit('Canvas'), 'section': lit(TOOLTIP_PAGE)}}]
            path.write_text(json.dumps(visual, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
            print(f'{page}/{name}: tooltip page {TOOLTIP_PAGE}')
    for page, texts in ALT_TEXT.items():
        for name, text in texts.items():
            path = PAGES / page / 'visuals' / name / 'visual.json'
            visual = json.loads(path.read_text(encoding='utf-8'))
            general = visual['visual'].setdefault('visualContainerObjects', {}).setdefault('general', [{'properties': {}}])
            general[0].setdefault('properties', {})['altText'] = lit(text)
            path.write_text(json.dumps(visual, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    for page, labels in LABELS.items():
        for name, spec in labels.items():
            write_label(page, name, spec)
            print(f'{page}/{name}: {spec[4]!r}')
