// The prototype spec at the template seam: selection gestures, scene and host calls.
// Expected rows come from the fixture's own date text (independent of the spec's date maths).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openHarness, type Harness } from '../src/index.ts';
import { loadFixture } from '../src/fixtures.ts';

const sample = loadFixture('prototype-sample');
const rowsDated = (from: string, to: string) =>
  sample.rows.flatMap((r, i) => (String(r.Date) >= from && String(r.Date) <= to ? [i] : []));

let harness: Harness;
before(async () => { harness = await openHarness(); });
after(async () => { await harness.close(); });

const render = () => harness.render({ spec: 'prototype', fixture: 'prototype-sample', vega: '6.4', timeZone: 'UTC' });

test('a drag from 7 Jul to 20 Aug 2025 selects exactly the 36 sample rows dated in that range', async () => {
  const cal = await render();
  await cal.drag('2025-07-07', '2025-08-20');
  const selects = (await cal.hostCalls()).filter((c) => c.type === 'select');
  assert.equal(selects.length, 1);
  const expected = rowsDated('2025-07-07', '2025-08-20');
  assert.equal(expected.length, 36);
  assert.deepEqual([...selects[0].rows].sort((a, b) => a - b), expected);
});
