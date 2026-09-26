// The fixture generator: deterministic rows for the base 2025, several-regions, every-date-present
// and leap-year fixtures. Properties are checked with Node's own UTC calendar, independent of any
// spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CELLS } from '../src/index.ts';
import { loadFixture, type Fixture } from '../src/fixtures.ts';
import { useHarness } from './helpers.ts';

// A deliberate change detector, recorded from the generator's own output when each fixture was
// first generated. It is what proves a fixture is identical on every run, on every machine, since
// generating twice in one run cannot catch a dependence on the date, the clock or the platform.
// Update a fingerprint only in the commit that means to change that fixture; any other mismatch
// is a determinism failure.
const FINGERPRINTS: Record<string, string> = {
  'base-2025': '9b0b423c7e5d24df8032bb31a25ba4d5e4db1f77d1668a831b70e222f87c7e50',
  'regions-2025': '37ea4099c9645c95614908afee1ac94f4c9d8b5723f105845a6b65ad605c87d2',
  'every-date-2025': '2da427e1852208c602600d2e7f45b854ab19ec83696e7057bb21c4d170f50f0d',
  'leap-2024': '002deba5b3dcdc199d8eb54fb2ad24a068bc57faea5d957e962674af17db978f',
};
const GENERATED = Object.keys(FINGERPRINTS);

const fingerprint = (f: Fixture) => createHash('sha256').update(JSON.stringify(f.rows)).digest('hex');
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sunday to 6 Saturday
const allDatesOf = (year: number, days: number) => Array.from({ length: days }, (_, i) => new Date(Date.UTC(year, 0, 1 + i)).toISOString().slice(0, 10));
const allDates2025 = () => allDatesOf(2025, 365);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

for (const name of GENERATED) {
  test(`the ${name} fixture is identical when generated twice in one run`, () => {
    assert.deepEqual(loadFixture(name), loadFixture(name));
  });

  test(`the ${name} fixture is identical on every run: it matches its recorded fingerprint`, () => {
    assert.equal(fingerprint(loadFixture(name)), FINGERPRINTS[name]);
  });
}

test('the base 2025 fixture holds blank values, lower weekends, a December peak and some dates with no row', () => {
  const f = loadFixture('base-2025');
  assert.deepEqual(Object.keys(f.rows[0]), ['Date', 'Sales']);
  const dates = f.rows.map((r) => String(r.Date));
  assert.equal(new Set(dates).size, dates.length, 'one row per date');
  const missing = allDates2025().filter((d) => !dates.includes(d));
  assert.ok(missing.length >= 5, `${missing.length} dates have no row`);
  assert.ok(dates.every((d) => d.startsWith('2025-')));
  const blank = f.rows.filter((r) => r.Sales === null).map((r) => String(r.Date));
  assert.ok(blank.length >= 3, `${blank.length} rows have a blank value`);
  // Both kinds of empty day inside the 7 Jul to 20 Aug range the selection checks use.
  assert.ok(missing.some((d) => d >= '2025-07-07' && d <= '2025-08-20'), 'a date with no row between 7 Jul and 20 Aug');
  assert.ok(blank.some((d) => d >= '2025-07-07' && d <= '2025-08-20'), 'a blank value between 7 Jul and 20 Aug');
  const valued = f.rows.filter((r) => typeof r.Sales === 'number') as { Date: string; Sales: number }[];
  const weekend = valued.filter((r) => [0, 6].includes(weekday(r.Date))).map((r) => r.Sales);
  const weekdays = valued.filter((r) => ![0, 6].includes(weekday(r.Date))).map((r) => r.Sales);
  assert.ok(mean(weekend) < 0.6 * mean(weekdays), 'weekends run well below weekdays');
  const peak = valued.reduce((a, b) => (b.Sales > a.Sales ? b : a));
  assert.ok(peak.Date.startsWith('2025-12-'), `the peak is on ${peak.Date}`);
  assert.equal(valued.filter((r) => r.Sales === peak.Sales).length, 1, 'the peak is a single day');
});

test('the several-regions fixture holds six regions for every date of 2025, within 2,196 rows', () => {
  const f = loadFixture('regions-2025');
  assert.deepEqual(Object.keys(f.rows[0]), ['Date', 'Region', 'Sales']);
  const regions = [...new Set(f.rows.map((r) => String(r.Region)))];
  assert.equal(regions.length, 6);
  assert.ok(f.rows.length <= 2196, `${f.rows.length} rows`);
  for (const region of regions) {
    const dates = f.rows.filter((r) => r.Region === region).map((r) => String(r.Date));
    assert.deepEqual(dates, allDates2025(), `${region} has a row for every date of 2025`);
  }
  assert.ok(f.rows.some((r) => r.Sales === null), 'some values are blank');
});

test('the every-date-present fixture has a row for every date of 2025, the helper on each, blank values, one zero and a single December peak', () => {
  const f = loadFixture('every-date-2025');
  assert.deepEqual(Object.keys(f.rows[0]), ['Date', 'Days in Filter', 'Sales']);
  assert.deepEqual(f.rows.map((r) => r.Date), allDates2025(), 'one row per date of 2025, in date order');
  assert.ok(f.rows.every((r) => r['Days in Filter'] === 1), 'the never-blank helper reads 1 on every row');
  const blank = f.rows.filter((r) => r.Sales === null);
  assert.ok(blank.length >= 5, `${blank.length} rows have a blank value`);
  assert.equal(f.rows.filter((r) => r.Sales === 0).length, 1, 'exactly one day has a value of 0');
  const valued = f.rows.filter((r) => typeof r.Sales === 'number') as { Date: string; Sales: number }[];
  const peak = valued.reduce((a, b) => (b.Sales > a.Sales ? b : a));
  assert.ok(peak.Date.startsWith('2025-12-'), `the peak is on ${peak.Date}`);
  assert.equal(valued.filter((r) => r.Sales === peak.Sales).length, 1, 'the peak is a single day');
});

test('the leap-year fixture has a row for every one of the 366 dates of 2024, 29 February with a value', () => {
  const f = loadFixture('leap-2024');
  assert.deepEqual(Object.keys(f.rows[0]), ['Date', 'Sales']);
  assert.deepEqual(f.rows.map((r) => r.Date), allDatesOf(2024, 366));
  assert.equal(typeof f.rows.find((r) => r.Date === '2024-02-29')?.Sales, 'number', '29 Feb 2024 has a value');
  assert.ok(f.rows.some((r) => r.Sales === null), 'some values are blank');
});

const harness = useHarness();

for (const { vega, timeZone, label: cell } of CELLS) for (const name of ['base-2025', 'regions-2025']) {
  test(`${cell} the ${name} fixture loads and renders in the prototype without error`, async () => {
    const cal = await harness.render({ spec: 'prototype', fixture: name, vega, timeZone });
    assert.deepEqual(await cal.errors(), []);
    assert.equal((await cal.days()).length, 365);
    assert.equal((await cal.deliveredRows()).length, loadFixture(name).rows.length);
  });
}
