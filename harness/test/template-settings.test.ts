// The Template's layout and colour settings: cell shape, the header and legend switches, a shared
// scale field and target mode. Every setting defaults to the Template's earlier behaviour, so the
// default scene is checked against literals from the SPEC ("Colour", "Geometry"). The scale and
// target columns are added to the every-date-2025 fixture here, under names with spaces, the way
// a report author binds an optional column and names it in a setting. Expected colours are the BI
// Nexus theme's own values, and each day's expected fill is worked out from the fixture's rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, type Calendar, type Fixture, type FixtureRow } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { datesFromTo, rowsDated, sorted, useHarness } from './helpers.ts';

const harness = useHarness();

/** The BI Nexus ramp, lightest to darkest (SPEC, "Colour"), and the empty colour. */
const RAMP = ['#d2e2f7', '#9abeee', '#5693e3', '#1b64c3', '#113d77'];
const EMPTY = '#f1f5f9';
/** BI Nexus's good and bad colours (theme/bi-nexus.json), and the Template's faint grey. */
const GOOD = '#1e6fd9';
const BAD = '#d62828';
const FAINT = '#94a3b8';
const PEAK = '2025-12-19';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const base = loadFixture('every-date-2025');
const withColumns = (name: string, add: (row: FixtureRow) => FixtureRow): Fixture =>
  ({ name, dateField: base.dateField, rows: base.rows.map((r) => ({ ...r, ...add(r) })) });

/** A report measure repeated on every row: the top of a scale shared across several Calendars. */
const SCALE_TOP = 25000;
const scaled = withColumns('every-date-2025-scale', () => ({ 'Scale Max': SCALE_TOP }));
const unscaled = withColumns('every-date-2025-scale-blank', () => ({ 'Scale Max': null }));

/**
 * A flat daily target of 6,000, blank on 5 March (a day with sales), and equal to the value on the
 * peak day so that meeting a target is proved to count as good.
 */
const BLANK_TARGET = '2025-03-05';
const targeted = withColumns('every-date-2025-target', (r) => ({
  'Daily Target': r.Date === BLANK_TARGET ? null : r.Date === PEAK ? r.Sales : 6000,
}));
const TARGET = { targetField: 'Daily Target' };

/** Each day's expected fill in target mode, from the fixture's own values. */
function expectedTargetFill(row: FixtureRow): string {
  const value = row.Sales as number | null;
  const target = row['Daily Target'] as number | null;
  if (value === null) return EMPTY;
  if (target === null) return FAINT;
  return value >= target ? GOOD : BAD;
}

const top = (days: { y: number }[]) => Math.min(...days.map((d) => d.y));
const monthLabelY = async (cal: Calendar) => (await cal.labels()).find((l) => MONTHS.includes(l.text))?.y;

