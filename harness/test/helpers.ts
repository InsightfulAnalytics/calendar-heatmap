// Shared by the test files: one headless Edge per file, and expected rows worked out from a
// fixture's own date text, never from a spec's date maths.
import { after } from 'node:test';
import { openHarness, type Harness, type RenderInput } from '../src/index.ts';
import type { Fixture } from '../src/fixtures.ts';

/**
 * One harness for the calling test file, opened by its first render and closed after its last
 * check. Call it at the top level of the file. It opens lazily rather than in a before hook
 * because node:test starts a file's top-level before hooks together without waiting for each
 * other, so a second hook that renders would find the browser not yet open.
 */
export function useHarness(): Pick<Harness, 'render'> {
  let opening: Promise<Harness> | undefined;
  after(async () => { if (opening) await (await opening).close(); });
  return { render: async (input: RenderInput) => (await (opening ??= openHarness())).render(input) };
}

/** The row identities of a fixture's rows dated from one day to another, both included. */
export const rowsDated = (fixture: Fixture, from: string, to: string): number[] =>
  fixture.rows.flatMap((r, i) => {
    const date = String(r[fixture.dateField]);
    return date >= from && date <= to ? [i] : [];
  });

/** Row identities in ascending order, for comparing a host call's rows with rowsDated. */
export const sorted = (rows: number[]): number[] => [...rows].sort((a, b) => a - b);

/** Every date from one day to another, both included, as 'YYYY-MM-DD', stepped by whole UTC days. */
export function datesFromTo(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
