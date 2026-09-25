// Asking the scene about days by date: colour, ring, tooltip, row identity, and the labels drawn.
// Expected colours are the BI Nexus ramp listed in SPEC.md ("Colour"): five equal-interval steps
// over 0 to the window's maximum (11,620 in the prototype sample, so steps of 2,324).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS } from '../src/index.ts';
import { useHarness } from './helpers.ts';

const RAMP = ['#d2e2f7', '#9abeee', '#5693e3', '#1b64c3', '#113d77'];
const EMPTY = '#f1f5f9';

const harness = useHarness();

for (const { vega, timeZone, label: cell } of CELLS) {
  const render = (selected?: number[]) => harness.render({ spec: 'prototype', fixture: 'prototype-sample', vega, timeZone, selected });

  test(`${cell} a check can read the colour of the day for a given date`, async () => {
    const cal = await render();
    const fill = async (date: string) => (await cal.day(date))?.fill;
    assert.equal(await fill('2025-01-05'), RAMP[0], '469.07 is in the lowest step');
    assert.equal(await fill('2025-03-12'), RAMP[1], '2,386.16 is in the second step');
    assert.equal(await fill('2025-09-10'), RAMP[2], '6,348.25 is in the third step');
    assert.equal(await fill('2025-07-17'), RAMP[3], '7,367.57 is in the fourth step');
    assert.equal(await fill('2025-12-17'), RAMP[4], 'the Peak day is in the top step');
    assert.equal(await fill('2025-01-01'), EMPTY, 'a blank value draws in the empty colour');
    assert.equal(await fill('2025-01-12'), EMPTY, 'a day with no row draws in the empty colour');
  });

  test(`${cell} only the Peak day carries the ring`, async () => {
    const cal = await render();
    const ringed = (await cal.days()).filter((d) => d.ring).map((d) => d.date);
    assert.deepEqual(ringed, ['2025-12-17']);
  });

  test(`${cell} a check can read what a day's tooltip holds and which row it carries`, async () => {
    const cal = await render();
    const peak = await cal.day('2025-12-17');
    assert.deepEqual(peak?.tooltip, { Date: 'Wed 17 Dec 2025', Sales: '11,620' });
    assert.equal(peak?.row, 281);
    assert.equal(peak?.hasIdentity, true);
    const noRow = await cal.day('2025-01-12');
    assert.deepEqual(noRow?.tooltip, { Date: 'Sun 12 Jan 2025', Sales: '(blank)' });
  });

  test(`${cell} a check can tell a day that carries no identity at all from one whose identity is null`, async () => {
    // The test strip draws days from a date sequence, not from rows: no day's datum has an identity.
    const strip = await harness.render({ spec: 'test/specs/strip.json', fixture: 'prototype-sample', size: { width: 780, height: 120 }, vega, timeZone });
    const day = await strip.day('2025-01-12');
    assert.equal(day?.hasIdentity, false);
    assert.equal(day?.row, undefined);
  });

  // CHARACTERISATION of the prototype, not a requirement: it records what the prototype does today
  // so the Template restructure (T06) can prove it changed nothing. T12 changes it on purpose (T06's
  // Empty day, "no row identity", may get there first): SPEC ("Tooltips, context menu and
  // drill-through") says a day without a row leaves the identity off rather than setting it to
  // null, because Deneb 1.9 treats any identity that is present as real. When that lands, this
  // check is replaced by one that expects hasIdentity false.
  test(`${cell} characterisation of the prototype (T12 changes it): a day with no row carries an identity set to null, not an absent one`, async () => {
    const cal = await render();
    const noRow = await cal.day('2025-01-12');
    assert.equal(noRow?.hasIdentity, true);
    assert.equal(noRow?.row, null);
  });

  test(`${cell} a check can read which labels are drawn`, async () => {
    const cal = await render();
    const texts = (await cal.labels()).map((l) => l.text);
    // What prototype/render-bi-nexus.png shows: every other month from January, four weekday initials.
    for (const t of ['Sales', 'by Order Date', '1.33M', 'Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov', 'M', 'W', 'F', 'S', 'Less', 'More']) {
      assert.ok(texts.includes(t), `label '${t}' is not drawn; drawn: ${texts.join(' | ')}`);
    }
    assert.ok(!texts.includes('Feb'), 'February is not labelled');
  });

  test(`${cell} every day of 2025 is drawn exactly once`, async () => {
    const cal = await render();
    const days = await cal.days();
    assert.equal(days.length, 365);
    assert.equal(days[0].date, '2025-01-01');
    assert.equal(days.at(-1)?.date, '2025-12-31');
  });

  test(`${cell} after a drag the host feeds the selection back: the selected days are drawn at full opacity and every other day is dimmed`, async () => {
    const cal = await render();
    await cal.drag('2025-07-07', '2025-08-20');
    const selectedDates = new Set((await cal.hostCalls()).flatMap((c) => (c.type === 'select' ? c.dates : [])));
    assert.equal(selectedDates.size, 36);
    const days = await cal.days();
    const full = days.filter((d) => d.opacity === 1).map((d) => d.date);
    assert.deepEqual(new Set(full), selectedDates);
    assert.ok(days.every((d) => d.opacity === 1 || d.opacity < 0.5), 'dimmed days are clearly dimmed');
  });

  test(`${cell} after a background click clears the selection, every day is drawn at full opacity again`, async () => {
    const cal = await render();
    await cal.drag('2025-07-07', '2025-08-20');
    await cal.backgroundClick();
    assert.deepEqual((await cal.hostCalls()).map((c) => c.type), ['select', 'clear']);
    assert.ok((await cal.days()).every((d) => d.opacity === 1));
  });

  test(`${cell} rows the host already holds selected arrive flagged on and the rest off; with no selection every row is neutral`, async () => {
    const held = await render([0, 1, 2]);
    const flags = (await held.deliveredRows()).map((r) => r.__selected__);
    assert.deepEqual(flags.slice(0, 4), ['on', 'on', 'on', 'off']);
    assert.equal(flags.filter((f) => f === 'on').length, 3);
    assert.deepEqual((await held.days()).filter((d) => d.opacity === 1).map((d) => d.date), ['2025-01-01', '2025-01-02', '2025-01-03']);
    const none = await render();
    assert.ok((await none.deliveredRows()).every((r) => r.__selected__ === 'neutral'));
    await assert.rejects(held.days(), /replaced by a later render/);
  });
}
