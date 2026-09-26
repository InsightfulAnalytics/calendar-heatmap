// The Template's fields: exactly two placeholders, read by bracket access, so a field whose name
// has spaces works once an author maps it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, TEMPLATE_FILE, readTemplate } from '../src/index.ts';
import { loadFixture, type Fixture } from '../src/fixtures.ts';
import { rowsDated, sorted, useHarness } from './helpers.ts';

test('the Template declares exactly two placeholders: the date as a dateTime column and the value as a numeric measure', () => {
  const { fields } = readTemplate(TEMPLATE_FILE);
  assert.deepEqual(fields.map(({ key, type, kind }) => ({ key, type, kind })), [
    { key: '__0__', type: 'dateTime', kind: 'column' },
    { key: '__1__', type: 'numeric', kind: 'measure' },
  ]);
});

const harness = useHarness();
const base = loadFixture('base-2025');
/** The base 2025 fixture under field names with spaces. */
const spaced: Fixture = {
  name: 'base-2025 as Order Date and Total Sales',
  dateField: 'Order Date',
  rows: base.rows.map((r) => ({ 'Order Date': r.Date, 'Total Sales': r.Sales })),
};
const SPACED = { template: TEMPLATE_FILE, fields: { __0__: 'Order Date', __1__: 'Total Sales' } };

for (const { vega, timeZone, label: cell } of CELLS) {
  test(`${cell} a date mapped to 'Order Date' and a value mapped to 'Total Sales' draw the same days as Date and Sales, and a drag selects their rows`, async () => {
    const plain = await harness.render({ spec: 'template', fixture: base, vega, timeZone });
    const expected = (await plain.days()).map(({ date, fill, row }) => ({ date, fill, row }));
    const cal = await harness.render({ spec: SPACED, fixture: spaced, vega, timeZone });
    assert.deepEqual(await cal.errors(), []);
    assert.deepEqual((await cal.days()).map(({ date, fill, row }) => ({ date, fill, row })), expected);
    const peak = await cal.day('2025-12-19');
    assert.equal((peak?.tooltip as Record<string, unknown>)['Total Sales'], '12,500', "the tooltip names the value by its field's name");
    await cal.drag('2025-07-07', '2025-08-20');
    const [call] = await cal.hostCalls();
    assert.deepEqual(call?.type === 'select' && sorted(call.rows), rowsDated(spaced, '2025-07-07', '2025-08-20'));
  });
}
