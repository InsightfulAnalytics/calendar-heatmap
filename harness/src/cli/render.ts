// npm run render -- --spec prototype --fixture prototype-sample [--size 1080x362] [--theme bi-nexus]
//   [--option name=value ...] [--vega 6.4] [--tz UTC] [--date-delivery local|utc|text]
//   [--check "<check>" ...]
//
// Renders the spec in headless Edge, writes harness/out/<spec>__<fixture>__<w>x<h>__vega<v>__<tz>
// .png and .scene.json, then prints one "pass" or "fail" line per check and exits 1 when any fails.
// The check forms are listed in src/checks.ts.
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openHarness, VEGA_VERSIONS, type DateDelivery, type RenderInput, type VegaVersion } from '../index.ts';
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
    vega: { type: 'string', default: '6.4' },
    tz: { type: 'string', default: 'UTC' },
    'date-delivery': { type: 'string', default: 'local' },
    check: { type: 'string', multiple: true, default: [] },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

if (!values.spec || !values.fixture) fail('usage: npm run render -- --spec <name|path.json> --fixture <name> [--size WxH] [--theme name] [--option k=v] [--vega 6.2|6.4] [--tz zone] [--date-delivery local|utc|text] [--check "..."]');
const size = /^(\d+)x(\d+)$/.exec(values.size ?? '');
if (!size) fail(`--size must look like 1080x362, not '${values.size}'`);
if (!VEGA_VERSIONS.includes(values.vega as VegaVersion)) fail(`--vega must be one of ${VEGA_VERSIONS.join(', ')}`);
if (!['local', 'utc', 'text'].includes(values['date-delivery'] ?? '')) fail('--date-delivery must be local, utc or text');

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

const input: RenderInput = {
  spec: values.spec!,
  fixture: values.fixture!,
  size: { width: Number(size![1]), height: Number(size![2]) },
  theme: values.theme,
  options,
  vega: values.vega as VegaVersion,
  timeZone: values.tz,
  dateDelivery: values['date-delivery'] as DateDelivery,
};

const harness = await openHarness();
let failed = 0;
try {
  const calendar = await harness.render(input);
  const specName = path.basename(String(values.spec)).replace(/\.json$/, '');
  const base = path.join(OUT_DIR, `${specName}__${values.fixture}__${values.size}__vega${values.vega}__${String(values.tz).replace(/[\\/]/g, '-')}`);
  mkdirSync(OUT_DIR, { recursive: true });
  await calendar.screenshot(`${base}.png`);
  writeFileSync(`${base}.scene.json`, JSON.stringify(await calendar.scene(), null, 1));
  console.log(`wrote ${base}.png`);
  console.log(`wrote ${base}.scene.json`);
  for (const outcome of await runChecks(values.check ?? [], { calendar, harness, input })) {
    if (!outcome.pass) failed += 1;
    console.log(`${outcome.pass ? 'pass' : 'fail'} ${outcome.check}${outcome.pass ? '' : `\n     ${outcome.detail}`}`);
  }
} catch (e) {
  failed += 1;
  console.log(`fail render\n     ${(e as Error).message}`);
} finally {
  await harness.close();
}
process.exit(failed ? 1 : 0);
