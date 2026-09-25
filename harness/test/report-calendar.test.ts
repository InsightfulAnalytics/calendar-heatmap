// The Report's embedded Calendar at the template seam ('report-calendar'): the Deneb spec inside
// report/Daily Sales.Report/definition/pages/dailyOverview/visuals/calendar/visual.json, read (never
// written) the way Deneb stores it. T01 embedded the prototype with its apply limit raised to 2,500,
// so it must differ from the prototype in that limit only. The prototype's gesture checks run on it
// in test/prototype.test.ts. A missing Report file fails every check here; nothing is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CELLS, DENEB_OF, applyLimits, specAsRun, specFields, withApplyLimit, type JsonObject,
} from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { rowsDated, sorted, useHarness } from './helpers.ts';

// The Report's spec has no root $schema: the deneb-pbir embed strips it, because Deneb 2.0 flags
// one and the certified visual cannot fetch it. Vega ignores it, so it is no part of what runs.
const withoutSchema = ({ $schema: _schema, ...spec }: JsonObject) => spec;

test("a Deneb visual source whose file is missing fails loudly and names the file", () => {
  assert.throws(() => specAsRun({ visual: 'no-such-report/visual.json' }, '6.4'), /no-such-report[\\/]visual\.json/);
});

test("the report-fields sample carries exactly the fields the Report's Calendar binds, in the Report's order", () => {
  assert.deepEqual(Object.keys(loadFixture('report-fields-sample').rows[0]), specFields('report-calendar'));
});

const harness = useHarness();
const regions = loadFixture('regions-2025');

for (const { vega, timeZone, label: cell } of CELLS) {
  test(`${cell} the Report's Calendar is the prototype, config merged, with only its apply limit changed, to 2,500, as Deneb ${DENEB_OF[vega]} runs them`, () => {
    const report = specAsRun('report-calendar', vega);
    const prototype = specAsRun('prototype', vega);
    assert.deepEqual(applyLimits(report), ['2500']);
    assert.deepEqual(withoutSchema(withApplyLimit(report, 'LIMIT')), withoutSchema(withApplyLimit(prototype, 'LIMIT')));
  });

  test(`${cell} a drag over 540 rows is refused by the prototype's apply limit and applied by the Report's limit of 2,500`, async () => {
    // Six regions a day from 1 January to 31 March 2025: 90 days of 6 rows.
    const q1 = rowsDated(regions, '2025-01-01', '2025-03-31');
    assert.equal(q1.length, 540);
    const prototype = await harness.render({ spec: 'prototype', fixture: 'regions-2025', vega, timeZone });
    await prototype.drag('2025-01-01', '2025-03-31');
    assert.equal((await prototype.applyCalls())[0]?.result.exceedsLimit, true);
    assert.deepEqual(await prototype.hostCalls(), []);
    const report = await harness.render({ spec: 'report-calendar', fixture: 'regions-2025', vega, timeZone });
    await report.drag('2025-01-01', '2025-03-31');
    const [call] = await report.hostCalls();
    assert.deepEqual(call?.type === 'select' && sorted(call.rows), q1);
  });
}
