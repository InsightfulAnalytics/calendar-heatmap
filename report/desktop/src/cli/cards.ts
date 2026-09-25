// The #5 check: the four native KPI cards on Daily overview (Total sales, Mean per day, Peak day and
// Active days) follow a Calendar Selection, at their tie-out values, and nothing is left filtered.
//
//   npm run cards -- [--out <folder>]
//
// It connects to Desktop through the canvas debugging port, starting Desktop with it when needed
// (closing a Desktop that holds the PBIP without the port, answering Don't save). Then, reading every
// card from the canvas:
//   1. with no Selection, the cards show the page filter's values (calendar 2025);
//   2. a drag from 7 July to 20 August 2025, replayed on the Calendar, sets the cards to that
//      range's values (45 days), and the Calendar flags exactly those 45 rows on;
//   3. a click on the Calendar background clears the Selection, and the cards read as in step 1;
//   4. on disk, the page holds its one page filter and no visual carries a filter of its own.
// Each step's screenshot goes to --out. Expected values come from date arithmetic done here and from
// independent DAX over the Sales rows, never from the Report's measures. Prints a pass or fail line
// per check, writes cards.json to --out and exits 1 on any failure. Desktop is left open.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import {
  DEBUG_PORT, PBIP, PROJECT, REPORT, closeDesktop, connectDesktop, dax, desktopInstances, desktopProcesses,
  launchDesktop, type Desktop, type DenebVisual,
} from '../desktop.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const OUT = path.resolve(values.out ?? path.join(PROJECT, 'evidence', '05-sales-model'));
const CALENDAR = 'Calendar: daily sales for the year, one cell per day';
const CARDS = { total: 'Total sales', mean: 'Mean per day', peak: 'Peak day', active: 'Active days', days: 'Days in filter' } as const;
const PAGE_DIR = path.join(REPORT, 'definition', 'pages', 'dailyOverview');

mkdirSync(OUT, { recursive: true });

