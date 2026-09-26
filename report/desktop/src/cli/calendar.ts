// The #6 check: the sales Calendar in Desktop draws the page's fiscal year, FY26, whole and in
// place, with its no-sales days as Empty days.
//
//   npm run calendar -- [--out <folder>]
//
// It connects to Desktop through the canvas debugging port (starting Desktop with it when needed,
// as the card check does), clears any Selection with a background click, then reads every drawn
// day off the Calendar's own SVG: its date, its box on screen and its fill. It checks that the
// Calendar draws exactly the FY26 days, 1 July 2025 in its first week column and 30 June 2026 in its
// last, every day in its weekday's row (Monday at the top) and its week's column, the days with no
// sales in the empty colour and no other day in it. Expected days come from date arithmetic here
// and from independent DAX over the date table and the Sales rows, never from the Report's
// measures. The canvas screenshot, and calendar.json with every reading, go to --out. Prints a pass
// or fail line per check and exits 1 on any failure. Desktop is left open.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import { PBIP, PROJECT, dax, desktopInstances, desktopWithPort } from '../desktop.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const OUT = path.resolve(values.out ?? path.join(PROJECT, 'evidence', '06-template-skeleton'));
const CALENDAR = 'Calendar: daily sales for the year, one cell per day';
/** The empty colour (SPEC, "Colour"). */
const EMPTY = '#f1f5f9';
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

/** Every date from one day to another, both included, stepped by whole UTC days. */
function datesFromTo(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
/** Monday 0 to Sunday 6. */
const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

let exitCode = 0;
try {
  // Independent expectations: FY26 from the date table, and the days with no Sales rows.
  const fy26 = datesFromTo('2025-07-01', '2026-06-30');
  const days = dax(`EVALUATE
SELECTCOLUMNS (
    FILTER ( ALL ( 'DimDate'[Date], 'DimDate'[FYear] ), 'DimDate'[FYear] = "FY26" ),
    "d", FORMAT ( 'DimDate'[Date], "yyyy-mm-dd" ),
    "n", COUNTROWS ( FILTER ( ALL ( 'Sales' ), 'Sales'[Date] = 'DimDate'[Date] ) ) + 0
)
ORDER BY [d]`);
  checkEqual('FY26 in the date table runs 1 Jul 2025 to 30 Jun 2026, 365 days (DAX against date arithmetic)', days.map((r) => String(r.d)), fy26);
  const noSales = days.filter((r) => Number(r.n) === 0).map((r) => String(r.d));
  readings.noSalesDays = noSales;
  checkEqual('FY26 has 22 days with no Sales rows (DAX; the tie-out reads Active days 343 of 365)', noSales.length, 22);

  const desktop = await desktopWithPort();
  try {
    const cal = desktop.deneb(CALENDAR);
    await desktop.waitForCanvas(cal);
    await cal.backgroundClick();
    await desktop.settle([cal]);
    const drawn = (await cal.days()).sort((a, b) => (a.date < b.date ? -1 : 1));
    readings.days = drawn.map(({ date, x, y, fill, row }) => ({ date, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, fill, row }));
    checkEqual('the Calendar draws exactly the FY26 days, each once', drawn.map((d) => d.date), fy26);

    const cx = (d: { x: number; width: number }) => Math.round((d.x + d.width / 2) * 10) / 10;
    const cy = (d: { y: number; height: number }) => Math.round((d.y + d.height / 2) * 10) / 10;
    const xs = [...new Set(drawn.map(cx))].sort((a, b) => a - b);
    const ys = [...new Set(drawn.map(cy))].sort((a, b) => a - b);
    const lead = weekdayOf('2025-07-01');
    checkEqual('7 weekday rows and 53 week columns', [ys.length, xs.length], [7, Math.floor((fy26.length - 1 + lead) / 7) + 1]);
    const byDate = new Map(drawn.map((d) => [d.date, d]));
    checkEqual('1 July 2025 is in the first week column', xs.indexOf(cx(byDate.get('2025-07-01')!)), 0);
    checkEqual('30 June 2026 is in the last week column', xs.indexOf(cx(byDate.get('2026-06-30')!)), xs.length - 1);
    const misplaced = fy26.filter((date, i) => {
      const d = byDate.get(date);
      return !d || ys.indexOf(cy(d)) !== weekdayOf(date) || xs.indexOf(cx(d)) !== Math.floor((i + lead) / 7);
    });
    checkEqual("every day sits in its weekday's row (Monday at the top) and its week's column", misplaced, []);

    const emptyDrawn = drawn.filter((d) => d.fill === EMPTY).map((d) => d.date);
    checkEqual(`the days with no sales, and only they, draw in the empty colour ${EMPTY}`, emptyDrawn, noSales);
    checkEqual('every no-sales day keeps its own row (every date has a row)', noSales.filter((d) => byDate.get(d)?.rowDay !== d), []);
    checkEqual('no day draws hollow (with every date a row, nothing is filtered out)', drawn.filter((d) => d.fill === 'transparent').map((d) => d.date), []);

    await desktop.screenshot(path.join(OUT, '01-fy26-calendar.png'), { canvasOnly: true });
    console.log(`  ....  screenshot ${path.join(OUT, '01-fy26-calendar.png')}`);
  } finally {
    await desktop.disconnect();
  }
  checkEqual('Desktop still holds the PBIP', desktopInstances().length, 1);
} catch (e) {
  check('the check ran to the end', false, (e as Error).stack ?? String(e));
} finally {
  const failed = results.filter((r) => !r.ok);
  writeFileSync(path.join(OUT, 'calendar.json'), JSON.stringify({ at: new Date().toISOString(), pbip: PBIP, readings, results }, null, 2) + '\n');
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Readings and results: ${path.join(OUT, 'calendar.json')}`);
  if (failed.length) exitCode = 1;
}
process.exit(exitCode);
