// Gesture replay on the prototype: the buttons, modifiers and inputs a viewer can use.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openHarness, type Harness } from '../src/index.ts';

let harness: Harness;
before(async () => { harness = await openHarness(); });
after(async () => { await harness.close(); });

const render = () => harness.render({ spec: 'prototype', fixture: 'prototype-sample' });
const PEAK = { type: 'select', rows: [281], dates: ['2025-12-17'] };

test('a middle click on a day records no host call', async () => {
  const cal = await render();
  await cal.middleClick('2025-03-12');
  assert.deepEqual(await cal.hostCalls(), []);
});

test('a drag released outside the view sends nothing, and the next click selects just that day', async () => {
  const cal = await render();
  await cal.dragReleasedOutside('2025-07-07', '2025-08-20');
  assert.deepEqual(await cal.hostCalls(), []);
  await cal.click('2025-12-17');
  assert.deepEqual(await cal.hostCalls(), [{ ...PEAK, multiSelect: false }]);
});

test('a touch tap on the Peak day selects its 1 row', async () => {
  const cal = await render();
  await cal.tap('2025-12-17');
  assert.deepEqual(await cal.hostCalls(), [{ ...PEAK, multiSelect: false }]);
});

for (const [key, mods] of [['shift', { shift: true }], ['ctrl', { ctrl: true }]] as const) {
  test(`a ${key}-click comes back from Deneb with the multi-select flag set`, async () => {
    const cal = await render();
    await cal.click('2025-12-17', mods);
    const [apply] = await cal.applyCalls();
    assert.deepEqual(apply.result, { rowNumbers: [281], multiSelect: true });
    assert.deepEqual(await cal.hostCalls(), [{ ...PEAK, multiSelect: true }]);
  });
}

test('a shift-drag comes back from Deneb with the multi-select flag set', async () => {
  const cal = await render();
  await cal.drag('2025-07-07', '2025-07-11', { shift: true });
  const [apply] = await cal.applyCalls();
  assert.equal(apply.result.multiSelect, true);
  assert.equal(apply.result.rowNumbers?.length, 5);
});
