// npm run render -- --spec prototype --fixture prototype-sample [--size 1080x362] [--theme bi-nexus]
//   [--option name=value ...] [--vega 6.2|6.4] [--tz <zone>] [--date-delivery local|utc|text]
//   [--check "<check>" ...]
//
// Renders the spec in headless Edge in every cell asked for. With no --vega and no --tz that is all
// six cells of the suite (Vega 6.2 and 6.4, each in UTC, Pacific/Auckland and America/Los_Angeles);
// --vega keeps one Vega version, and --tz replaces the three zones with the one given. For each cell
// it writes harness/out/<spec>__<fixture>__<w>x<h>__vega<v>__<zone>.png and .scene.json, then prints
// one "pass" or "fail" line per check, prefixed with the cell's label as the test names are
// ("pass [Vega 6.2, UTC] fill ..."). It exits 1 when any check fails in any cell.
// The check forms are listed in src/checks.ts.
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  openHarness, cellLabel, DATE_DELIVERIES, TIME_ZONES, VEGA_VERSIONS,
  type Cell, type DateDelivery, type RenderInput, type VegaVersion,
} from '../index.ts';
import { runChecks } from '../checks.ts';
import { OUT_DIR } from '../paths.ts';
import type { Json } from '../spec.ts';

const { values } = parseArgs({
  options: {
    spec: { type: 'string' },
    fixture: { type: 'string' },
    size: { type: 'string', default: '1080x362' },
    theme: { type: 'string', default: 'bi-nexus' },
    option: { type: 'string', multiple: true, default: [] },
    vega: { type: 'string' },
    tz: { type: 'string' },
    'date-delivery': { type: 'string', default: 'local' },
    check: { type: 'string', multiple: true, default: [] },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

if (!values.spec || !values.fixture) fail(`usage: npm run render -- --spec <name|path.json> --fixture <name> [--size WxH] [--theme name] [--option k=v] [--vega 6.2|6.4] [--tz zone] [--date-delivery ${DATE_DELIVERIES.join('|')}] [--check "..."]`);
const size = /^(\d+)x(\d+)$/.exec(values.size ?? '');
if (!size) fail(`--size must look like 1080x362, not '${values.size}'`);
if (values.vega !== undefined && !VEGA_VERSIONS.includes(values.vega as VegaVersion)) fail(`--vega must be one of ${VEGA_VERSIONS.join(', ')}`);
if (!DATE_DELIVERIES.includes(values['date-delivery'] as DateDelivery)) fail(`--date-delivery must be one of ${DATE_DELIVERIES.join(', ')}`);

const parseValue = (text: string): Json => {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return text;
  }
};
const options: Record<string, Json> = {};
for (const pair of values.option ?? []) {
  const at = pair.indexOf('=');
  if (at < 1) fail(`--option must be name=value, not '${pair}'`);
  options[pair.slice(0, at)] = parseValue(pair.slice(at + 1));
}

// The cells asked for: each flag given narrows its own axis of the suite's matrix.
const cells: Cell[] = (values.vega ? [values.vega as VegaVersion] : VEGA_VERSIONS).flatMap((vega) =>
  (values.tz ? [values.tz] : TIME_ZONES).map((timeZone) => ({ vega, timeZone })));

const common: RenderInput = {
  spec: values.spec!,
  fixture: values.fixture!,
  size: { width: Number(size![1]), height: Number(size![2]) },
  theme: values.theme,
  options,
  dateDelivery: values['date-delivery'] as DateDelivery,
};
const specName = path.basename(String(values.spec)).replace(/\.json$/, '');

const harness = await openHarness();
let failed = 0;
try {
  for (const cell of cells) {
    const label = cellLabel(cell);
    const input: RenderInput = { ...common, ...cell };
    try {
      const calendar = await harness.render(input);
      const base = path.join(OUT_DIR, `${specName}__${values.fixture}__${values.size}__vega${cell.vega}__${cell.timeZone.replace(/[\\/]/g, '-')}`);
      mkdirSync(OUT_DIR, { recursive: true });
      await calendar.screenshot(`${base}.png`);
      writeFileSync(`${base}.scene.json`, JSON.stringify(await calendar.scene(), null, 1));
      console.log(`wrote ${base}.png`);
      console.log(`wrote ${base}.scene.json`);
      for (const outcome of await runChecks(values.check ?? [], { calendar, harness, input })) {
        if (!outcome.pass) failed += 1;
        console.log(`${outcome.pass ? 'pass' : 'fail'} ${label} ${outcome.check}${outcome.pass ? '' : `\n     ${outcome.detail}`}`);
      }
    } catch (e) {
      failed += 1;
      console.log(`fail ${label} render\n     ${(e as Error).message}`);
    }
  }
} finally {
  await harness.close();
}
process.exit(failed ? 1 : 0);
