// The Report's embedded Calendar at the template seam ('report-calendar'): the Deneb spec inside
// report/Daily Sales.Report/definition/pages/dailyOverview/visuals/calendar/visual.json, read (never
// written) the way Deneb stores it. Since T06 it is the Template over the Report's Date and Sales
// fields, set to a July fiscal-year Window with 'every date has a row' on (the Report binds the
// never-blank Days in Filter helper), and nothing else changed. It is checked here on the rows the
// Report delivers (the report-sales-fy26 fixture). A missing Report file fails every check here;
// nothing is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CELLS, DENEB_OF, specAsRun, specFields, type JsonObject } from '../src/index.ts';
import { loadSpec, resolveSpecSource } from '../src/spec.ts';
import { parseCheck } from '../src/gates.ts';
import { OUT_DIR } from '../src/paths.ts';
import { loadFixture } from '../src/fixtures.ts';
import { datesFromTo, rowsDated, sorted, useHarness } from './helpers.ts';

// The Report's spec has no root $schema: the deneb-pbir embed strips it, because Deneb 2.0 flags
// one and the certified visual cannot fetch it. Vega ignores it, so it is no part of what runs.
const withoutSchema = ({ $schema: _schema, ...spec }: JsonObject) => spec;
/** The Report's settings for its sales Calendar (#6): a July fiscal year, every date a row. */
const REPORT_SETTINGS = { windowMode: 'fiscal', fiscalStartMonth: 7, everyDateHasRow: true };
const EMPTY = '#f1f5f9';
/** The Report's font (report/embed.py): the theme's Arial first; the Template's own default stays Segoe UI. */
const REPORT_FONT = 'Arial, Segoe UI, Helvetica Neue, sans-serif';
const inReportFont = (spec: JsonObject): JsonObject => {
  const config = (spec.config ?? {}) as JsonObject;
  return { ...spec, config: { ...config, font: REPORT_FONT, text: { ...((config.text ?? {}) as JsonObject), font: REPORT_FONT } } };
};

test("a Deneb visual source whose file is missing fails loudly and names the file", () => {
  assert.throws(() => specAsRun({ visual: 'no-such-report/visual.json' }, '6.4'), /no-such-report[\/]visual\.json/);
});

test("the report-fields sample carries exactly the fields the Report's Calendar binds, in the Report's order", () => {
  assert.deepEqual(Object.keys(loadFixture('report-fields-sample').rows[0]), specFields('report-calendar'));
});

for (const deneb of ['1.9', '2.0'] as const) {
  test(`the deneb-pbir parse check passes on the Report's Calendar, over the rows the Report delivers, under the Deneb ${deneb} rules`, () => {
    const dir = path.join(OUT_DIR, 'parse-check');
    mkdirSync(dir, { recursive: true });
    const specFile = path.join(dir, 'report-calendar.json');
    writeFileSync(specFile, JSON.stringify(loadSpec(resolveSpecSource('report-calendar')), null, 2));
    const dataFile = path.join(dir, 'report-sales-fy26.json');
    writeFileSync(dataFile, JSON.stringify(loadFixture('report-sales-fy26').rows));
    const run = parseCheck(specFile, dataFile, deneb, { width: 1202, height: 362 }, path.join(dir, `report-calendar-deneb${deneb}.png`));
    assert.ok(run.ok, run.output);
    assert.equal(run.result?.denebContainerReferences, 0);
  });
}

const harness = useHarness();
const fy26 = loadFixture('report-sales-fy26');
const regions = loadFixture('regions-2025');

for (const { vega, timeZone, label: cell } of CELLS) {
  const render = () => harness.render({ spec: 'report-calendar', fixture: 'report-sales-fy26', vega, timeZone });

  test(`${cell} the Report's Calendar is the Template over Date and Sales with a July fiscal-year Window, 'every date has a row' on and the Report's Arial font, and nothing else changed, as Deneb ${DENEB_OF[vega]} runs them`, () => {
    const report = specAsRun('report-calendar', vega);
    const template = specAsRun('template', vega, undefined, REPORT_SETTINGS);
    assert.deepEqual(withoutSchema(report), withoutSchema(inReportFont(template)));
  });

  test(`${cell} the Report's Calendar draws FY26 from the Report's rows: 1 July 2025 in its first column, 30 June 2026 in its last, the no-sales days as Empty days`, async () => {
    const cal = await render();
    const days = await cal.days();
    assert.deepEqual(days.map((d) => d.date), datesFromTo('2025-07-01', '2026-06-30'));
    const left = Math.min(...days.map((d) => d.x));
    const right = Math.max(...days.map((d) => d.x));
    assert.equal((await cal.day('2025-07-01'))?.x, left);
    assert.equal((await cal.day('2026-06-30'))?.x, right);
    const blank = fy26.rows.filter((r) => r.Sales === null).map((r) => String(r.Date));
    assert.equal(blank.length, 22);
    const notEmpty = days.filter((d) => blank.includes(d.date) && (d.fill !== EMPTY || typeof d.row !== 'number')).map((d) => d.date);
    assert.deepEqual(notEmpty, [], 'every no-sales day is an Empty day that keeps its row');
    assert.equal(days.filter((d) => d.fill === EMPTY).length, 22, 'no other day is empty');
  });

  test(`${cell} the Report's Calendar: a drag from 7 Jul to 20 Aug 2025 selects exactly the 45 rows dated in that range, the no-sales days included`, async () => {
    const cal = await render();
    await cal.drag('2025-07-07', '2025-08-20');
    const [call] = await cal.hostCalls();
    const expected = rowsDated(fy26, '2025-07-07', '2025-08-20');
    assert.equal(expected.length, 45);
    assert.deepEqual(call?.type === 'select' && sorted(call.rows), expected);
  });

  test(`${cell} the Report's Calendar: a click on the Peak day, 4 Dec 2025, selects its 1 row; a right click sends nothing; a background click clears`, async () => {
    const clicked = await render();
    await clicked.click('2025-12-04');
    assert.deepEqual(await clicked.hostCalls(), [{ type: 'select', rows: rowsDated(fy26, '2025-12-04', '2025-12-04'), dates: ['2025-12-04'], multiSelect: false }]);
    const right = await render();
    await right.rightClick('2025-12-04');
    assert.deepEqual(await right.hostCalls(), []);
    assert.deepEqual(await right.applyCalls(), []);
    const background = await render();
    await background.backgroundClick();
    assert.deepEqual(await background.hostCalls(), [{ type: 'clear' }]);
  });

  test(`${cell} a drag over 540 rows is refused by the prototype's apply limit of 400 and applied by the Report's limit of 2,500`, async () => {
    // Six regions a day from 1 July to 28 September 2025: 90 days of 6 rows, inside FY26.
    const q = rowsDated(regions, '2025-07-01', '2025-09-28');
    assert.equal(q.length, 540);
    const prototype = await harness.render({ spec: 'prototype', fixture: 'regions-2025', vega, timeZone });
    await prototype.drag('2025-07-01', '2025-09-28');
    assert.equal((await prototype.applyCalls())[0]?.result.exceedsLimit, true);
    assert.deepEqual(await prototype.hostCalls(), []);
    const report = await harness.render({ spec: 'report-calendar', fixture: 'regions-2025', vega, timeZone });
    await report.drag('2025-07-01', '2025-09-28');
    const [call] = await report.hostCalls();
    assert.deepEqual(call?.type === 'select' && sorted(call.rows), q);
  });
}
