// Each apply call is judged the way Deneb judges it. The specs under test/specs/ are small day
// strips: strip.json is valid, and each other spec makes one deliberate mistake.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openHarness, type Harness, type RenderInput } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { CELLS } from './matrix.ts';

const sample = loadFixture('prototype-sample');
const rowsDated = (from: string, to: string) =>
  sample.rows.flatMap((r, i) => (String(r.Date) >= from && String(r.Date) <= to ? [i] : []));
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

// Deneb's own warning texts (src/i18n/en-US.json at 2.0.0.0 and 1.9.1.0).
const EVENT_WARNING = 'The first parameter must be a valid `event` from the Vega view.';
const OPTIONS_WARNING = '`options` must be a valid object, and contain valid property values. Refer to the documentation for more information.';

let harness: Harness;
before(async () => { harness = await openHarness(); });
after(async () => { await harness.close(); });

for (const { vega, timeZone, label: cell } of CELLS) {
  const render = (spec: string, extra: Partial<RenderInput> = {}) =>
    harness.render({ spec: `test/specs/${spec}.json`, fixture: 'prototype-sample', size: { width: 780, height: 120 }, vega, timeZone, ...extra });

  test(`${cell} the valid test strip selects the 36 sample rows from 7 Jul to 20 Aug`, async () => {
    const cal = await render('strip');
    await cal.drag('2025-07-07', '2025-08-20');
    const [call] = await cal.hostCalls();
    assert.equal(call.type, 'select');
    assert.deepEqual(call.type === 'select' && sorted(call.rows), rowsDated('2025-07-07', '2025-08-20'));
  });

  test(`${cell} an expression that reads a group-level signal selects nothing and reports an evaluation error`, async () => {
    const cal = await render('expr-group-signal', { selected: [0] });
    await cal.drag('2025-07-07', '2025-08-20');
    const [apply] = await cal.applyCalls();
    assert.deepEqual(apply.result.rowNumbers, []);
    assert.match(apply.result.warning ?? '', /Unrecognized signal name: "loMs"/);
    assert.deepEqual(await cal.hostCalls(), []);
    assert.deepEqual(await cal.selection(), [0]);
  });

  test(`${cell} an expression that reads a derived field selects nothing`, async () => {
    const cal = await render('expr-derived-field', { selected: [0] });
    await cal.drag('2025-07-07', '2025-08-20');
    const [apply] = await cal.applyCalls();
    assert.deepEqual(apply.result, { rowNumbers: [] });
    assert.deepEqual(await cal.hostCalls(), [{ type: 'clear' }], 'Deneb clears the selection when no row matches');
    assert.deepEqual(await cal.selection(), []);
  });

  test(`${cell} an apply call with limit 2,501 is rejected and leaves the previous Selection unchanged`, async () => {
    const cal = await render('apply-limit-2501', { selected: [0, 1, 2] });
    await cal.drag('2025-07-07', '2025-08-20');
    const [apply] = await cal.applyCalls();
    assert.deepEqual(apply.result, { warning: OPTIONS_WARNING, rowNumbers: [] });
    assert.deepEqual(await cal.hostCalls(), []);
    assert.deepEqual(await cal.selection(), [0, 1, 2]);
  });

  test(`${cell} an apply call with a non-browser event is rejected and leaves the previous Selection unchanged`, async () => {
    const cal = await render('apply-non-browser-event', { selected: [0, 1, 2] });
    await cal.drag('2025-07-07', '2025-08-20');
    const [apply] = await cal.applyCalls();
    assert.equal(apply.browserEvent, false);
    assert.deepEqual(apply.result, { warning: EVENT_WARNING, rowNumbers: [] });
    assert.deepEqual(await cal.hostCalls(), []);
    assert.deepEqual(await cal.selection(), [0, 1, 2]);
  });

  test(`${cell} an apply call with limit 0 is not given a limit of its own: over the format pane's data point limit it is refused and the previous Selection stays`, async () => {
    const q1 = rowsDated('2025-01-01', '2025-03-31');
    assert.ok(q1.length > 50 && q1.length <= 100, `the first quarter holds ${q1.length} rows`);
    const refused = await render('apply-limit-0', { selected: [0, 1, 2] });
    await refused.drag('2025-01-01', '2025-03-31');
    const [apply] = await refused.applyCalls();
    assert.equal(apply.result.exceedsLimit, true, 'the default data point limit is 50');
    assert.deepEqual(await refused.hostCalls(), []);
    assert.deepEqual(await refused.selection(), [0, 1, 2]);
    const accepted = await render('apply-limit-0', { dataPointLimit: 100 });
    await accepted.drag('2025-01-01', '2025-03-31');
    const [call] = await accepted.hostCalls();
    assert.deepEqual(call.type === 'select' && sorted(call.rows), q1);
  });

  test(`${cell} an apply call matching more than its limit returns the limit-exceeded flag and keeps the previous Selection`, async () => {
    const cal = await render('strip', { options: { selectionLimit: 10 }, selected: [0, 1, 2] });
    await cal.drag('2025-07-07', '2025-08-20');
    const [apply] = await cal.applyCalls();
    assert.equal(apply.result.exceedsLimit, true);
    assert.equal(apply.result.multiSelect, false);
    assert.deepEqual(sorted(apply.result.rowNumbers ?? []), rowsDated('2025-07-07', '2025-08-20'));
    assert.equal(apply.result.warning, undefined);
    assert.deepEqual(await cal.hostCalls(), []);
    assert.equal(await cal.limitWarning(), true);
    assert.deepEqual(await cal.selection(), [0, 1, 2]);
  });

  test(`${cell} with shift held the rows already selected count toward the limit`, async () => {
    // 36 rows in the drag, 5 already selected, limit 40: 41 with shift, 36 without.
    const withShift = await render('strip', { options: { selectionLimit: 40 }, selected: [0, 1, 2, 3, 4] });
    await withShift.drag('2025-07-07', '2025-08-20', { shift: true });
    assert.equal((await withShift.applyCalls())[0].result.exceedsLimit, true);
    const without = await render('strip', { options: { selectionLimit: 40 }, selected: [0, 1, 2, 3, 4] });
    await without.drag('2025-07-07', '2025-08-20');
    assert.equal((await without.applyCalls())[0].result.exceedsLimit, undefined);
    assert.equal((await without.hostCalls())[0].type, 'select');
  });
}
