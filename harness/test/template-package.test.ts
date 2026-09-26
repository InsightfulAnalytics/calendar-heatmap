// The Template in the library's shape, and the standing gates every Template ticket must pass: the
// Deneb template library's offline checker (with its render read back, so a day drawn on the wrong
// weekday fails even when the checker says ok) and the deneb-pbir parse check under the Deneb 1.9
// and 2.0 rules. Expected weekdays are worked examples: 1 January 2025 is a Wednesday and 1 July
// 2025 a Tuesday.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TEMPLATE_FILE, TIME_ZONES, applyLimits, mapTemplate, readTemplate, specAsRun, type JsonObject } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { TEMPLATE_DIR, libraryCheck, parseCheck, readSvgScene, type SvgScene } from '../src/gates.ts';
import { OUT_DIR } from '../src/paths.ts';

const EMPTY = '#f1f5f9';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A rendered SVG as a viewer reads it: its rows top to bottom, each named by the weekday label
 * drawn beside it, the month label over the first week column, and that column's days top down.
 */
function readGrid(scene: SvgScene) {
  const cy = (d: SvgScene['days'][number]) => Math.round((d.y + d.height / 2) * 10) / 10;
  const ys = [...new Set(scene.days.map(cy))].sort((a, b) => a - b);
  const half = (scene.days[0]?.height ?? 0) / 2;
  const rowLabels = ys.map((y) => scene.labels.find((l) => /^[MTWFS]$/.test(l.text) && Math.abs(l.y - y) <= half)?.text ?? null);
  const left = Math.min(...scene.days.map((d) => d.x));
  const firstColumn = scene.days.filter((d) => Math.abs(d.x - left) < 0.5).sort((a, b) => a.y - b.y)
    .map((d) => ({ row: ys.indexOf(cy(d)), fill: d.fill }));
  const monthOverFirstColumn = scene.labels.find((l) => MONTHS.includes(l.text) && Math.abs(l.x - left) < 0.5)?.text ?? null;
  return { rows: ys.length, rowLabels, firstColumn, monthOverFirstColumn, days: scene.days.length };
}

const MONDAY_FIRST = ['M', null, 'W', null, 'F', null, 'S'];

