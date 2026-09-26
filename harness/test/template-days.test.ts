// The Template's days: a valued day in its Ramp step, an Empty day in the empty colour, and what a
// day with no row means under the 'every date has a row' setting. Expected colours are the BI Nexus
// Ramp and empty colour listed in SPEC.md ("Colour"); expected days come from each fixture's own
// rows and from the calendar, never from the spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, type Calendar } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { datesFromTo, useHarness } from './helpers.ts';

const RAMP = ['#d2e2f7', '#9abeee', '#5693e3', '#1b64c3', '#113d77'];
const EMPTY = '#f1f5f9';

const harness = useHarness();
const everyDate = loadFixture('every-date-2025');
const base = loadFixture('base-2025');
/** The dates of 2025 the base fixture has no row for. */
const noRow = datesFromTo('2025-01-01', '2025-12-31').filter((d) => !base.rows.some((r) => r.Date === d));
/** The dates whose row holds a blank value. */
const blankIn = (rows: typeof base.rows) => rows.filter((r) => r.Sales === null).map((r) => String(r.Date));

const centre = async (cal: Calendar, date: string) => {
  const d = await cal.day(date);
  assert.ok(d, `no day is drawn for ${date}`);
  return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
};

for (const { vega, timeZone, label: cell } of CELLS) {
  test(`${cell} the Template keeps the prototype's Ramp: the prototype sample's days draw in the same steps`, async () => {
    const cal = await harness.render({ spec: 'template', fixture: 'prototype-sample', vega, timeZone });
    const fill = async (date: string) => (await cal.day(date))?.fill;
    // The prototype sample's maximum is 11,620, so the steps are 2,324 wide (test/scene.test.ts).
    assert.equal(await fill('2025-01-05'), RAMP[0], '469.07 is in the lowest step');
    assert.equal(await fill('2025-03-12'), RAMP[1], '2,386.16 is in the second step');
    assert.equal(await fill('2025-09-10'), RAMP[2], '6,348.25 is in the third step');
    assert.equal(await fill('2025-07-17'), RAMP[3], '7,367.57 is in the fourth step');
    assert.equal(await fill('2025-12-17'), RAMP[4], 'the Peak day is in the top step');
  });

  test(`${cell} an Empty day draws in the empty colour, never in the lowest step, while a day worth 0 draws in the lowest step`, async () => {
    const cal = await harness.render({ spec: 'template', fixture: 'every-date-2025', vega, timeZone });
    const blank = blankIn(everyDate.rows);
    assert.equal(blank.length, 5);
    for (const date of blank) {
      const day = await cal.day(date);
      assert.equal(day?.fill, EMPTY, `${date} (blank) is in the empty colour`);
      assert.equal(await cal.pixelAt(await centre(cal, date)), EMPTY, `${date} is seen in the empty colour`);
    }
    assert.equal((await cal.day('2025-01-05'))?.fill, RAMP[0], 'a value of 0 is in the lowest step');
    assert.notEqual(EMPTY, RAMP[0]);
    const lowest = (await cal.days()).filter((d) => d.fill === RAMP[0]).map((d) => d.date);
    assert.ok(lowest.length > 0 && lowest.every((d) => !blank.includes(d)), 'no blank day is in the lowest step');
  });

  test(`${cell} with 'every date has a row' off (the default), a day with no row is an Empty day with no row identity`, async () => {
    const cal = await harness.render({ spec: 'template', fixture: 'base-2025', vega, timeZone });
    assert.equal(noRow.length, 12);
    for (const date of noRow) {
      const day = await cal.day(date);
      assert.equal(day?.fill, EMPTY, `${date} is an Empty day`);
      assert.equal(day?.hasIdentity, false, `${date} carries no row identity at all`);
      assert.equal(day?.row, undefined);
    }
    const blankRow = await cal.day('2025-01-01');
    assert.deepEqual([blankRow?.fill, blankRow?.row], [EMPTY, 0], 'a blank value on a row is an Empty day that keeps its row');
  });

  test(`${cell} with 'every date has a row' on, the same day draws as a Filtered-out day, visibly different from an Empty day`, async () => {
    const cal = await harness.render({ spec: 'template', fixture: 'base-2025', vega, timeZone, options: { everyDateHasRow: true } });
    const background = await cal.pixelAt(await cal.backgroundPoint());
    for (const date of noRow) {
      const day = await cal.day(date);
      assert.ok(day, `${date} is still drawn`);
      assert.ok(![EMPTY, ...RAMP].includes(day.fill ?? ''), `${date} is not filled in the empty colour or a Ramp step (fill ${day.fill})`);
      assert.ok(day.stroke && day.strokeOpacity > 0 && day.strokeWidth > 0, `${date} has a visible outline`);
      assert.equal(await cal.pixelAt(await centre(cal, date)), background, `${date} is hollow: its centre shows the background`);
      assert.equal(day.hasIdentity, false, `${date} carries no row identity`);
    }
    // A blank value on a row is still an Empty day, filled and without an outline.
    const empty = await cal.day('2025-01-01');
    assert.equal(empty?.fill, EMPTY);
    assert.equal(empty?.strokeOpacity, 0);
    assert.equal(await cal.pixelAt(await centre(cal, '2025-01-01')), EMPTY);
  });
}
