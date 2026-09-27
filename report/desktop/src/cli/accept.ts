// The #27 end-to-end check on Daily overview: one Calendar drag, replayed in Desktop, drives the
// whole page.
//
//   npm run accept -- [--out <folder>]
//
// Connects through the debugging port (Desktop must already be running with it: npm run desktop --
// open), selects Daily overview and clears any Selection. Then:
//   1. with no Selection, the KPI strip reads the FY26 values and every Calendar is at full strength;
//   2. a drag from 7 July to 20 August 2025 on the sales Calendar sets the KPI strip's four headlines
//      to that range's values, Top days to five days inside the range, the title to the range,
//      Sales by month to its July and August share with all twelve columns kept, and dims the
//      Support tickets and Web sessions Calendars outside the range without emptying them;
//   3. a background click clears it, and the KPI strip reads as in step 1;
//   4. hovering a day shows the Day summary page for that day: its sales and variance to target, or
//      words for a day with no sales, and its week's days on target;
//   5. right click, Drill through, Day detail opens Day detail for that day.
// Expected values come from independent DAX over the fact rows and from date arithmetic. Prints a
// pass or fail line per check, writes accept.json to --out and exits 1 on any failure.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PROJECT, connectDesktop, daxScalar, type Desktop } from '../desktop.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const OUT = path.resolve(values.out ?? path.join(PROJECT, 'evidence', '27-acceptance'));
mkdirSync(OUT, { recursive: true });

const ALT = {
  sales: 'Calendar: daily sales for the year, one cell per day',
  support: 'Calendar: daily support tickets for the year, one cell per day',
  web: 'Calendar: daily web sessions for the year, one cell per day',
  kpi: 'KPI cards: total, mean per day, peak day and active days',
  months: 'Sales by month, July to June',
  top: 'Top days: the five best days',
};

const results: { name: string; ok: boolean; detail?: string }[] = [];
const readings: Record<string, unknown> = {};
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'pass' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The texts a Deneb visual draws, in scene order. */
async function texts(desktop: Desktop, alt: string): Promise<string[]> {
  const frame = await desktop.deneb(alt).frame();
  return frame.evaluate(() => [...document.querySelectorAll('svg.marks text')].map((t) => (t.textContent ?? '').trim()).filter(Boolean));
}

/** The texts drawn by the Day summary tooltip's Deneb visual: the sandbox frame whose texts include the day's words. */
async function tooltipTexts(desktop: Desktop, words: string): Promise<string[]> {
  for (const frame of desktop.page.frames()) {
    try {
      const shown = await frame.evaluate(() => [...document.querySelectorAll('svg.marks text')].map((t) => (t.textContent ?? '').trim()).filter(Boolean));
      if (shown.includes(words)) return shown;
    } catch { /* a frame that navigated away or is not a visual */ }
  }
  return [];
}

/** How many of a Calendar's day cells draw dimmed and at full strength. */
async function dimming(desktop: Desktop, alt: string): Promise<{ dim: number; full: number }> {
  const frame = await desktop.deneb(alt).frame();
  return frame.evaluate(() => {
    let dim = 0, full = 0;
    for (const el of document.querySelectorAll('svg.marks .mark-rect.role-mark path')) {
      const item = (el as unknown as { __data__?: { mark?: { name?: string }; opacity?: number } }).__data__;
      if (item?.mark?.name !== 'cell') continue;
      if ((item.opacity ?? 1) < 1) dim++; else full++;
    }
    return { dim, full };
  });
}

/** Sales by month's highlighted share bars (opacity 1) and its columns. */
async function months(desktop: Desktop): Promise<{ columns: number; shares: number }> {
  const frame = await desktop.deneb(ALT.months).frame();
  return frame.evaluate(() => {
    let columns = 0, shares = 0;
    for (const el of document.querySelectorAll('svg.marks path')) {
      const item = (el as unknown as { __data__?: { mark?: { name?: string }; opacity?: number } }).__data__;
      if (item?.mark?.name === 'column') columns++;
      if (item?.mark?.name === 'share' && (item.opacity ?? 0) > 0) shares++;
    }
    return { columns, shares };
  });
}