interface Result { name: string; ok: boolean; detail?: string }
const results: Result[] = [];
const readings: Record<string, unknown> = {};
function check(name: string, ok: boolean, detail?: string): boolean {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'pass' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  return ok;
}
function checkEqual(name: string, actual: unknown, expected: unknown): boolean {
  const ok = isDeepStrictEqual(actual, expected);
  return check(name, ok, ok ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------------------------
// Expected values: date arithmetic here, sums over the Sales rows in DAX.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayCount = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1;
const daxDate = (day: string) => { const [y, m, d] = day.split('-').map(Number); return `DATE ( ${y}, ${m}, ${d} )`; };
/** '2025-08-15' as the model's d mmm yyyy format writes it: '15 Aug 2025'. */
const asModelDate = (day: string) => { const [y, m, d] = day.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const whole = (n: number) => Math.round(n).toLocaleString('en-US');

interface Expected { total: string; mean: string; peak: string; active: string; days: string }
/** What the cards must show for the days from `from` to `to`, from the Sales rows alone. */
function expectedCards(from: string, to: string): Expected {
  const rows = `FILTER ( 'Sales', 'Sales'[Date] >= ${daxDate(from)} && 'Sales'[Date] <= ${daxDate(to)} )`;
  const [r] = dax(`EVALUATE
VAR __ByDay = GROUPBY ( ${rows}, 'Sales'[Date], "@Sales", SUMX ( CURRENTGROUP (), 'Sales'[Amount] ) )
RETURN ROW (
    "total", SUMX ( ${rows}, 'Sales'[Amount] ),
    "active", COUNTROWS ( __ByDay ) + 0,
    "peak", FORMAT ( MAXX ( TOPN ( 1, __ByDay, [@Sales], DESC, 'Sales'[Date], ASC ), 'Sales'[Date] ), "yyyy-mm-dd" )
)`);
  const days = dayCount(from, to);
  const total = Number(r.total);
  return { total: whole(total), mean: whole(total / days), peak: asModelDate(String(r.peak)), active: `${whole(Number(r.active))} / ${whole(days)}`, days: whole(days) };
}

// ---------------------------------------------------------------------------------------------

async function portAnswers(): Promise<boolean> {
  try { return (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}

async function desktopWithPort(): Promise<Desktop> {
  if (!(await portAnswers())) {
    if (desktopProcesses().length > 0) {
      const mine = desktopInstances();
      if (mine.length !== 1 || desktopProcesses().length !== 1) throw new Error('another Power BI Desktop is running; this check needs the PBIP alone in Desktop');
      console.log(`  ....  closing Desktop ${mine[0].pid} (no debugging port): ${await closeDesktop(mine[0].pid)}`);
    }
    const i = await launchDesktop({ debugPort: DEBUG_PORT });
    console.log(`  ....  Desktop ${i.pid} opened ${i.currentFilePath} with the debugging port`);
  }
  return connectDesktop(DEBUG_PORT);
}

async function readCards(desktop: Desktop): Promise<Record<keyof typeof CARDS, string | undefined>> {
  const { cards } = await desktop.read();
  return { total: cards[CARDS.total], mean: cards[CARDS.mean], peak: cards[CARDS.peak], active: cards[CARDS.active], days: cards[CARDS.days] };
}

async function expectCards(desktop: Desktop, step: string, expected: Expected): Promise<void> {
  const shown = await readCards(desktop);
  readings[step] = { shown, expected };
  for (const key of Object.keys(CARDS) as (keyof typeof CARDS)[]) {
    checkEqual(`${step}: the ${CARDS[key]} card reads ${expected[key]}`, shown[key], expected[key]);
  }
}

async function expectSelected(cal: DenebVisual, step: string, on: number, total: number): Promise<void> {
  const counts = await cal.selectedFlags();
  checkEqual(`${step}: the Calendar flags ${on ? `${on} rows on and ${total - on} off` : `all ${total} rows neutral`}`, counts, on ? { on, off: total - on } : { neutral: total });
}

/** The page's own filters and every visual's, read from the files on disk. */
function filtersOnDisk(): { page: unknown[]; visuals: Record<string, unknown[]> } {
  const page = JSON.parse(readFileSync(path.join(PAGE_DIR, 'page.json'), 'utf8')) as { filterConfig?: { filters?: unknown[] } };
  const visuals: Record<string, unknown[]> = {};
  for (const name of readdirSync(path.join(PAGE_DIR, 'visuals'))) {
    const file = path.join(PAGE_DIR, 'visuals', name, 'visual.json');
    if (!existsSync(file)) continue;
    const v = JSON.parse(readFileSync(file, 'utf8')) as { filterConfig?: { filters?: unknown[] } };
    if (v.filterConfig?.filters?.length) visuals[name] = v.filterConfig.filters;
  }
  return { page: page.filterConfig?.filters ?? [], visuals };
}

// ---------------------------------------------------------------------------------------------

let exitCode = 0;
try {
  const desktop = await desktopWithPort();
  try {
    const cal = desktop.deneb(CALENDAR);
    await desktop.waitForCanvas(cal);
    await desktop.settle([cal]);
    const YEAR = expectedCards('2025-01-01', '2025-12-31');
    const RANGE = expectedCards('2025-07-07', '2025-08-20');

    // Start from no Selection, whatever an earlier run left.
    await cal.backgroundClick();
    await desktop.settle([cal]);
    await expectSelected(cal, '1 no Selection', 0, 365);
    await expectCards(desktop, '1 no Selection (the page filter, calendar 2025)', YEAR);
    await desktop.screenshot(path.join(OUT, '01-no-selection.png'), { canvasOnly: true });

    await cal.drag('2025-07-07', '2025-08-20');
    await desktop.settle([cal]);
    await expectSelected(cal, '2 drag 7 Jul to 20 Aug 2025', 45, 365);
    await expectCards(desktop, '2 drag 7 Jul to 20 Aug 2025', RANGE);
    await desktop.screenshot(path.join(OUT, '02-drag-7jul-20aug.png'), { canvasOnly: true });

    await cal.backgroundClick();
    await desktop.settle([cal]);
    await expectSelected(cal, '3 background click', 0, 365);
    await expectCards(desktop, '3 background click (the Selection is gone)', YEAR);
    await desktop.screenshot(path.join(OUT, '03-cleared.png'), { canvasOnly: true });
  } finally {
    await desktop.disconnect();
  }

  const onDisk = filtersOnDisk();
  readings.filtersOnDisk = onDisk;
  const pageFilterFields = onDisk.page.map((f) => JSON.stringify((f as { field?: unknown }).field));
  checkEqual('4 on disk: Daily overview holds exactly its one page filter, on DimDate Year', pageFilterFields, [JSON.stringify({ Column: { Expression: { SourceRef: { Entity: 'DimDate' } }, Property: 'Year' } })]);
  checkEqual('4 on disk: no visual on Daily overview carries a filter of its own', Object.keys(onDisk.visuals), []);
  checkEqual('4 Desktop still holds the PBIP', desktopInstances().length, 1);
} catch (e) {
  check('the check ran to the end', false, (e as Error).stack ?? String(e));
} finally {
  const failed = results.filter((r) => !r.ok);
  writeFileSync(path.join(OUT, 'cards.json'), JSON.stringify({ at: new Date().toISOString(), pbip: PBIP, readings, results }, null, 2) + '\n');
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Readings and results: ${path.join(OUT, 'cards.json')}`);
  if (failed.length) exitCode = 1;
}
process.exit(exitCode);
