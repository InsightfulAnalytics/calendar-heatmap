// Each apply call is judged the way Deneb judges it. The specs under test/specs/ are small day
// strips: strip.json is valid, and each other spec makes one deliberate mistake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, DENEB_OF, type RenderInput } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { rowsDated, sorted, useHarness } from './helpers.ts';

const sample = loadFixture('prototype-sample');

// Deneb's own warning texts (src/i18n/en-US.json at 2.0.0.0 and 1.9.1.0).
const EVENT_WARNING = 'The first parameter must be a valid `event` from the Vega view.';
const OPTIONS_WARNING = '`options` must be a valid object, and contain valid property values. Refer to the documentation for more information.';

// Local midnight of 7 July 2025 in each suite time zone (NZST is UTC+12 and PDT is UTC-7 in July).
// Deneb 2.0 writes a Date placeholder as its ISO string, Deneb 1.9 as Date.toString(), whose zone
// name in brackets depends on the browser, so only the offset is pinned for 1.9.
const JULY_7: Record<string, { iso: string; offset: string }> = {
  UTC: { iso: '2025-07-07T00:00:00.000Z', offset: 'GMT+0000' },
  'Pacific/Auckland': { iso: '2025-07-06T12:00:00.000Z', offset: 'GMT+1200' },
  'America/Los_Angeles': { iso: '2025-07-07T07:00:00.000Z', offset: 'GMT-0700' },
};

const harness = useHarness();

for (const { vega, timeZone, label: cell } of CELLS) {
  const deneb = DENEB_OF[vega];
  const render = (spec: string, extra: Partial<RenderInput> = {}) =>
    harness.render({ spec: `test/specs/${spec}.json`, fixture: 'prototype-sample', size: { width: 780, height: 120 }, vega, timeZone, ...extra });

  test(`${cell} the valid test strip selects the 36 sample rows from 7 Jul to 20 Aug`, async () => {
    const cal = await render('strip');
    await cal.drag('2025-07-07', '2025-08-20');
    const [call] = await cal.hostCalls();
    assert.equal(call.type, 'select');
    assert.deepEqual(call.type === 'select' && sorted(call.rows), rowsDated(sample, '2025-07-07', '2025-08-20'));
  });

  test(`${cell} a _{field}_ placeholder is filled from the clicked day as Deneb ${deneb} writes a date, and selects that day's row`, async () => {
    const expected = JULY_7[timeZone];
    assert.ok(expected, `no expected local midnight for ${timeZone}`);
    const cal = await render('apply-date-placeholder');
    await cal.click('2025-07-07');
    assert.deepEqual(await cal.hostCalls(), [{ type: 'select', rows: rowsDated(sample, '2025-07-07', '2025-07-07'), dates: ['2025-07-07'], multiSelect: false }]);
    // The selection is the same under both Deneb versions, so only the expression Deneb evaluated
    // tells 1.9 from 2.0 in this cell. The pinned text mirrors Deneb's placeholder rule (A4 in
    // src/page/runtime.js): 2.0 writes toDate('<ISO string>'), 1.9 toDate('<Date.toString()>').
    const [apply] = await cal.applyCalls();
    const resolved = apply.resolvedExpression ?? '';
    const written = /^time\(toDate\(datum\['Date'\]\)\) == time\(toDate\('(.*)'\)\)$/.exec(resolved)?.[1];
    assert.ok(written, `resolved to ${resolved}`);
    if (deneb === '2.0') assert.equal(written, expected.iso);
    else assert.ok(written.startsWith(`Mon Jul 07 2025 00:00:00 ${expected.offset} (`) && written.endsWith(')'), `Deneb 1.9 wrote ${written}`);
  });

  test(`${cell} an expression that reads a group-level signal selects nothing and reports an evaluation error`, async () => {
    const cal = await render('expr-group-signal', { selected: [0] });
    await cal.drag('2025-07-07', '2025-08-20');
    const [apply] = await cal.applyCalls();
    assert.deepEqual(apply.result.rowNumbers, []);
    assert.match(apply.result.warning ?? '', /Unrecognized signal name/);
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

  test(`${cell} an apply call with limit -1 (below 1 to 2,500) is rejected and leaves the previous Selection unchanged`, async () => {
    const cal = await render('strip', { options: { selectionLimit: -1 }, selected: [0, 1, 2] });
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
    const q1 = rowsDated(sample, '2025-01-01', '2025-03-31');
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
    assert.deepEqual(sorted(apply.result.rowNumbers ?? []), rowsDated(sample, '2025-07-07', '2025-08-20'));
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
