// The Report-exported fixture ('report-sales-fy26'): the sales Calendar's own query rows for FY26,
// exported from the Report's model in Desktop by report/desktop (npm run export-fixture). It is the
// shape the Report delivers: one row per date in the filter, the never-blank helper on every row,
// and blank sales on the days with no sales rows. Expected values are literals from the report
// seam's DAX tie-out (report/tieout.json) and from calendar arithmetic done here, never from the
// fixture itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CELLS, specFields } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { useHarness } from './helpers.ts';

// Recorded from the first export (2026-09-26). The export's own --check proves a second export
// gives identical rows; this proves the committed fixture has not drifted since.
const FINGERPRINT = '005f8dc3b978ca92770a251779639aa1c676afea04da59905a1db28ce10277a6';

const fixture = loadFixture('report-sales-fy26');
const byDate = new Map(fixture.rows.map((r) => [String(r.Date), r]));

/** Every date from one day to another, both included, stepped by whole UTC days. */
function datesFromTo(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

test("the report-sales-fy26 fixture carries exactly the fields the Report's Calendar binds, in the Report's order", () => {
  assert.deepEqual(Object.keys(fixture.rows[0]), specFields('report-calendar'));
  assert.equal(fixture.dateField, 'Date');
});

test('the report-sales-fy26 fixture has one row per FY26 date, 1 Jul 2025 to 30 Jun 2026, in date order (365 rows)', () => {
  const fy26 = datesFromTo('2025-07-01', '2026-06-30');
  assert.equal(fy26.length, 365);
  assert.deepEqual(fixture.rows.map((r) => r.Date), fy26);
});

test('the report-sales-fy26 fixture keeps the days with no sales as rows: blank sales, the helper still 1', () => {
  assert.ok(fixture.rows.every((r) => r['Days in Filter'] === 1), 'the helper reads 1 on every row');
  const blank = fixture.rows.filter((r) => r.Sales === null).map((r) => String(r.Date));
  // The tie-out's Active days for FY26 is 343 of 365, so 22 days have no sales.
  assert.equal(blank.length, 365 - 343);
  // The three no-sales days between 7 Jul and 20 Aug 2025 (the generator's blank-day rule).
  for (const day of ['2025-07-17', '2025-08-01', '2025-08-12']) assert.ok(blank.includes(day), `${day} is a row with blank sales`);
  assert.ok(fixture.rows.every((r) => r.Sales === null || (Number.isInteger(r.Sales) && (r.Sales as number) > 0)), 'every other day has a whole, positive amount');
});

test('the report-sales-fy26 fixture ties out to the report seam: 1,183,682 in all, 4,045 on 1 Jul 2025, 4,120 on 7 Jul, the best day 4 Dec 2025 at 6,440', () => {
  const total = fixture.rows.reduce((sum, r) => sum + ((r.Sales as number | null) ?? 0), 0);
  assert.equal(total, 1183682);
  assert.equal(byDate.get('2025-07-01')?.Sales, 4045);
  assert.equal(byDate.get('2025-07-07')?.Sales, 4120);
  const best = fixture.rows.reduce((a, b) => (((b.Sales as number | null) ?? -1) > ((a.Sales as number | null) ?? -1) ? b : a));
  assert.deepEqual([best.Date, best.Sales], ['2025-12-04', 6440]);
});

test('the report-sales-fy26 fixture is identical on every run: it matches its recorded fingerprint', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(fixture.rows)).digest('hex'), FINGERPRINT);
});

const harness = useHarness();

for (const { vega, timeZone, label: cell } of CELLS) {
  test(`${cell} the Report's Calendar takes the report-sales-fy26 fixture without error, every row delivered with its date at local midnight`, async () => {
    const cal = await harness.render({ spec: 'report-calendar', fixture: 'report-sales-fy26', vega, timeZone });
    assert.deepEqual(await cal.errors(), []);
    const delivered = await cal.deliveredRows();
    assert.equal(delivered.length, 365);
    const wrong = delivered.filter((r, i) => {
      const d = r.Date as { type?: string; localDate?: string; localTime?: string };
      return d?.type !== 'Date' || d.localDate !== fixture.rows[i].Date || d.localTime !== '00:00:00.000';
    });
    assert.deepEqual(wrong, []);
  });
}
