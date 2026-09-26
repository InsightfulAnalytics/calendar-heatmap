// Cross-highlight on the Template (#16). With highlight on, Deneb 2.0 delivers the value field's
// companion, `<value field>__highlight`, beside it: equal to the value when no highlight is in
// force, and null on the rows another visual's selection leaves out. The Template dims a valued
// day whose companion is null to the unselected days' opacity, keeps highlighted days at full
// strength and Empty days as they are, and dims the Peak day ring with its day. The status and
// comparator fields Deneb may also deliver are ignored. Expected days come from the fixture's
// own rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, type Fixture, type Scene } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { useHarness } from './helpers.ts';

const harness = useHarness();

/** The unselected days' opacity (SPEC, "Selection"), which a dimmed day shares. */
const DIM = 0.28;
const EMPTY = '#f1f5f9';
const PEAK = '2025-12-19';
const FROM = '2025-07-07';
const TO = '2025-08-20';

const base = loadFixture('every-date-2025');
const sales = base.rows.map((r) => r.Sales as number | null);
/** No highlight in force: Deneb gives every row its own value as the highlight. */
const unfiltered = sales;
/** Another visual highlights 7 Jul to 20 Aug 2025: the other rows' highlight is null. */
const inRange = (date: string) => date >= FROM && date <= TO;
const ranged = base.rows.map((r) => (inRange(String(r.Date)) ? (r.Sales as number | null) : null));
/** The same rows with a highlight status and comparator present and deliberately wrong. */
const withStatus: Fixture = {
  ...base,
  name: 'every-date-2025-highlight-status',
  rows: base.rows.map((r) => ({ ...r, Sales__highlightStatus: 'neutral', Sales__highlightComparator: 'lt' })),
};

const layout = (scene: Scene) => ({ days: scene.days, labels: scene.labels, swatches: scene.swatches });

for (const { vega, timeZone, label: cell } of CELLS) {
  const render = (fixture: string | Fixture, highlight?: (number | null)[]) =>
    harness.render({ spec: 'template', fixture, vega, timeZone, ...(highlight ? { highlight: { Sales: highlight } } : {}) });

  test(`${cell} with no highlight companion field at all no day is dimmed`, async () => {
    const days = await (await render('every-date-2025')).days();
    assert.equal(days.length, 365);
    assert.deepEqual(days.filter((d) => d.opacity !== 1).map((d) => d.date), []);
    assert.equal(days.find((d) => d.date === PEAK)?.ringOpacity, 1);
  });

  test(`${cell} a highlight companion equal to every value (no highlight in force) draws the same scene as none`, async () => {
    const plain = layout(await (await render('every-date-2025')).scene());
    const lit = layout(await (await render('every-date-2025', unfiltered)).scene());
    assert.deepEqual(lit, plain);
  });

  test(`${cell} a highlight on 7 Jul to 20 Aug 2025 keeps exactly those valued days full, dims the other valued days and the Peak ring, and leaves Empty days as they are`, async () => {
    const cal = await render('every-date-2025', ranged);
    const days = await cal.days();
    const valueOf = new Map(base.rows.map((r) => [String(r.Date), r.Sales]));
    const wrong = days.filter((d) => {
      const valued = valueOf.get(d.date) != null;
      const want = !valued || inRange(d.date) ? 1 : DIM;
      return Math.abs(d.opacity - want) > 1e-9;
    }).map((d) => `${d.date} ${d.opacity}`);
    assert.deepEqual(wrong, []);
    const full = days.filter((d) => d.opacity === 1 && valueOf.get(d.date) != null).map((d) => d.date);
    assert.equal(full.length, base.rows.filter((r) => inRange(String(r.Date)) && r.Sales != null).length);
    const empty = days.filter((d) => valueOf.get(d.date) == null);
    assert.ok(empty.length > 0);
    assert.deepEqual(empty.filter((d) => d.fill !== EMPTY || d.opacity !== 1).map((d) => d.date), [], 'Empty days keep their look');
    const peak = await cal.day(PEAK);
    assert.equal(peak?.ring, true);
    assert.equal(peak?.ringOpacity, DIM, 'the Peak ring follows its day');
  });

  test(`${cell} a highlight status and comparator, present and wrong, change nothing`, async () => {
    const plain = layout(await (await render('every-date-2025', ranged)).scene());
    const status = layout(await (await render(withStatus, ranged)).scene());
    assert.deepEqual(status, plain);
  });
}
