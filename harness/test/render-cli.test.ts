// The render command: one command renders a named spec over a named fixture, size, theme and
// options, writes the PNG and the scene, prints one pass or fail line per check and exits non-zero
// on any failure. No Power BI is involved. With no --vega and no --tz it runs every check in all
// six cells, each line prefixed with its cell's label as the test names are; the flags narrow it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { HARNESS_DIR, OUT_DIR } from '../src/paths.ts';
import { CELLS, cellLabel, type Cell } from '../src/index.ts';

const run = (args: string[]) => {
  const r = spawnSync(process.execPath, ['src/cli/render.ts', ...args], { cwd: HARNESS_DIR, encoding: 'utf8', timeout: 300000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const resultLines = (out: string) => out.split(/\r?\n/).filter((l) => /^(pass|fail) /.test(l));
const COMMON = ['--spec', 'prototype', '--fixture', 'prototype-sample', '--size', '1080x362', '--theme', 'bi-nexus', '--option', 'titleText=Revenue'];
const pngOf = ({ vega, timeZone }: Cell) =>
  path.join(OUT_DIR, `prototype__prototype-sample__1080x362__vega${vega}__${timeZone.replace(/\//g, '-')}.png`);

test('with no --vega and no --tz the render command runs every check in all six cells, and writes each cell\'s PNG and scene', () => {
  for (const cell of CELLS) {
    rmSync(pngOf(cell), { force: true });
    rmSync(pngOf(cell).replace(/\.png$/, '.scene.json'), { force: true });
  }
  const checks = [
    'fill 2025-12-17 #113d77',
    'label Revenue',
    'tooltip 2025-12-17 Sales=11,620',
    'ring 2025-12-17',
    'drag 2025-07-07 2025-08-20 selects 36',
    'click 2025-12-17 selects 1',
    'scan',
  ];
  const { code, out } = run([...COMMON, ...checks.flatMap((c) => ['--check', c])]);
  assert.equal(code, 0, out);
  const expected = CELLS.flatMap(({ label }) => checks.map((c) => `pass ${label} ${c}`));
  assert.deepEqual(resultLines(out), expected, out);
  for (const cell of CELLS) {
    assert.ok(existsSync(pngOf(cell)), `${pngOf(cell)} was not written`);
    const written = JSON.parse(readFileSync(pngOf(cell).replace(/\.png$/, '.scene.json'), 'utf8'));
    assert.equal(written.days.length, 365, cell.label);
    assert.ok(written.labels.some((l: { text: string }) => l.text === 'Revenue'), cell.label);
  }
});

test('the render command prints a fail line and exits non-zero when a check fails', () => {
  const { code, out } = run([...COMMON, '--vega', '6.4', '--tz', 'UTC', '--check', 'fill 2025-12-17 #113d77', '--check', 'fill 2025-12-17 #000000']);
  assert.notEqual(code, 0);
  assert.deepEqual(resultLines(out).map((l) => l.slice(0, 4)), ['pass', 'fail'], out);
});

test('--vega and --tz together narrow the render command to that one cell', () => {
  const cell: Cell = { vega: '6.2', timeZone: 'Pacific/Auckland' };
  rmSync(pngOf(cell), { force: true });
  const { code, out } = run([...COMMON, '--vega', '6.2', '--tz', 'Pacific/Auckland', '--check', 'click 2025-12-17 selects 1']);
  assert.equal(code, 0, out);
  assert.deepEqual(resultLines(out), [`pass ${cellLabel(cell)} click 2025-12-17 selects 1`], out);
  assert.ok(existsSync(pngOf(cell)), `${pngOf(cell)} was not written`);
});

test('--vega alone narrows the render command to that Vega version in all three time zones, and --tz alone to both Vega versions in that zone', () => {
  const byVega = run([...COMMON, '--vega', '6.2', '--check', 'fill 2025-12-17 #113d77']);
  assert.equal(byVega.code, 0, byVega.out);
  assert.deepEqual(resultLines(byVega.out), CELLS.filter((c) => c.vega === '6.2').map(({ label }) => `pass ${label} fill 2025-12-17 #113d77`), byVega.out);
  const byZone = run([...COMMON, '--tz', 'America/Los_Angeles', '--check', 'fill 2025-12-17 #113d77']);
  assert.equal(byZone.code, 0, byZone.out);
  assert.deepEqual(resultLines(byZone.out), CELLS.filter((c) => c.timeZone === 'America/Los_Angeles').map(({ label }) => `pass ${label} fill 2025-12-17 #113d77`), byZone.out);
});

test('the render command fails loudly on an unknown check', () => {
  const { code, out } = run([...COMMON, '--vega', '6.4', '--tz', 'UTC', '--check', 'sparkle 2025-12-17']);
  assert.notEqual(code, 0);
  assert.match(out, /^fail \[Vega 6\.4, UTC\] sparkle 2025-12-17/m);
});
