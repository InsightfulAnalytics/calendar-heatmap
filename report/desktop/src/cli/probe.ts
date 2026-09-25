// The Desktop probe (#2): answers every gating Desktop question on the Daily Sales Report without a
// human, by replaying a viewer's gestures on the Calendar through remote debugging and reading what
// the Calendar, its dataset, Deneb's editor and every other visual then show.
//
//   npm run probe -- [--out <folder>] [--west "Pacific Standard Time"] [--own-zone-only]
//
// It closes any Desktop holding the PBIP (answering Don't save), starts it with the canvas
// debugging port, and runs, in order:
//   own zone   baseline; the dataset and 1 July 2025 as the Calendar receives them, read from the
//              live Vega view and from Deneb's debug view; drag, clicks, right click, background
//              click, shift-click, shift-drags; the selected flags after each; a save, then the
//              build stamp and the container names in the saved visual.json.
//   west zone  Windows switched to the --west zone, Desktop restarted, 1 July 2025 read again, the
//              days checked against their weekdays; then the zone is restored (always, even after a
//              failure) and Desktop restarted without a debugging port.
// Expected values come from literals (the probe checklist's worked examples), from date arithmetic
// done here, and from independent DAX over the Sales and DimDate rows, never from the Report's own
// measures. Each line prints pass or fail; shift outcomes are recorded as answers, and the page is
// checked to agree with whatever the Calendar ended up selecting. Exits 1 on any failure.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import {
  DEBUG_PORT, PBIP, PROJECT, closeDesktop, connectDesktop, dax, daxScalar, desktopInstances, desktopProcesses,
  launchDesktop, saveDesktop, WEBVIEW2_ARGS_VARIABLE, type DatasetValue, type Desktop, type DenebVisual, type PageReading,
} from '../desktop.ts';

const { values } = parseArgs({ options: { out: { type: 'string' }, west: { type: 'string' }, 'deneb-spec': { type: 'string' }, 'own-zone-only': { type: 'boolean' } } });
const OUT = path.resolve(values.out ?? path.join(PROJECT, 'checklists', 'probe', 'screenshots'));
const WEST_WINDOWS_ZONE = values.west ?? 'Pacific Standard Time';
const WINDOWS_TO_IANA: Record<string, string> = { 'Pacific Standard Time': 'America/Los_Angeles', 'AUS Eastern Standard Time': 'Australia/Sydney' };
const DENEB_SPEC = values['deneb-spec'] ?? path.join(process.env.USERPROFILE ?? '', '.claude', 'skills', 'custom-visuals', 'skills', 'deneb-pbir', 'scripts', 'deneb_spec.py');
const CALENDAR_VISUAL_JSON = path.join(PROJECT, 'report', 'Daily Sales.Report', 'definition', 'pages', 'dailyOverview', 'visuals', 'calendar', 'visual.json');
const CALENDAR = 'Calendar: daily sales for the year, one cell per day';
const TABLE = 'Daily rows';
const TOTAL_CARD = 'Total sales';
const DAYS_CARD = 'Days in filter';

// Worked examples from the probe checklist: 1 July 2025 at local midnight, and at UTC midnight.
const KNOWN_LOCAL_MIDNIGHT_1_JUL_2025: Record<string, number> = { 'Australia/Sydney': 1751292000000, 'America/Los_Angeles': 1751353200000 };
const UTC_MIDNIGHT_1_JUL_2025 = 1751328000000;

mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Recording

