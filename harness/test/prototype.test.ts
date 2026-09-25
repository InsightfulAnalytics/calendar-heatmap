// The prototype spec at the template seam: selection gestures, host calls and the scene, under
// both Vega versions (Deneb 1.9 and 2.0) and in three time zones. Expected rows come from the
// sample's own date text, never from the spec's date maths.
//
// The four gesture checks also run on the Report's embedded Calendar ('report-calendar'), fed the
// same sample under the Report's field names: it is the prototype with its apply limit raised, so
// the prototype's checks must pass on it too. Its check names start "the Report's Calendar:".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { rowsDated, sorted, useHarness } from './helpers.ts';

const sample = loadFixture('prototype-sample');
const SUBJECTS = [
  { name: '', spec: 'prototype', fixture: 'prototype-sample' },
  { name: "the Report's Calendar: ", spec: 'report-calendar', fixture: 'report-fields-sample' },
];

const harness = useHarness();

for (const { vega, timeZone, label: cell } of CELLS) {
  const render = () => harness.render({ spec: 'prototype', fixture: 'prototype-sample', vega, timeZone });

  for (const subject of SUBJECTS) {
    const renderSubject = () => harness.render({ spec: subject.spec, fixture: subject.fixture, vega, timeZone });

    test(`${cell} ${subject.name}a drag from 7 Jul to 20 Aug 2025 selects exactly the 36 sample rows dated in that range`, async () => {
      const cal = await renderSubject();
      await cal.drag('2025-07-07', '2025-08-20');
      const selects = (await cal.hostCalls()).filter((c) => c.type === 'select');
      assert.equal(selects.length, 1);
      const expected = rowsDated(loadFixture(subject.fixture), '2025-07-07', '2025-08-20');
      assert.equal(expected.length, 36);
      assert.deepEqual(sorted(selects[0].rows), expected);
    });

    test(`${cell} ${subject.name}a click on the Peak day, 17 Dec 2025, selects its 1 row`, async () => {
      const cal = await renderSubject();
      await cal.click('2025-12-17');
      const calls = await cal.hostCalls();
      assert.deepEqual(calls, [{ type: 'select', rows: [281], dates: ['2025-12-17'], multiSelect: false }]);
    });

    test(`${cell} ${subject.name}a right click on a day records no host call`, async () => {
      const cal = await renderSubject();
      await cal.rightClick('2025-03-12');
      assert.deepEqual(await cal.hostCalls(), []);
      assert.deepEqual(await cal.applyCalls(), []);
    });

    test(`${cell} ${subject.name}a background click records a clear`, async () => {
      const cal = await renderSubject();
      await cal.backgroundClick();
      assert.deepEqual(await cal.hostCalls(), [{ type: 'clear' }]);
    });
  }

  // 2025 daylight-saving changes: Los Angeles 9 Mar and 2 Nov, Auckland 6 Apr and 28 Sep.
  for (const [from, to] of [['2025-03-01', '2025-04-10'], ['2025-09-20', '2025-11-08']]) {
    test(`${cell} a drag across the daylight-saving changes from ${from} to ${to} selects exactly the sample rows dated in that range`, async () => {
      const cal = await render();
      await cal.drag(from, to);
      const selects = (await cal.hostCalls()).filter((c) => c.type === 'select');
      assert.equal(selects.length, 1);
      assert.deepEqual(sorted(selects[0].rows), rowsDated(sample, from, to));
    });
  }

  test(`${cell} the Sundays of the 2025 daylight-saving changes sit in the Sunday row and in their Monday's week column`, async () => {
    const cal = await render();
    const at = async (date: string) => {
      const d = await cal.day(date);
      assert.ok(d, `no day drawn for ${date}`);
      return d;
    };
    // Each pair: a change Sunday, the Monday that starts its week, the Sunday a week before, the next Monday.
    for (const [sunday, monday, prevSunday, nextMonday] of [
      ['2025-03-09', '2025-03-03', '2025-03-02', '2025-03-10'],
      ['2025-04-06', '2025-03-31', '2025-03-30', '2025-04-07'],
      ['2025-09-28', '2025-09-22', '2025-09-21', '2025-09-29'],
      ['2025-11-02', '2025-10-27', '2025-10-26', '2025-11-03'],
    ]) {
      const s = await at(sunday);
      assert.equal(s.x, (await at(monday)).x, `${sunday} is not in the column of ${monday}`);
      assert.equal(s.y, (await at(prevSunday)).y, `${sunday} is not in the row of ${prevSunday}`);
      assert.ok((await at(nextMonday)).x > s.x, `${nextMonday} does not start a new column`);
    }
  });
}
