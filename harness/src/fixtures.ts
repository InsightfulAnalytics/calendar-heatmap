// Fixtures: the rows a Calendar is fed, before delivery.
//
// A fixture holds dates as 'YYYY-MM-DD' text. The date delivery setting (see index.ts) turns that
// text into what the spec receives, inside the browser page, so the time zone is the page's own.
// Row order is the row identity: row i is delivered with __row__ = i.
import { readFileSync } from 'node:fs';
import { projectPath } from './paths.ts';

export type FixtureValue = string | number | null;
export type FixtureRow = Record<string, FixtureValue>;

export interface Fixture {
  name: string;
  /** The field that holds each row's date ('YYYY-MM-DD' text in the fixture). */
  dateField: string;
  /** Measure fields: the only fields that can carry a highlight companion value. */
  measures: string[];
  rows: FixtureRow[];
}

/** The prototype's own sample, used as-is: its "36 rows" criterion is defined on it. */
function prototypeSample(): Fixture {
  const raw = JSON.parse(readFileSync(projectPath('prototype', 'sample-data.json'), 'utf8')) as
    { Date: string; Sales: number | null; __row__: number }[];
  const rows = raw.map((r, i) => {
    if (r.__row__ !== i) throw new Error(`prototype sample row ${i} carries __row__ ${r.__row__}`);
    return { Date: r.Date.slice(0, 10), Sales: r.Sales };
  });
  return { name: 'prototype-sample', dateField: 'Date', measures: ['Sales'], rows };
}

// ------------------------------------------------------------------ the generator
// Deterministic: a seeded PRNG (mulberry32) and UTC date stepping in Node, so every run and every
// machine produces the same rows. Dates are generated as text; time zones only apply on delivery.

/** A seeded pseudo-random source in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every date of a year as 'YYYY-MM-DD' text, stepped by whole UTC days. */
export function datesOfYear(year: number): string[] {
  const out: string[] = [];
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate() + 1))) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
const round2 = (v: number) => Math.round(v * 100) / 100;

/** A daily sales shape for one year: weekdays rising to December, weekends about a third. */
function dailySales(dates: string[], rand: () => number, scale = 1): number[] {
  return dates.map((date, i) => {
    const t = i / (dates.length - 1);
    const weekday = 3000 + 6500 * t ** 1.4;
    const noise = 0.85 + 0.3 * rand();
    return round2((isWeekend(date) ? 0.35 : 1) * weekday * noise * scale);
  });
}

const pick = <T>(items: T[], n: number, rand: () => number): T[] => {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
};

/**
 * The base 2025 fixture: one row per date with Date and Sales. Weekdays run high and rise to a
 * December peak (19 Dec, a Friday, clearly above every other day); weekends run low. Four holidays
 * and a Monday in the selection range have a blank value (a row with a null). Two weekend days in
 * the 7 Jul to 20 Aug range and ten more weekend days have no row at all.
 */
function base2025(): Fixture {
  const rand = seeded(20250101);
  const dates = datesOfYear(2025);
  const sales = dailySales(dates, rand);
  const PEAK = '2025-12-19';
  const blank = new Set(['2025-01-01', '2025-04-18', '2025-07-28', '2025-12-25', '2025-12-26']);
  const fixedNoRow = ['2025-07-19', '2025-08-10'];
  const weekendPool = dates.filter((d) => isWeekend(d) && !blank.has(d) && !fixedNoRow.includes(d));
  const noRow = new Set([...fixedNoRow, ...pick(weekendPool, 10, rand)]);
  const cap = 11000;
  const rows: FixtureRow[] = [];
  dates.forEach((date, i) => {
    if (noRow.has(date)) return;
    const value = date === PEAK ? 12500 : blank.has(date) ? null : Math.min(sales[i], cap);
    rows.push({ Date: date, Sales: value });
  });
  return { name: 'base-2025', dateField: 'Date', measures: ['Sales'], rows };
}

export const REGIONS = ['North', 'South', 'East', 'West', 'Central', 'Metro'];

/**
 * The several-regions fixture: one row per date of 2025 per region (6 x 365 = 2,190 rows), with
 * Date, Region and Sales. Each region has its own scale; three values per region are blank.
 */
function regions2025(): Fixture {
  const rand = seeded(20250606);
  const dates = datesOfYear(2025);
  const scales = [1, 0.8, 0.65, 0.5, 0.35, 0.2];
  const rows: FixtureRow[] = [];
  REGIONS.forEach((region, r) => {
    const sales = dailySales(dates, rand, scales[r]);
    const blank = new Set(pick(dates, 3, rand));
    dates.forEach((date, i) => rows.push({ Date: date, Region: region, Sales: blank.has(date) ? null : sales[i] }));
  });
  return { name: 'regions-2025', dateField: 'Date', measures: ['Sales'], rows };
}

/** Every named fixture. Later tickets add theirs here. */
export const FIXTURES: Record<string, () => Fixture> = {
  'prototype-sample': prototypeSample,
  'base-2025': base2025,
  'regions-2025': regions2025,
};

export type FixtureName = keyof typeof FIXTURES;

export function loadFixture(name: string): Fixture {
  const make = FIXTURES[name];
  if (!make) throw new Error(`unknown fixture '${name}'; known: ${Object.keys(FIXTURES).join(', ')}`);
  return make();
}
