// The Template's Window: which days it draws, and where. A viewer finds a weekday by the labels
// beside the grid (M, W, F and S on every other row, Monday at the top), and a week by its column.
// Expected weekdays and columns are worked out here from the calendar, in UTC date arithmetic,
// never from the spec's own date maths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, type Calendar, type DayScene } from '../src/index.ts';
import { datesFromTo, useHarness } from './helpers.ts';

const harness = useHarness();

/** Monday 0 to Sunday 6, from the calendar. */
const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

const centreY = (d: DayScene) => Math.round((d.y + d.height / 2) * 10) / 10;
const centreX = (d: DayScene) => Math.round((d.x + d.width / 2) * 10) / 10;

/**
 * The grid as a viewer reads it: its rows top to bottom, each named by the weekday label drawn level
 * with it (null for an unlabelled row), and its week columns left to right.
 */
async function grid(cal: Calendar) {
  const days = await cal.days();
  const labels = await cal.labels();
  const ys = [...new Set(days.map(centreY))].sort((a, b) => a - b);
  const xs = [...new Set(days.map(centreX))].sort((a, b) => a - b);
  const rowLabels = ys.map((y) => labels.find((l) => /^[MTWFS]$/.test(l.text) && Math.abs(l.y - y) < 1)?.text ?? null);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const at = (date: string) => {
    const d = byDate.get(date);
    assert.ok(d, `no day is drawn for ${date}`);
    return { row: ys.indexOf(centreY(d)), column: xs.indexOf(centreX(d)) };
  };
  return { days, ys, xs, rowLabels, at };
}

/**
 * The Window from one date to another is drawn whole and in place: exactly its days, the first in
 * the first week column and the last in the last, every day in its weekday's row and in the column
 * its week falls in, with no week column missing or doubled.
 */
async function assertWindow(cal: Calendar, from: string, to: string) {
  const g = await grid(cal);
  const dates = datesFromTo(from, to);
  assert.deepEqual(g.rowLabels, MONDAY_FIRST);
  assert.deepEqual(g.days.map((d) => d.date), dates);
  const lead = weekdayOf(from);
  const weeks = Math.floor((dates.length - 1 + lead) / 7) + 1;
  assert.equal(g.xs.length, weeks, `${weeks} week columns`);
  const steps = g.xs.slice(1).map((x, i) => x - g.xs[i]);
  assert.ok(steps.every((s) => Math.abs(s - steps[0]) < 0.5), 'the week columns are evenly spaced');
  const misplaced = dates.filter((date, i) => {
    const at = g.at(date);
    return at.row !== weekdayOf(date) || at.column !== Math.floor((i + lead) / 7);
  });
  assert.deepEqual(misplaced, [], 'every day in its weekday row and its week column');
  assert.equal(g.at(from).column, 0);
  assert.equal(g.at(to).column, weeks - 1);
}

/** The rows a viewer reads when Monday is the top row: labels on Monday, Wednesday, Friday and Sunday. */
const MONDAY_FIRST = ['M', null, 'W', null, 'F', null, 'S'];
/** The empty colour (SPEC, "Colour"). */
const EMPTY = '#f1f5f9';
const ROW = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };

