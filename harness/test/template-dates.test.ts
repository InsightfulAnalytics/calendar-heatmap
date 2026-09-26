// The Template's date parse: a date that arrives as a Date at local midnight, a Date at UTC midnight,
// ISO text or the UTC-midnight epoch number resolves to the same calendar day, so the Report, the
// library checker and a showcase all draw the same day. Every shape must draw the same scene, in
// every time zone.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, DATE_DELIVERIES, TIME_ZONES, VEGA_VERSIONS, cellLabel, type Scene } from '../src/index.ts';
import { useHarness } from './helpers.ts';

const harness = useHarness();
/** The scene per cell and date shape, the 2025 fixture drawn at the Template's defaults. */
const scenes = new Map<string, Scene>();
const key = (label: string, shape: string) => `${label} ${shape}`;

before(async () => {
  for (const { vega, timeZone, label } of CELLS) {
    for (const dateDelivery of DATE_DELIVERIES) {
      const cal = await harness.render({ spec: 'template', fixture: 'base-2025', vega, timeZone, dateDelivery });
      assert.equal(await cal.timeZone(), timeZone);
      scenes.set(key(label, dateDelivery), await cal.scene());
    }
  }
});

for (const { label } of CELLS) {
  test(`${label} the 2025 fixture draws the same scene whether its dates arrive as local-midnight Dates, UTC-midnight Dates, ISO text or epoch numbers`, () => {
    const local = scenes.get(key(label, 'local'));
    assert.equal(local?.days.length, 365);
    assert.equal(local?.days.filter((d) => typeof d.row === 'number').length, 353, 'each of the 353 rows lands on a drawn day');
    for (const shape of DATE_DELIVERIES) assert.deepEqual(scenes.get(key(label, shape)), local, `${shape} differs from local`);
  });
}

for (const vega of VEGA_VERSIONS) {
  test(`[Vega ${vega}] the 2025 fixture draws the same scene in ${TIME_ZONES.join(', ')}, whatever the date shape`, () => {
    const [first, ...rest] = TIME_ZONES;
    for (const shape of DATE_DELIVERIES) {
      const at = (timeZone: string) => scenes.get(key(cellLabel({ vega, timeZone }), shape));
      for (const tz of rest) assert.deepEqual(at(tz), at(first), `${shape}: ${tz} differs from ${first}`);
    }
  });
}