interface Result { name: string; ok: boolean; detail?: string; how: string }
const results: Result[] = [];
const answers: Record<string, unknown> = {};
function check(name: string, ok: boolean, how: string, detail?: string): boolean {
  results.push({ name, ok, how, detail });
  console.log(`${ok ? 'pass' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  return ok;
}
function checkEqual(name: string, actual: unknown, expected: unknown, how: string): boolean {
  const ok = isDeepStrictEqual(actual, expected);
  return check(name, ok, how, ok ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function note(key: string, value: unknown): void {
  answers[key] = value;
  console.log(`  ....  ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
}
function section(title: string): void { console.log(`\n== ${title}`); }

const GESTURE = 'gesture replayed in Desktop through remote debugging';
const VIEW = "the Calendar's Vega view, read through remote debugging";
const DEBUG_VIEW = "Deneb's debug view (editor, Source tab), read through remote debugging";
const PAGE = 'the other visuals as drawn, read through remote debugging';
const DAX = 'an independent DAX query over the Sales and DimDate rows';

// ---------------------------------------------------------------------------------------------
// Dates, done here and never by the Report

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function daysFromTo(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
const without = (days: string[], drop: string[]) => days.filter((d) => !drop.includes(d));
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])].sort();
/** '07-Jul-25', as the table shows a date, to '2025-07-07'. */
function fromTableDate(s: string): string {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{2})$/.exec(s);
  if (!m) return `unparsed:${s}`;
  return `20${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1]}`;
}
/** Monday 0 to Sunday 6, from the calendar date alone. */
const weekdayMon0 = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
/** Midnight of a calendar day in an IANA zone, as epoch milliseconds, from Intl's wall clock. */
function zonedMidnight(zone: string, day: string): number {
  const target = Date.parse(`${day}T00:00:00Z`);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let t = target;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    t = target - (wall - t);
  }
  return t;
}
const parseCard = (s: string | undefined) => (s === undefined ? undefined : s === '(Blank)' ? null : Number(s.replace(/,/g, '')));
const parseCell = (s: string | undefined) => (s === undefined ? undefined : s === '' ? null : Number(s.replace(/,/g, '')));
const describe = (days: string[]) => (days.length === 0 ? 'no days' : days.length === 1 ? days[0] : `${days.length} days, ${days[0]} to ${days[days.length - 1]}`);

// ---------------------------------------------------------------------------------------------
// Independent DAX

const daxDate = (day: string) => { const [y, m, d] = day.split('-').map(Number); return `DATE ( ${y}, ${m}, ${d} )`; };
function independentTotal(days: string[]): number | null {
  if (days.length === 0) return null;
  const v = daxScalar(`SUMX ( FILTER ( 'Sales', 'Sales'[Date] IN { ${days.map(daxDate).join(', ')} } ), 'Sales'[Amount] )`);
  return v === null ? null : Number(v);
}
let DAYS_2025: string[] = [];
let DAILY_2025: Record<string, number | null> = {};
function loadIndependentDays(): void {
  const rows = dax(`EVALUATE
SELECTCOLUMNS (
    FILTER ( ALL ( 'DimDate'[Date] ), YEAR ( 'DimDate'[Date] ) = 2025 ),
    "d", FORMAT ( 'DimDate'[Date], "yyyy-mm-dd" ),
    "s", SUMX ( FILTER ( 'Sales', 'Sales'[Date] = 'DimDate'[Date] ), 'Sales'[Amount] )
)`);
  DAILY_2025 = Object.fromEntries(rows.map((r) => [String(r.d), r.s === null || r.s === undefined ? null : Number(r.s)]));
  DAYS_2025 = Object.keys(DAILY_2025).sort();
}

// ---------------------------------------------------------------------------------------------
// Readings

function dateOf(v: DatasetValue | undefined): { type: string; time: number; text: string; iso: string; localDay: string } | null {
  return v && typeof v === 'object' && 'date' in v ? v.date : null;
}
/** The days whose rows the Calendar's dataset flags on, and the count of each flag. */
async function flags(cal: DenebVisual): Promise<{ on: string[]; counts: Record<string, number>; rowDay: Map<number, string> }> {
  const { rows } = await cal.dataset();
  const counts: Record<string, number> = {};
  const on: string[] = [];
  const rowDay = new Map<number, string>();
  for (const r of rows) {
    const f = String(r.__selected__);
    counts[f] = (counts[f] ?? 0) + 1;
    const d = dateOf(r.Date);
    if (d) rowDay.set(Number(r.__row__), d.localDay);
    if (f === 'on' && d) on.push(d.localDay);
  }
  return { on: on.sort(), counts, rowDay };
}

