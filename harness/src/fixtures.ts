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

/** Every named fixture. Later tickets add theirs here. */
export const FIXTURES: Record<string, () => Fixture> = {
  'prototype-sample': prototypeSample,
};

export type FixtureName = keyof typeof FIXTURES;

export function loadFixture(name: string): Fixture {
  const make = FIXTURES[name];
  if (!make) throw new Error(`unknown fixture '${name}'; known: ${Object.keys(FIXTURES).join(', ')}`);
  return make();
}
