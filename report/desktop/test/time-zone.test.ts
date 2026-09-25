// Windows' time zone is never changed (Tim, 2026-09-26, issue #2): the probe reads the date delivery
// in the machine's own zone only, and other zones are proved in the harness. This guards every
// script that drives Desktop, so no later edit brings a zone switch back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPORT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(REPORT, 'desktop', 'src');

/** Each way a script on Windows could set the system time zone. */
const SETS_THE_ZONE: [string, RegExp][] = [
  ['tzutil /s', /tzutil\b[^\n]*['"\s]\/s\b/i],
  ['Set-TimeZone', /Set-TimeZone\b/i],
  ['SetTimeZoneInformation', /SetTimeZoneInformation\b/],
  ['SetDynamicTimeZoneInformation', /SetDynamicTimeZoneInformation\b/],
];

function scripts(): string[] {
  const inSrc = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|ps1)$/.test(f))
    .map((f) => path.join(SRC, f));
  return [...inSrc, path.join(REPORT, 'seam.ps1')];
}

test('no Desktop driver, probe or seam script sets the Windows time zone', () => {
  const files = scripts();
  assert.ok(files.some((f) => f.endsWith(path.join('cli', 'probe.ts'))), 'the probe is among the files scanned');
  const found: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const [name, re] of SETS_THE_ZONE) {
        if (re.test(line)) found.push(`${path.relative(REPORT, file)}:${i + 1} ${name}`);
      }
    });
  }
  assert.deepEqual(found, []);
});