/** Checks the table, both cards and (when given) the title show exactly `days`. */
async function expectPage(desktop: Desktop, step: string, days: string[], title?: string): Promise<PageReading> {
  const reading = await desktop.read();
  const table = reading.tables[TABLE];
  const shown = table ? table.rows.map((r) => fromTableDate(r[0])) : [];
  checkEqual(`${step}: the table lists exactly ${describe(days)}`, shown, days, PAGE);
  const blankExpected = days.filter((d) => DAILY_2025[d] === null);
  const blankShown = table ? table.rows.filter((r) => r[1] === '').map((r) => fromTableDate(r[0])) : [];
  checkEqual(`${step}: its rows with blank sales are the days with no Sales rows (${blankExpected.join(', ') || 'none'})`, blankShown, blankExpected, `${PAGE}; ${DAX}`);
  const wrongSales = table ? table.rows.filter((r) => parseCell(r[1]) !== DAILY_2025[fromTableDate(r[0])]).map((r) => r.join(' ')) : ['no table'];
  check(`${step}: every row's sales equals the day's independent sum, and its Days in Filter reads 1`, wrongSales.length === 0 && !!table && table.rows.every((r) => r[2] === '1'), `${PAGE}; ${DAX}`, wrongSales.slice(0, 5).join('; ') || undefined);
  checkEqual(`${step}: the Days in filter card reads ${days.length}`, parseCard(reading.cards[DAYS_CARD]), days.length, PAGE);
  const total = independentTotal(days);
  checkEqual(`${step}: the Total sales card equals the independent sum (${total === null ? 'blank' : total.toLocaleString('en-US')})`, parseCard(reading.cards[TOTAL_CARD]), total, `${PAGE}; ${DAX}`);
  if (title !== undefined) checkEqual(`${step}: the title reads "${title}"`, reading.textBoxes[0], title, PAGE);
  return reading;
}

/** Checks the Calendar's rows are flagged on for exactly `days` and off otherwise; null: all neutral. */
async function expectFlags(cal: DenebVisual, step: string, days: string[] | null): Promise<void> {
  const f = await flags(cal);
  if (days === null) {
    checkEqual(`${step}: every row of the Calendar's dataset is neutral`, f.counts, { neutral: DAYS_2025.length }, VIEW);
  } else {
    checkEqual(`${step}: the Calendar's rows are on for exactly ${describe(days)}`, f.on, days, VIEW);
    checkEqual(`${step}: and off for every other row`, f.counts, { on: days.length, off: DAYS_2025.length - days.length }, VIEW);
  }
}

/** Every day of 2025 is drawn once, in its weekday's row, showing its own dataset row. */
async function expectWeekdays(cal: DenebVisual, step: string): Promise<void> {
  const days = await cal.days();
  checkEqual(`${step}: the Calendar draws every day of 2025 once`, days.map((d) => d.date).sort(), DAYS_2025, VIEW);
  const rowsY = [...new Set(days.map((d) => Math.round(d.y)))].sort((a, b) => a - b);
  const wrongRow = days.filter((d) => rowsY.indexOf(Math.round(d.y)) !== weekdayMon0(d.date)).map((d) => d.date);
  check(`${step}: every day sits in its weekday's row, Monday first (1 Jan 2025 on Wednesday)`, rowsY.length === 7 && wrongRow.length === 0, VIEW, wrongRow.slice(0, 5).join(', ') || undefined);
  const wrongData = days.filter((d) => d.rowDay !== d.date).map((d) => `${d.date} shows ${d.rowDay}`);
  check(`${step}: every day shows the dataset row of the same calendar day`, wrongData.length === 0, VIEW, wrongData.slice(0, 5).join('; ') || undefined);
}

