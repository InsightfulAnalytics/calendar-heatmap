// npm run template -- --out <spec.json> [--config-out <config.json>] [--field __0__=Date ...]
//   [--option name=value ...]
//
// Writes the Template as Deneb's import leaves it, ready for the deneb-pbir skill's embed: usermeta
// removed, each placeholder replaced by its mapped field's name (by default the names the Template
// declares), the given settings set in place, and its config moved to its own file (Deneb keeps the
// spec and the config apart). The root $schema stays for editors; embed strips it. This is how the
// Report's Calendar is embedded:
//
//   npm run template -- --out out/report-calendar.json --config-out out/report-calendar.config.json `
//     --option windowMode=fiscal --option fiscalStartMonth=7 --option everyDateHasRow=true
//   python <deneb-pbir>/scripts/deneb_spec.py embed "<calendar visual.json>" `
//     --spec out/report-calendar.json --config out/report-calendar.config.json
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TEMPLATE_FILE, applyOptions, mapTemplate, readTemplate, type Json, type JsonObject } from '../spec.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    'config-out': { type: 'string' },
    field: { type: 'string', multiple: true, default: [] },
    option: { type: 'string', multiple: true, default: [] },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const pairs = (list: string[], what: string) => list.map((pair) => {
  const at = pair.indexOf('=');
  if (at < 1) fail(`--${what} must be name=value, not '${pair}'`);
  return [pair.slice(0, at), pair.slice(at + 1)] as const;
});
const parseValue = (text: string): Json => {
  try { return JSON.parse(text) as Json; } catch { return text; }
};

if (!values.out) fail('usage: npm run template -- --out <spec.json> [--config-out <config.json>] [--field __0__=Name ...] [--option name=value ...]');
const fields = Object.fromEntries(readTemplate(TEMPLATE_FILE).fields.map((f) => [f.key, f.name]));
for (const [key, name] of pairs(values.field ?? [], 'field')) fields[key] = name;
const options = Object.fromEntries(pairs(values.option ?? [], 'option').map(([k, v]) => [k, parseValue(v)]));

const spec = applyOptions(mapTemplate(TEMPLATE_FILE, fields), options);
const { config, ...body } = spec as JsonObject & { config?: JsonObject };
const write = (file: string, json: Json) => {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`wrote ${path.resolve(file)}`);
};
if (values['config-out']) {
  write(values.out!, body);
  write(values['config-out'], config ?? {});
} else {
  write(values.out!, spec);
}