for (const { vega, timeZone, label: cell } of CELLS) {
  const render = (fixture: string | Fixture, options: Record<string, string | boolean> = {}) =>
    harness.render({ spec: 'template', fixture, vega, timeZone, options });

  test(`${cell} at the defaults the Template draws as before: capsule days, the header, the five-step legend, the Peak day ringed`, async () => {
    const cal = await render('every-date-2025');
    const days = await cal.days();
    assert.equal(days.length, 365);
    const notCapsule = days.filter((d) => Math.abs(d.cornerRadius - d.width / 2) > 1e-6).map((d) => d.date);
    assert.deepEqual(notCapsule, [], 'every day has a corner radius of half its width');
    const peak = await cal.day(PEAK);
    assert.equal(peak?.ring, true);
    assert.equal(peak?.fill, RAMP[4]);
    assert.deepEqual(days.filter((d) => d.ring).map((d) => d.date), [PEAK]);
    assert.deepEqual(peak?.tooltip, { Date: 'Fri 19 Dec 2025', Sales: '12,500' });
    const texts = (await cal.labels()).map((l) => l.text);
    for (const t of ['Sales', 'by Date', 'Less', 'More']) assert.ok(texts.includes(t), `'${t}' is drawn`);
    assert.deepEqual((await cal.swatches()).map((s) => s.fill), RAMP);
  });

  test(`${cell} square cells draw every day with a 2-pixel corner radius, and the Peak day ring the same, in the same places`, async () => {
    const capsule = await (await render('every-date-2025')).days();
    const cal = await render('every-date-2025', { cellShape: 'square' });
    const days = await cal.days();
    assert.deepEqual(days.map((d) => [d.date, d.x, d.y, d.width, d.height]), capsule.map((d) => [d.date, d.x, d.y, d.width, d.height]));
    assert.deepEqual(days.filter((d) => d.cornerRadius !== 2).map((d) => d.date), []);
    const peak = await cal.day(PEAK);
    assert.equal(peak?.ring, true);
    assert.equal(peak?.ringCornerRadius, 2);
  });

  test(`${cell} with the header off the title, subtitle and total are gone, and the month labels and grid move up together`, async () => {
    const on = await render('every-date-2025');
    const onTop = top(await on.days());
    const onMonth = await monthLabelY(on);
    const headerLabels = (await on.labels()).filter((l) => l.y < (onMonth ?? 0));
    assert.equal(headerLabels.length, 3, 'title, subtitle and total are drawn above the month labels');
    const off = await render('every-date-2025', { showHeader: false });
    const labels = await off.labels();
    const offMonth = await monthLabelY(off);
    assert.ok(offMonth !== undefined && onMonth !== undefined);
    for (const h of headerLabels) assert.equal(labels.find((l) => l.text === h.text), undefined, `'${h.text}' is not drawn`);
    assert.equal(labels.filter((l) => l.y < offMonth).length, 0, 'nothing is drawn above the month labels');
    const offTop = top(await off.days());
    assert.ok(offTop < onTop - 20, `the grid moves up: ${onTop} to ${offTop}`);
    assert.ok(Math.abs((onTop - onMonth) - (offTop - offMonth)) < 0.5, 'the month labels keep their place above the grid');
  });

  test(`${cell} with the legend off its text and swatches are gone, and every day is at least as tall`, async () => {
    const on = await (await render('every-date-2025')).days();
    const cal = await render('every-date-2025', { showLegend: false });
    const texts = (await cal.labels()).map((l) => l.text);
    assert.ok(!texts.includes('Less') && !texts.includes('More'));
    assert.deepEqual(await cal.swatches(), []);
    const days = await cal.days();
    assert.equal(top(days), top(on), 'the grid keeps its top');
    assert.ok(days[0].height >= on[0].height, `${on[0].height} to ${days[0].height}`);
    assert.ok(days[0].height > on[0].height || days[0].height >= days[0].width * 1.72 - 1e-6, 'taller, unless already at the aspect cap');
  });

  test(`${cell} a scale field sets the top of the steps: the peak at half the shared scale falls in the middle step, and keeps its ring`, async () => {
    const cal = await render(scaled, { scaleField: 'Scale Max' });
    const peak = await cal.day(PEAK);
    // 12,500 of 25,000: the third of five equal steps (10,000 to 15,000).
    assert.equal(peak?.fill, RAMP[2]);
    assert.equal(peak?.ring, true, 'the Peak day is still the Window\'s own highest day');
    assert.deepEqual((await cal.days()).filter((d) => d.ring).map((d) => d.date), [PEAK]);
    const fallback = await render(unscaled, { scaleField: 'Scale Max' });
    assert.equal((await fallback.day(PEAK))?.fill, RAMP[4], 'a blank scale column falls back to the Window maximum');
  });

  test(`${cell} target mode colours every day good or bad against its target, a blank target in the faint grey, empty days unchanged, no Peak ring`, async () => {
    const cal = await render(targeted, TARGET);
    const days = await cal.days();
    assert.deepEqual(days.map((d) => d.date), datesFromTo('2025-01-01', '2025-12-31'));
    const expected = new Map(targeted.rows.map((r) => [String(r.Date), expectedTargetFill(r)]));
    const wrong = days.filter((d) => d.fill !== expected.get(d.date)).map((d) => `${d.date} ${d.fill} not ${expected.get(d.date)}`);
    assert.deepEqual(wrong, []);
    assert.equal((await cal.day(BLANK_TARGET))?.fill, FAINT);
    assert.equal((await cal.day(PEAK))?.fill, GOOD, 'a day that meets its target is good');
    assert.equal((await cal.day('2025-01-05'))?.fill, BAD, 'a zero day under its target is bad');
    assert.equal((await cal.day('2025-12-25'))?.fill, EMPTY);
    assert.deepEqual(days.filter((d) => d.ring).map((d) => d.date), []);
  });

  test(`${cell} target mode's legend reads Under and Over with a bad and a good swatch, and the tooltip adds the target under its field's name`, async () => {
    const cal = await render(targeted, TARGET);
    const texts = (await cal.labels()).map((l) => l.text);
    assert.ok(texts.includes('Under') && texts.includes('Over'));
    assert.ok(!texts.includes('Less') && !texts.includes('More'));
    assert.deepEqual((await cal.swatches()).map((s) => s.fill), [BAD, GOOD]);
    assert.deepEqual((await cal.day(PEAK))?.tooltip, { Date: 'Fri 19 Dec 2025', Sales: '12,500', 'Daily Target': '12,500' });
    const sales = targeted.rows.find((r) => r.Date === BLANK_TARGET)?.Sales as number;
    const tip = (await cal.day(BLANK_TARGET))?.tooltip as Record<string, unknown>;
    assert.deepEqual(Object.keys(tip), ['Date', 'Sales', 'Daily Target']);
    assert.equal(tip.Date, 'Wed 05 Mar 2025');
    assert.equal(tip.Sales, new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(sales), 'formatted as the pbiFormat stand-in formats');
    assert.equal(tip['Daily Target'], '(blank)');
  });

  test(`${cell} target mode keeps Filtered-out days hollow and a drag selecting its range`, async () => {
    const gone = '2025-07-15';
    const fixture: Fixture = { ...targeted, rows: targeted.rows.filter((r) => r.Date !== gone) };
    const plain = await (await render(fixture, { everyDateHasRow: true })).day(gone);
    const cal = await render(fixture, { ...TARGET, everyDateHasRow: true });
    const day = await cal.day(gone);
    assert.deepEqual([day?.fill, day?.stroke, day?.strokeOpacity], [plain?.fill, plain?.stroke, plain?.strokeOpacity]);
    await cal.drag('2025-07-07', '2025-08-20');
    const [call] = await cal.hostCalls();
    assert.equal(call?.type, 'select');
    assert.deepEqual(sorted(call.type === 'select' ? call.rows : []), rowsDated(fixture, '2025-07-07', '2025-08-20'));
  });
}