/** 1 July 2025 as the Calendar receives it, classified as local midnight, UTC midnight or text. */
async function readJuly1(cal: DenebVisual, step: string): Promise<{ zone: string; raw: number | string | null; delivery: string; rowId: number | null; expectedIso: string }> {
  const zone = await cal.timeZone();
  const expectedLocal = zonedMidnight(zone, '2025-07-01');
  if (KNOWN_LOCAL_MIDNIGHT_1_JUL_2025[zone] !== undefined) checkEqual(`${step}: local midnight of 1 Jul 2025 in ${zone} is the worked example`, expectedLocal, KNOWN_LOCAL_MIDNIGHT_1_JUL_2025[zone], 'date arithmetic (Intl) against the probe checklist');
  const { fields, rows } = await cal.dataset();
  let delivery = 'not found', raw: number | string | null = null, rowId: number | null = null, type = '', text = '';
  for (const r of rows) {
    const d = dateOf(r.Date);
    const v = r.Date;
    if (d && d.time === expectedLocal) { delivery = 'local'; raw = d.time; type = d.type; text = d.text; }
    else if (d && d.time === UTC_MIDNIGHT_1_JUL_2025) { delivery = 'utc'; raw = d.time; type = d.type; text = d.text; }
    else if (typeof v === 'string' && /2025-07-01|7\/1\/2025|1\/07\/2025/.test(v)) { delivery = 'text'; raw = v; type = 'string'; text = v; }
    else continue;
    rowId = Number(r.__row__);
    checkEqual(`${step}: that row's sales equal the independent sum for 1 Jul 2025`, r.Sales, DAILY_2025['2025-07-01'], `${VIEW}; ${DAX}`);
    break;
  }
  check(`${step}: the dataset holds a row for 1 Jul 2025`, rowId !== null, VIEW, rowId === null ? `no Date value matched local midnight (${expectedLocal}), UTC midnight or text` : undefined);
  note(`${step} zone`, zone);
  note(`${step} 1 Jul 2025 delivered as`, { delivery, type, raw, text, iso: typeof raw === 'number' ? new Date(raw).toISOString() : null, row: rowId, fields });
  return { zone, raw, delivery, rowId, expectedIso: new Date(expectedLocal).toISOString() };
}

// ---------------------------------------------------------------------------------------------
// Steps

async function shot(desktop: Desktop, name: string, canvasOnly = true): Promise<void> {
  await desktop.screenshot(path.join(OUT, name), { canvasOnly });
  console.log(`  ....  screenshot ${path.join(OUT, name)}`);
}

async function openWithDebugPort(): Promise<{ desktop: Desktop; cal: DenebVisual; pid: number }> {
  const instance = await launchDesktop({ debugPort: DEBUG_PORT });
  const desktop = await connectDesktop(DEBUG_PORT);
  const cal = desktop.deneb(CALENDAR);
  await desktop.waitForCanvas(cal);
  await desktop.settle([cal]);
  return { desktop, cal, pid: instance.pid };
}

