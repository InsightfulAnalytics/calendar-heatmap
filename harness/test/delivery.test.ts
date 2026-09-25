// Delivering fixture rows the way Deneb does. The date delivery setting (local midnight, UTC
// midnight or text) changes the date field's shape and nothing else, in every time zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, DATE_DELIVERIES } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';
import { useHarness } from './helpers.ts';

const base = loadFixture('base-2025');
const MIDNIGHT = '00:00:00.000';

const harness = useHarness();

for (const { vega, timeZone, label: cell } of CELLS) {
  test(`${cell} switching date delivery between local midnight, UTC midnight and text changes the rows' date shape and nothing else`, async () => {
    const delivered: Record<string, Record<string, unknown>[]> = {};
    for (const dateDelivery of DATE_DELIVERIES) {
      const cal = await harness.render({ spec: 'prototype', fixture: 'base-2025', vega, timeZone, dateDelivery });
      assert.equal(await cal.timeZone(), timeZone);
      delivered[dateDelivery] = await cal.deliveredRows();
    }
    base.rows.forEach((row, i) => {
      assert.deepEqual(pick(delivered.local[i].Date, 'type', 'localDate', 'localTime'), { type: 'Date', localDate: row.Date, localTime: MIDNIGHT });
      assert.deepEqual(pick(delivered.utc[i].Date, 'type', 'utcDate', 'utcTime'), { type: 'Date', utcDate: row.Date, utcTime: MIDNIGHT });
      assert.deepEqual(delivered.text[i].Date, { type: 'string', value: row.Date });
    });
    const withoutDate = (rows: Record<string, unknown>[]) => rows.map(({ Date: _date, ...rest }) => rest);
    assert.deepEqual(withoutDate(delivered.utc), withoutDate(delivered.local));
    assert.deepEqual(withoutDate(delivered.text), withoutDate(delivered.local));
    assert.deepEqual(withoutDate(delivered.local), base.rows.map((r, i) => ({ Sales: r.Sales, __row__: i, __selected__: 'neutral' })));
  });

  test(`${cell} each measure carries its highlight companion value when highlight values are given, and none otherwise`, async () => {
    const values = base.rows.map((_, i) => (i < 3 ? 100 + i : null));
    const lit = await harness.render({ spec: 'prototype', fixture: 'base-2025', vega, timeZone, highlight: { Sales: values } });
    const rows = await lit.deliveredRows();
    assert.deepEqual(rows.slice(0, 4).map((r) => r.Sales__highlight), [100, 101, 102, null]);
    const plain = await harness.render({ spec: 'prototype', fixture: 'base-2025', vega, timeZone });
    assert.ok((await plain.deliveredRows()).every((r) => !('Sales__highlight' in r)));
  });
}

function pick(value: unknown, ...keys: string[]): Record<string, unknown> {
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, obj?.[k]]));
}