async function titleText(desktop: Desktop): Promise<string> {
  const reading = await desktop.read();
  return reading.textBoxes.find((t) => t.startsWith('Daily Sales')) ?? '';
}

/** Settles the page: every reading the same twice, two seconds apart. */
async function settle(desktop: Desktop) {
  let last = '';
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const now = JSON.stringify([await texts(desktop, ALT.kpi), await texts(desktop, ALT.top), await titleText(desktop)]);
    if (now === last) return;
    last = now;
  }
}

function compact(n: number): string {
  // The strip's own compact format: two decimals of a million, one of a thousand
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${(n / 1e3).toFixed(1)}K`;
}

const desktop = await connectDesktop();
try {
  await desktop.page.locator('[role=tab]').filter({ hasText: 'Daily overview' }).first().click();
  const sales = desktop.deneb(ALT.sales);
  await desktop.waitForCanvas(sales);
  await sales.backgroundClick();
  await settle(desktop);

  const fy = { from: 'DATE ( 2025, 7, 1 )', to: 'DATE ( 2026, 6, 30 )' };
  const range = { from: 'DATE ( 2025, 7, 7 )', to: 'DATE ( 2025, 8, 20 )' };
  const total = (r: typeof fy) => Number(daxScalar(`SUMX ( FILTER ( 'Sales', 'Sales'[Date] >= ${r.from} && 'Sales'[Date] <= ${r.to} ), 'Sales'[Amount] )`));
  const active = (r: typeof fy) => Number(daxScalar(`COUNTROWS ( DISTINCT ( SELECTCOLUMNS ( FILTER ( 'Sales', 'Sales'[Date] >= ${r.from} && 'Sales'[Date] <= ${r.to} ), "d", 'Sales'[Date] ) ) )`));

  const base = await texts(desktop, ALT.kpi);
  readings.baseline = { kpi: base, title: await titleText(desktop), support: await dimming(desktop, ALT.support) };
  check('baseline: the KPI strip reads the FY26 total', base.includes(compact(total(fy))), `${base.join(' | ')}; expected ${compact(total(fy))}`);
  check('baseline: the KPI strip reads FY26 active days out of 365', base.includes(`${active(fy)} / 365`));
  check('baseline: Support tickets is at full strength', (readings.baseline as { support: { dim: number } }).support.dim === 0);

  await sales.drag('2025-07-07', '2025-08-20');
  await settle(desktop);
  const kpi = await texts(desktop, ALT.kpi);
  const top = await texts(desktop, ALT.top);
  const title = await titleText(desktop);
  const support = await dimming(desktop, ALT.support);
  const web = await dimming(desktop, ALT.web);
  const bars = await months(desktop);
  readings.drag = { kpi, top, title, support, web, months: bars };
  const t = total(range);
  check('drag: the KPI strip total is the range total', kpi.includes(compact(t)), `${kpi.join(' | ')}; expected ${compact(t)}`);
  check('drag: active days read out of the 45 days of the range', kpi.includes(`${active(range)} / 45`), kpi.join(' | '));
  const peak = String(daxScalar(`FORMAT ( MAXX ( TOPN ( 1, GROUPBY ( FILTER ( 'Sales', 'Sales'[Date] >= ${range.from} && 'Sales'[Date] <= ${range.to} ), 'Sales'[Date], "@S", SUMX ( CURRENTGROUP (), 'Sales'[Amount] ) ), [@S], DESC, 'Sales'[Date], ASC ), 'Sales'[Date] ), "d mmm" )`));
  check('drag: the Peak day is the range\'s best day', kpi.includes(peak), `expected ${peak}`);
  const topDates = top.filter((s) => /^\d{1,2} [A-Z][a-z]{2}$/.test(s));
  check('drag: Top days lists five days, all in July or August', topDates.length === 5 && topDates.every((s) => /(Jul|Aug)$/.test(s)), topDates.join(', '));
  check('drag: the title states the range', title === 'Daily Sales · FY26 · 7 Jul - 20 Aug 2025', title);
  check('drag: Sales by month keeps twelve columns and highlights July and August', bars.columns === 12 && bars.shares === 2, JSON.stringify(bars));
  // Full strength: the range's days that have a value, plus every Empty day (an Empty day keeps its
  // look under a highlight). Dimmed: every other day with a value.
  for (const [name, reading, table, column] of [['Support tickets', support, 'Support Tickets', 'Tickets'], ['Web sessions', web, 'Web Sessions', 'Sessions']] as const) {
    const valued = (r: typeof fy) => Number(daxScalar(`COUNTROWS ( FILTER ( '${table}', '${table}'[Date] >= ${r.from} && '${table}'[Date] <= ${r.to} ) ) + 0`));
    const inRange = valued(range), inYear = valued(fy);
    const expected = { dim: inYear - inRange, full: inRange + (365 - inYear) };
    check(`drag: ${name} keeps all 365 days drawn, the ${expected.dim} valued days outside the range dimmed`, reading.dim === expected.dim && reading.full === expected.full, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(reading)}`);
  }

  await sales.backgroundClick();
  await settle(desktop);
  const after = await texts(desktop, ALT.kpi);
  readings.cleared = { kpi: after };
  check('clear: a background click returns the KPI strip to FY26', JSON.stringify(after) === JSON.stringify(base), after.join(' | '));

  // 4. hovering a day shows the Day summary report page for it: the day's sales with its variance to
  // target beside them, or words for a day without sales, and the week's count of days on target
  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
  const sign = (n: number) => (n >= 0 ? '+' : '−');
  const onDay = (table: string, column: string, day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return daxScalar(`SUMX ( FILTER ( '${table}', '${table}'[Date] = DATE ( ${y}, ${m}, ${d} ) ), '${table}'[${column}] )`) as number | null;
  };
  for (const [day, words] of [['2025-07-07', 'Mon 7 Jul 2025'], ['2025-07-17', 'Thu 17 Jul 2025']] as const) {
    const s = onDay('Sales', 'Amount', day), t = onDay('Targets', 'Target', day);
    const expected = s == null ? ['No sales on this day']
      : t == null ? [fmt(s), 'No target on this day']
      : [fmt(s), `${s >= t ? '▲' : '▼'} ${sign(s - t)}${fmt(Math.abs(s - t))} (${sign(s - t)}${(Math.abs(s - t) / t * 100).toFixed(1)}%)`];
    const c = await sales.dayCentre(day);
    await desktop.page.mouse.move(c.x - 30, c.y - 30);
    await desktop.page.mouse.move(c.x, c.y, { steps: 5 });
    await sleep(4000);
    const shown = await tooltipTexts(desktop, words);
    readings[`hover ${day}`] = shown;
    const week = shown.some((x) => /^Week: \d of \d days on target$/.test(x));
    check(`hover: Day summary shows ${words}, ${expected.map((x) => `'${x}'`).join(' then ')} and the week's days on target`,
      expected.every((x) => shown.includes(x)) && week, shown.join(' | '));
  }
  await desktop.page.mouse.move(5, 5);

  // 5. right click, Drill through, Day detail opens Day detail for that day
  await sales.rightClick('2025-07-07');
  await sleep(1500);
  await desktop.page.locator('pbi-menu[role=menu] [role=menuitem]').filter({ hasText: 'Drill through' }).first().hover();
  await sleep(1500);
  await desktop.page.locator('[role=menuitem]').filter({ hasText: 'Day detail' }).first().click();
  await sleep(8000);
  const detail = await desktop.read();
  readings.drill = detail.cards;
  check('drill through: Day detail opens for Mon 7 Jul 2025', Object.values(detail.cards).includes('Mon 7 Jul 2025'), JSON.stringify(detail.cards));
  await desktop.page.locator('[role=tab]').filter({ hasText: 'Daily overview' }).first().click();
} finally {
  await desktop.disconnect();
}
writeFileSync(path.join(OUT, 'accept.json'), JSON.stringify({ results, readings }, null, 2) + '\n');
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length} checks: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