function tzutil(args: string[]): string {
  const r = spawnSync('tzutil', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tzutil ${args.join(' ')} exited ${r.status}: ${r.stdout}${r.stderr}`);
  return (r.stdout ?? '').trim();
}

async function ownZone(desktop: Desktop, cal: DenebVisual, pid: number): Promise<{ raw: number | string | null }> {
  section('A. The page and the dataset, in the machine time zone');
  const RANGE = daysFromTo('2025-07-07', '2025-08-20');
  checkEqual('the page filter holds 365 days of 2025 (independent)', DAYS_2025.length, 365, DAX);
  await expectPage(desktop, 'baseline', DAYS_2025, 'Selected Period: 2025');
  await expectFlags(cal, 'baseline', null);
  await expectWeekdays(cal, 'own zone');
  await shot(desktop, '01-baseline.png');

  const ds = await cal.dataset();
  checkEqual('blank-value days arrive as rows: the dataset has one row per day in the filter', ds.rows.length, DAYS_2025.length, `${VIEW}; ${DAX}`);
  const blankRows = ds.rows.filter((r) => r.Sales === null).map((r) => dateOf(r.Date)?.localDay).sort();
  checkEqual('the no-sales days are rows with blank Sales and Days in Filter 1', { days: blankRows, helper: ds.rows.filter((r) => r.Sales === null).every((r) => r['Days in Filter'] === 1) }, { days: DAYS_2025.filter((d) => DAILY_2025[d] === null), helper: true }, `${VIEW}; ${DAX}`);
  check('the dataset lists the sales measure\'s highlight companion field (Sales__highlight)', ds.fields.includes('Sales__highlight'), VIEW, ds.fields.join(', '));
  note('dataset fields', ds.fields);
  const own = await readJuly1(cal, 'own zone');
  checkEqual('own zone: dates arrive as Date values at local midnight', own.delivery, 'local', VIEW);

  section("A'. The same, read from Deneb's debug view");
  await cal.openEditor();
  await shot(desktop, '02-debug-fields.png', false);
  const src = await cal.debugSource();
  checkEqual("Deneb's debug view counts one row per day in the filter", { count: src.count, read: src.rows.length }, { count: DAYS_2025.length, read: DAYS_2025.length }, DEBUG_VIEW);
  check("Deneb's debug view lists Sales__highlight", src.headers.includes('Sales__highlight'), DEBUG_VIEW, src.headers.join(', '));
  note('debug view columns', src.headers);
  const col = (name: string) => src.headers.indexOf(name);
  const f = await flags(cal);
  const idOf = (day: string) => [...f.rowDay.entries()].find(([, d]) => d === day)?.[0];
  for (const day of ['2025-01-04', '2025-07-17']) {
    const row = src.rows.find((r) => r[0] === String(idOf(day)));
    // The debug view prints a blank measure value as the text null.
    checkEqual(`Deneb's debug view shows ${day} as a row with Sales null and Days in Filter 1`, row ? { sales: row[col('Sales')], helper: row[col('Days in Filter')] } : null, { sales: 'null', helper: '1' }, DEBUG_VIEW);
  }
  await cal.showSourceRow(String(idOf('2025-07-17')));
  await shot(desktop, '04-debug-blank-rows.png', false);
  const jul1 = await cal.showSourceRow(String(own.rowId));
  checkEqual("Deneb's debug view shows 1 Jul 2025's Date as local midnight in ISO form", jul1[col('Date')], own.expectedIso, DEBUG_VIEW);
  note("own zone 1 Jul 2025 in Deneb's debug view", jul1[col('Date')]);
  await shot(desktop, '05-debug-1jul-own-zone.png', false);
  const logs = await cal.debugLogs();
  note("Deneb's log after opening the editor", logs);
  await desktop.backToReport();
  await desktop.settle([cal]);
  await expectPage(desktop, 'back to report', DAYS_2025, 'Selected Period: 2025');

  section('C. Clicks and drags on the Calendar');
  await cal.drag('2025-07-07', '2025-08-20');
  await desktop.settle([cal]);
  await expectPage(desktop, 'C1 drag 7 Jul to 20 Aug', RANGE, 'Selected Period: 7 Jul - 20 Aug 2025');
  await expectFlags(cal, 'C1 drag 7 Jul to 20 Aug', RANGE);
  await shot(desktop, '12-drag.png');

  await cal.openEditor();
  const held = await cal.debugSource();
  const sel = col('__selected__');
  const onIds = held.rows.filter((r) => r[sel] === 'on').map((r) => f.rowDay.get(Number(r[0]))).sort();
  checkEqual("C2 with the drag held, Deneb's debug view shows exactly the 45 days on and the rest off", { on: onIds, off: held.rows.filter((r) => r[sel] === 'off').length }, { on: RANGE, off: DAYS_2025.length - RANGE.length }, DEBUG_VIEW);
  note('C2 flags of 6 Jul, 7 Jul, 17 Jul, 20 Aug, 21 Aug', Object.fromEntries(['2025-07-06', '2025-07-07', '2025-07-17', '2025-08-20', '2025-08-21'].map((d) => [d, held.rows.find((r) => r[0] === String(idOf(d)))?.[sel]])));
  await cal.showSourceRow(String(idOf('2025-07-07')));
  await shot(desktop, '14-debug-flags-drag.png', false);
  await desktop.backToReport();
  await desktop.settle([cal]);
  await expectFlags(cal, 'C2 after leaving the editor, the drag is still held', RANGE);

  await cal.backgroundClick();
  await desktop.settle([cal]);
  await expectPage(desktop, 'C3 background click after the drag', DAYS_2025, 'Selected Period: 2025');
  await expectFlags(cal, 'C3 background click after the drag', null);
  await cal.openEditor();
  const cleared = await cal.debugSource();
  checkEqual("C3 after the background click, Deneb's debug view shows every row neutral", cleared.rows.filter((r) => r[sel] !== 'neutral').length, 0, DEBUG_VIEW);
  await shot(desktop, '15-debug-flags-cleared.png', false);
  await desktop.backToReport();
  await desktop.settle([cal]);

  await cal.click('2025-07-07');
  await desktop.settle([cal]);
  await expectPage(desktop, 'C4 click 7 Jul', ['2025-07-07'], 'Selected Period: 7 Jul 2025');
  await expectFlags(cal, 'C4 click 7 Jul', ['2025-07-07']);
  await shot(desktop, '16-click-7jul.png');

  await cal.click('2025-07-17');
  await desktop.settle([cal]);
  await expectPage(desktop, 'C5 click 17 Jul (no sales)', ['2025-07-17'], 'Selected Period: 17 Jul 2025');
  await expectFlags(cal, 'C5 click 17 Jul (no sales)', ['2025-07-17']);
  await shot(desktop, '17-click-17jul-no-sales.png');

  await cal.rightClick('2025-08-14');
  await new Promise((r) => setTimeout(r, 1500));
  const menu = await desktop.openMenu();
  check('C6 a right click on 14 Aug opens the context menu', !!menu && menu.length > 0, GESTURE, menu ? menu.join(' | ') : 'no menu');
  note('C6 context menu items', menu);
  await shot(desktop, '18-right-click-menu.png');
  await desktop.pressEscape();
  await desktop.settle([cal]);
  checkEqual('C6 Esc closes the menu', await desktop.openMenu(), null, GESTURE);
  await expectPage(desktop, 'C6 after the right click, nothing changed', ['2025-07-17'], 'Selected Period: 17 Jul 2025');
  await expectFlags(cal, 'C6 after the right click, nothing changed', ['2025-07-17']);
  await shot(desktop, '19-after-right-click.png');

  await cal.backgroundClick();
  await desktop.settle([cal]);
  await expectPage(desktop, 'C7 background click', DAYS_2025, 'Selected Period: 2025');
  await expectFlags(cal, 'C7 background click', null);
  await shot(desktop, '20-background-click.png');

  section('C8-C9. Shift over a Selection (answers, then the page must agree with the Calendar)');
  const shiftCase = async (step: string, file: string, act: () => Promise<void>, outcomes: Record<string, string[] | null>) => {
    await cal.backgroundClick();
    await desktop.settle([cal]);
    await cal.drag('2025-07-07', '2025-08-20');
    await desktop.settle([cal]);
    await expectFlags(cal, `${step} setup: drag 7 Jul to 20 Aug`, RANGE);
    await act();
    await desktop.settle([cal]);
    const after = await flags(cal);
    const selected = after.counts.on ? after.on : null;
    const outcome = Object.entries(outcomes).find(([, days]) => isDeepStrictEqual(days, selected))?.[0] ?? `something else: ${selected ? describe(selected) : 'nothing selected'}`;
    const reading = await expectPage(desktop, `${step} the page agrees with the Calendar's Selection`, selected ?? DAYS_2025);
    if (selected === null) await expectFlags(cal, step, null);
    note(`${step} outcome`, { outcome, selected: selected ? describe(selected) : 'none', title: reading.textBoxes[0], totalCard: reading.cards[TOTAL_CARD], daysCard: reading.cards[DAYS_CARD] });
    await shot(desktop, file);
    return outcome;
  };
  answers.shiftClick = await shiftCase('C8 shift-click 14 Aug (selected)', '21-shift-click.png', () => cal.click('2025-08-14', { shift: true }), {
    'a. 14 Aug removed': without(RANGE, ['2025-08-14']), 'b. only 14 Aug left': ['2025-08-14'], 'c. no change': RANGE, 'd. Selection cleared': null,
  });
  const WEEK = daysFromTo('2025-08-04', '2025-08-10');
  answers.shiftDrag = await shiftCase('C9 shift-drag 4 to 10 Aug (all selected)', '22-shift-drag.png', () => cal.drag('2025-08-04', '2025-08-10', { shift: true }), {
    'a. the seven days removed': without(RANGE, WEEK), 'b. replaced by 4 to 10 Aug': WEEK, 'c. no change': RANGE, 'd. Selection cleared': null,
  });
  const OVERLAP = daysFromTo('2025-08-18', '2025-08-26');
  const OUTSIDE = daysFromTo('2025-08-21', '2025-08-26');
  answers.shiftDragMixed = await shiftCase('C9b shift-drag 18 to 26 Aug (3 selected, 6 not)', '22b-shift-drag-mixed.png', () => cal.drag('2025-08-18', '2025-08-26', { shift: true }), {
    'toggle each: 18 to 20 Aug removed, 21 to 26 Aug added': union(without(RANGE, OVERLAP), OUTSIDE),
    'union: 7 Jul to 26 Aug': union(RANGE, OUTSIDE), 'replace: 18 to 26 Aug': OVERLAP, 'remove all: 18 to 20 Aug removed': without(RANGE, OVERLAP), 'no change': RANGE, 'Selection cleared': null,
  });

  await cal.backgroundClick();
  await desktop.settle([cal]);
  await expectPage(desktop, 'C10 cleared', DAYS_2025, 'Selected Period: 2025');
  await expectFlags(cal, 'C10 cleared', null);
  await shot(desktop, '23-cleared.png');

  section('D. Save, the build stamp and the container names');
  await saveDesktop(pid);
  const inst = desktopInstances().find((i) => i.pid === pid);
  checkEqual('D2 after the save Desktop has no unsaved changes', inst?.hasUnsavedChanges, false, 'pbir desktop list');
  await shot(desktop, '25-after-save.png');
  const audit = spawnSync('python', [DENEB_SPEC, 'audit', CALENDAR_VISUAL_JSON], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  const text = audit.stdout ?? '';
  const pick = (re: RegExp) => re.exec(text)?.[1] ?? null;
  const stamp = { developerVersion: pick(/developer\.version: (\S+)/), vegaVersion: pick(/vega\.version: (\S+)/), legacy: pick(/legacy signals: (.+)/), denebContainer: pick(/denebContainer references: (\d+)/) };
  note('D3 audit of the saved Calendar visual.json', stamp);
  checkEqual('D3 the saved Calendar is stamped Deneb 2.0.0.0 on Vega 6.4.0', [stamp.developerVersion, stamp.vegaVersion], ['2.0.0.0', '6.4.0'], 'the saved visual.json (deneb-pbir audit)');
  checkEqual('D3 after the editor was opened and Desktop saved, the spec still uses the legacy container names', [stamp.legacy, stamp.denebContainer], ['total=2 pbiContainerWidth=1 pbiContainerHeight=1 pbiContainer=0', '0'], 'the saved visual.json (deneb-pbir audit)');
  const git = spawnSync('git', ['-C', PROJECT, 'status', '--short', '--', 'report'], { encoding: 'utf8' });
  note('D3 git status of report/ after the save', (git.stdout ?? '').trim() || '(nothing)');
  return { raw: own.raw };
}

async function westZone(ownRaw: number | string | null): Promise<void> {
  section(`B. One reading west of UTC (${WEST_WINDOWS_ZONE})`);
  const { desktop, cal, pid } = await openWithDebugPort();
  try {
    const zone = await cal.timeZone();
    checkEqual(`the restarted Desktop's canvas runs in ${WINDOWS_TO_IANA[WEST_WINDOWS_ZONE] ?? WEST_WINDOWS_ZONE}`, zone, WINDOWS_TO_IANA[WEST_WINDOWS_ZONE], VIEW);
    const west = await readJuly1(cal, 'west zone');
    checkEqual('west zone: dates arrive as Date values at local midnight', west.delivery, 'local', VIEW);
    check('the raw value of 1 Jul 2025 changed between the two zones', west.raw !== null && ownRaw !== null && west.raw !== ownRaw, VIEW, `${ownRaw} then ${west.raw}`);
    await expectWeekdays(cal, 'west zone');
    await expectPage(desktop, 'west zone baseline', DAYS_2025, 'Selected Period: 2025');
    await shot(desktop, '09-west-canvas.png');
    await cal.openEditor();
    const src = await cal.debugSource();
    const jul1 = await cal.showSourceRow(String(west.rowId));
    checkEqual("west zone: Deneb's debug view shows 1 Jul 2025's Date as local midnight in ISO form", jul1[src.headers.indexOf('Date')], west.expectedIso, DEBUG_VIEW);
    note("west zone 1 Jul 2025 in Deneb's debug view", jul1[src.headers.indexOf('Date')]);
    await shot(desktop, '10-debug-1jul-west.png', false);
    await desktop.backToReport();
  } finally {
    await desktop.disconnect();
    await closeDesktop(pid);
  }
}

function envVariableAt(scope: 'user' | 'machine'): string | null {
  const key = scope === 'user' ? 'HKCU\\Environment' : 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';
  const r = spawnSync('reg', ['query', key, '/v', WEBVIEW2_ARGS_VARIABLE], { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout ?? '').trim() : null;
}

// ---------------------------------------------------------------------------------------------

const started = new Date();
let exitCode = 0;
const originalZone = tzutil(['/g']);
let zoneChanged = false;
note('machine time zone at the start', originalZone);
try {
  if (desktopProcesses().length > 0) {
    const mine = desktopInstances();
    if (mine.length !== 1 || desktopProcesses().length !== 1) throw new Error('another Power BI Desktop is running; the probe needs this PBIP alone in Desktop');
    note('closing the Desktop instance already holding the PBIP', await closeDesktop(mine[0].pid));
  }
  const own = await openWithDebugPort();
  loadIndependentDays();
  let ownRaw: number | string | null = null;
  try {
    ({ raw: ownRaw } = await ownZone(own.desktop, own.cal, own.pid));
  } finally {
    await own.desktop.disconnect();
    await closeDesktop(own.pid);
  }
  if (values['own-zone-only']) throw new Error('--own-zone-only: the west-of-UTC reading was skipped');
  tzutil(['/s', WEST_WINDOWS_ZONE]);
  zoneChanged = true;
  checkEqual('Windows is set west of UTC', tzutil(['/g']), WEST_WINDOWS_ZONE, 'tzutil /g');
  await westZone(ownRaw);
} catch (e) {
  check('the probe ran to the end', false, 'the probe', (e as Error).stack ?? String(e));
} finally {
  if (zoneChanged) {
    for (const pid of desktopProcesses()) { try { await closeDesktop(pid); } catch (e) { console.log(`  ....  ${(e as Error).message}`); } }
    tzutil(['/s', originalZone]);
    checkEqual('the Windows time zone is restored', tzutil(['/g']), originalZone, 'tzutil /g');
  }
  checkEqual('the WebView2 debugging variable is set neither for the user nor for the machine', [envVariableAt('user'), envVariableAt('machine')], [null, null], 'reg query');
  if (desktopProcesses().length === 0) {
    const plain = await launchDesktop({ debugPort: null });
    note('Desktop reopened without a debugging port', { pid: plain.pid, file: plain.currentFilePath });
    let listening = false;
    try { listening = (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(2000) })).ok; } catch { listening = false; }
    checkEqual(`nothing listens on the debugging port ${DEBUG_PORT} after the run`, listening, false, 'an HTTP request to 127.0.0.1');
  }
  const failed = results.filter((r) => !r.ok);
  writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify({ started: started.toISOString(), finished: new Date().toISOString(), pbip: PBIP, answers, results }, null, 2) + '\n');
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Answers and results: ${path.join(OUT, 'probe.json')}`);
  if (failed.length) exitCode = 1;
}
process.exit(exitCode);
