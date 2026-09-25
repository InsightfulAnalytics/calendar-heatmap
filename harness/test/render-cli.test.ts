// The render command: one command renders a named spec over a named fixture, size, theme and
// options, writes the PNG and the scene, prints one pass or fail line per check and exits non-zero
// on any failure. No Power BI is involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { HARNESS_DIR, OUT_DIR } from '../src/paths.ts';

const run = (args: string[]) => {
  const r = spawnSync(process.execPath, ['src/cli/render.ts', ...args], { cwd: HARNESS_DIR, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const COMMON = ['--spec', 'prototype', '--fixture', 'prototype-sample', '--size', '1080x362', '--theme', 'bi-nexus', '--option', 'titleText=Revenue'];

test('the render command writes the PNG and the scene, and prints one pass line per passing check', () => {
  const png = path.join(OUT_DIR, 'prototype__prototype-sample__1080x362__vega6.4__UTC.png');
  const scene = png.replace(/\.png$/, '.scene.json');
  rmSync(png, { force: true });
  rmSync(scene, { force: true });
  const { code, out } = run([
    ...COMMON,
    '--check', 'fill 2025-12-17 #113d77',
    '--check', 'label Revenue',
    '--check', 'tooltip 2025-12-17 Sales=11,620',
    '--check', 'ring 2025-12-17',
    '--check', 'drag 2025-07-07 2025-08-20 selects 36',
    '--check', 'click 2025-12-17 selects 1',
    '--check', 'scan',
  ]);
  assert.equal(code, 0, out);
  const lines = out.split(/\r?\n/).filter((l) => /^(pass|fail) /.test(l));
  assert.equal(lines.length, 7, out);
  assert.ok(lines.every((l) => l.startsWith('pass ')), out);
  assert.ok(existsSync(png), `${png} was not written`);
  const written = JSON.parse(readFileSync(scene, 'utf8'));
  assert.equal(written.days.length, 365);
  assert.ok(written.labels.some((l: { text: string }) => l.text === 'Revenue'));
});

test('the render command prints a fail line and exits non-zero when a check fails', () => {
  const { code, out } = run([...COMMON, '--check', 'fill 2025-12-17 #113d77', '--check', 'fill 2025-12-17 #000000']);
  assert.notEqual(code, 0);
  const lines = out.split(/\r?\n/).filter((l) => /^(pass|fail) /.test(l));
  assert.deepEqual(lines.map((l) => l.slice(0, 4)), ['pass', 'fail'], out);
});

test('the render command fails loudly on an unknown check', () => {
  const { code, out } = run([...COMMON, '--check', 'sparkle 2025-12-17']);
  assert.notEqual(code, 0);
  assert.match(out, /^fail sparkle 2025-12-17/m);
});