for (const { vega, timeZone, label: cell } of CELLS) {
  test(`${cell} a 2025 calendar-year Window draws 365 days, 1 January 2025 in the Wednesday row`, async () => {
    const cal = await harness.render({ spec: 'template', fixture: 'every-date-2025', vega, timeZone });
    const g = await grid(cal);
    assert.deepEqual(g.rowLabels, MONDAY_FIRST);
    assert.deepEqual(g.days.map((d) => d.date), datesFromTo('2025-01-01', '2025-12-31'));
    assert.equal(g.at('2025-01-01').row, ROW.Wednesday);
    await assertWindow(cal, '2025-01-01', '2025-12-31');
  });

  test(`${cell} a 2024 Window draws 366 days, 29 February in the Thursday row and 1 March in the Friday row`, async () => {
    const cal = await harness.render({ spec: 'template', fixture: 'leap-2024', vega, timeZone });
    const g = await grid(cal);
    assert.deepEqual(g.rowLabels, MONDAY_FIRST);
    assert.deepEqual(g.days.map((d) => d.date), datesFromTo('2024-01-01', '2024-12-31'));
    assert.equal(g.days.length, 366);
    assert.equal(g.at('2024-02-29').row, ROW.Thursday);
    assert.equal(g.at('2024-03-01').row, ROW.Friday);
    assert.equal(g.at('2024-02-29').column, g.at('2024-03-01').column, '29 Feb and 1 Mar share a week');
    await assertWindow(cal, '2024-01-01', '2024-12-31');
  });

  test(`${cell} a July fiscal-year Window draws FY26: 1 July 2025 in its first week column, 30 June 2026 in its last, no week missing`, async () => {
    const cal = await harness.render({ spec: 'template', fixture: 'report-sales-fy26', vega, timeZone, options: { windowMode: 'fiscal', fiscalStartMonth: 7 } });
    await assertWindow(cal, '2025-07-01', '2026-06-30');
    const g = await grid(cal);
    assert.equal(g.xs.length, 53);
    assert.equal(g.at('2025-07-01').row, ROW.Tuesday);
  });

  test(`${cell} slots outside the Window draw nothing, and a click on one sends nothing`, async () => {
    const cal = await harness.render({ spec: 'template', fixture: 'every-date-2025', vega, timeZone });
    const days = await cal.days();
    const centre = (date: string) => {
      const d = days.find((day) => day.date === date);
      assert.ok(d, `no day is drawn for ${date}`);
      return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
    };
    // 2025 starts on a Wednesday and ends on a Wednesday. The first column's Monday and Tuesday
    // slots (30 and 31 Dec 2024) and the last column's Thursday to Sunday slots (1 to 4 Jan 2026)
    // are outside the Window. Each slot is found by its column's day and a day in its weekday row.
    const slots: [string, { x: number; y: number }][] = [
      ['2024-12-30', { x: centre('2025-01-01').x, y: centre('2025-01-06').y }],
      ['2024-12-31', { x: centre('2025-01-01').x, y: centre('2025-01-07').y }],
      ['2026-01-01', { x: centre('2025-12-31').x, y: centre('2025-12-25').y }],
      ['2026-01-04', { x: centre('2025-12-31').x, y: centre('2025-12-28').y }],
    ];
    const background = await cal.pixelAt(await cal.backgroundPoint());
    assert.equal(background, '#ffffff', 'the view background, as the harness draws the visual container');
    assert.equal(await cal.pixelAt(centre('2025-01-01')), EMPTY, 'a drawn Empty day is seen in the empty colour');
    for (const [date, point] of slots) {
      assert.equal(days.find((d) => d.date === date), undefined, `${date} is not drawn as a day`);
      assert.equal(await cal.pixelAt(point), background, `nothing is drawn in the slot for ${date}`);
    }
    for (const [date, point] of slots) {
      await cal.clickAt(point);
      assert.deepEqual(await cal.hostCalls(), [], `a click on the slot for ${date} sends nothing to the host`);
      assert.deepEqual(await cal.applyCalls(), [], `a click on the slot for ${date} makes no apply call`);
    }
  });

  // The base 2025 fixture's latest date is 31 Dec 2025, so the Window is the fiscal year holding it.
  for (const [month, name, from, to] of [[4, 'April', '2025-04-01', '2026-03-31'], [10, 'October', '2025-10-01', '2026-09-30']] as const) {
    test(`${cell} a fiscal-year Window starting in ${name} draws ${from} to ${to} whole and in place`, async () => {
      const cal = await harness.render({ spec: 'template', fixture: 'base-2025', vega, timeZone, options: { windowMode: 'fiscal', fiscalStartMonth: month } });
      await assertWindow(cal, from, to);
    });
  }
}
