// The prototype gives the same results under Vega 6.2 and 6.4 (Deneb 1.9 and 2.0) and in every
// time zone: the same days in the same places and colours, the same labels and tooltips, and the
// same host calls for the same gestures.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openHarness, VEGA_VERSIONS, TIME_ZONES, type Harness, type VegaVersion } from '../src/index.ts';

let harness: Harness;
const outcomes = new Map<string, unknown>();
const zones = new Map<string, string>();
const key = (vega: string, tz: string) => `${vega}|${tz}`;

/** Everything a viewer or the host sees over one scripted session with the prototype. */
async function outcome(vega: VegaVersion, timeZone: string) {
  const render = () => harness.render({ spec: 'prototype', fixture: 'prototype-sample', vega, timeZone });
  const cal = await render();
  zones.set(key(vega, timeZone), await cal.timeZone());
  const scene = await cal.scene();
  const script: [string, (c: typeof cal) => Promise<void>][] = [
    ['drag 7 Jul to 20 Aug', (c) => c.drag('2025-07-07', '2025-08-20')],
    ['drag across March and April', (c) => c.drag('2025-03-01', '2025-04-10')],
    ['click the Peak day', (c) => c.click('2025-12-17')],
    ['right click', (c) => c.rightClick('2025-03-12')],
    ['middle click', (c) => c.middleClick('2025-03-12')],
    ['background click', (c) => c.backgroundClick()],
  ];
  const gestures: Record<string, unknown> = {};
  for (const [name, act] of script) {
    const c = await render();
    await act(c);
    const days = await c.days();
    gestures[name] = {
      hostCalls: await c.hostCalls(),
      results: (await c.applyCalls()).map((a) => a.result),
      opacity: days.map((d) => [d.date, d.opacity]),
    };
  }
  return { scene, gestures };
}

before(async () => {
  harness = await openHarness();
  for (const vega of VEGA_VERSIONS) for (const tz of TIME_ZONES) outcomes.set(key(vega, tz), await outcome(vega, tz));
});
after(async () => { await harness.close(); });

test('each run is really in its time zone', () => {
  for (const vega of VEGA_VERSIONS) for (const tz of TIME_ZONES) assert.equal(zones.get(key(vega, tz)), tz);
});

for (const tz of TIME_ZONES) {
  test(`[${tz}] the prototype results are the same under Vega 6.2 and Vega 6.4`, () => {
    assert.deepEqual(outcomes.get(key('6.2', tz)), outcomes.get(key('6.4', tz)));
  });
}

for (const vega of VEGA_VERSIONS) {
  test(`[Vega ${vega}] the prototype results are the same in ${TIME_ZONES.join(', ')}`, () => {
    const [first, ...rest] = TIME_ZONES;
    for (const tz of rest) assert.deepEqual(outcomes.get(key(vega, tz)), outcomes.get(key(vega, first)), `${tz} differs from ${first}`);
  });
}