test("the Template's folder is in the library's shape, with a README drafted under the library's section headings", () => {
  const readme = readFileSync(path.join(TEMPLATE_DIR, 'README.md'), 'utf8');
  const headings = [...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(headings, ['Fields', 'Settings', 'Setup', 'Limits', 'Compatibility', 'Export', 'Credit', 'Licence']);
  assert.deepEqual(JSON.parse(readFileSync(path.join(TEMPLATE_DIR, 'render.json'), 'utf8')), { width: 1080, height: 362 });
});

test("the Template's draft sample file holds one year of daily rows in one series, its header the declared field names, under 50 KB", () => {
  const file = path.join(TEMPLATE_DIR, 'sample-data.csv');
  const lines = readFileSync(file, 'utf8').trim().split(/\r?\n/);
  assert.deepEqual(lines[0].split(','), readTemplate(TEMPLATE_FILE).fields.map((f) => f.name));
  const dates = lines.slice(1).map((l) => l.split(',')[0]);
  assert.ok(dates.every((d) => d.startsWith('2025-')), 'one year: 2025');
  assert.equal(new Set(dates).size, dates.length, 'one row per day, one series');
  assert.ok(statSync(file).size < 50 * 1024, `${statSync(file).size} bytes`);
});

test('the Template passes a selection limit of 2,500 on every apply call', () => {
  assert.deepEqual(applyLimits(specAsRun('template', '6.4')), ['2500']);
});

for (const timeZone of TIME_ZONES) {
  test(`[${timeZone}] the library's offline checker passes on the Template with its draft sample file, and its render places 1 January 2025 in the Wednesday row`, () => {
    const run = libraryCheck(TEMPLATE_DIR, { renderDir: path.join(OUT_DIR, 'checker', 'template', timeZone.replace(/\//g, '-')), timeZone });
    assert.ok(run.ok, run.output);
    assert.match(run.output, /^ok\s+.*calendar-heatmap\.json$/m);
    assert.ok(run.svg, 'the checker wrote no SVG');
    const grid = readGrid(readSvgScene(run.svg));
    assert.equal(grid.days, 365);
    assert.deepEqual(grid.rowLabels, MONDAY_FIRST);
    assert.equal(grid.monthOverFirstColumn, 'Jan');
    // Wednesday 1 January to Sunday 5 January; 1 January is blank in the sample, so an Empty day.
    assert.deepEqual(grid.firstColumn.map((d) => d.row), [2, 3, 4, 5, 6]);
    assert.equal(grid.firstColumn[0].fill, EMPTY);
  });
}

/**
 * A copy of the Template, set as the Report sets its Calendar (a July fiscal-year Window, every date
 * has a row), beside the Report-exported fixture as its sample file (the Date and Sales columns;
 * the checker refuses a column the template does not declare, and the helper is not a placeholder).
 */
function reportShapedTemplate(): string {
  const dir = path.join(OUT_DIR, 'checker', 'report-fixture', 'calendar-heatmap');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const template = JSON.parse(readFileSync(TEMPLATE_FILE, 'utf8')) as JsonObject;
  const settings: Record<string, string | number | boolean> = { windowMode: 'fiscal', fiscalStartMonth: 7, everyDateHasRow: true };
  for (const signal of template.signals as JsonObject[]) if (String(signal.name) in settings) signal.value = settings[String(signal.name)];
  writeFileSync(path.join(dir, 'calendar-heatmap.json'), JSON.stringify(template, null, 2));
  const rows = loadFixture('report-sales-fy26').rows;
  writeFileSync(path.join(dir, 'sample-data.csv'), ['Date,Sales', ...rows.map((r) => `${r.Date},${r.Sales ?? ''}`)].join('\n') + '\n');
  for (const f of ['render.json', 'README.md']) copyFileSync(path.join(TEMPLATE_DIR, f), path.join(dir, f));
  return dir;
}

test("the library's offline checker passes on the Template fed the Report-exported fixture, and its render places 1 July 2025 in the first column's Tuesday row", () => {
  const dir = reportShapedTemplate();
  for (const timeZone of TIME_ZONES) {
    const run = libraryCheck(dir, { renderDir: path.join(OUT_DIR, 'checker', 'report-fixture', 'render', timeZone.replace(/\//g, '-')), timeZone });
    assert.ok(run.ok, `${timeZone}: ${run.output}`);
    assert.ok(run.svg, 'the checker wrote no SVG');
    const grid = readGrid(readSvgScene(run.svg));
    assert.equal(grid.days, 365, timeZone);
    assert.deepEqual(grid.rowLabels, MONDAY_FIRST, timeZone);
    assert.equal(grid.monthOverFirstColumn, 'Jul', timeZone);
    // Tuesday 1 July to Sunday 6 July 2025.
    assert.deepEqual(grid.firstColumn.map((d) => d.row), [1, 2, 3, 4, 5, 6], timeZone);
  }
});

for (const deneb of ['1.9', '2.0'] as const) {
  test(`the deneb-pbir parse check passes on the Template, over its draft sample file, under the Deneb ${deneb} rules`, () => {
    const dir = path.join(OUT_DIR, 'parse-check');
    mkdirSync(dir, { recursive: true });
    const { fields } = readTemplate(TEMPLATE_FILE);
    const spec = mapTemplate(TEMPLATE_FILE, Object.fromEntries(fields.map((f) => [f.key, f.name])));
    const specFile = path.join(dir, 'template.json');
    writeFileSync(specFile, JSON.stringify(spec, null, 2));
    const [header, ...lines] = readFileSync(path.join(TEMPLATE_DIR, 'sample-data.csv'), 'utf8').trim().split(/\r?\n/);
    const names = header.split(',');
    const rows = lines.map((l) => {
      const cells = l.split(',');
      return { [names[0]]: cells[0], [names[1]]: cells[1] === '' ? null : Number(cells[1]) };
    });
    const dataFile = path.join(dir, 'sample-rows.json');
    writeFileSync(dataFile, JSON.stringify(rows));
    const run = parseCheck(specFile, dataFile, deneb, { width: 1080, height: 362 }, path.join(dir, `template-deneb${deneb}.png`));
    assert.ok(run.ok, run.output);
    assert.equal(run.result?.denebContainerReferences, 0, 'no Deneb 2.0 container name, which 1.9 cannot parse');
  });
}
