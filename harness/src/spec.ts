// Loading a spec the way Deneb would run it: config merged, option overrides applied to top-level
// signals, and the container size signals supplied the way the chosen Deneb version supplies them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { projectPath, harnessPath } from './paths.ts';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export type DenebVersion = '1.9' | '2.0';

/** A spec on disk, with an optional config (Deneb's separate config JSON) to merge into it. */
export interface SpecSource {
  path: string;
  config?: string;
}

/** Named specs. The template adds its entry here when it exists. */
export const SPECS: Record<string, SpecSource> = {
  prototype: { path: projectPath('prototype', 'calendar-heatmap.json'), config: projectPath('prototype', 'config.json') },
};

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as JsonObject;

/** Resolve a spec name, a path (relative to the harness folder) or a source object. */
export function resolveSpecSource(spec: string | SpecSource): SpecSource {
  if (typeof spec !== 'string') return spec;
  if (SPECS[spec]) return SPECS[spec];
  if (spec.endsWith('.json')) return { path: path.isAbsolute(spec) ? spec : harnessPath(spec) };
  throw new Error(`unknown spec '${spec}'; known: ${Object.keys(SPECS).join(', ')}, or a .json path`);
}

/**
 * Read a spec and merge its config the way prototype/prep.py does: the config becomes the spec's
 * config, with a white background so a screenshot reads like the Power BI visual container.
 */
export function loadSpec(source: SpecSource): JsonObject {
  const spec = readJson(source.path);
  if (source.config) spec.config = { ...readJson(source.config), background: '#ffffff' };
  return spec;
}

/**
 * Override top-level signal values (the template's named options). Like prep.py, an overridden
 * signal loses its update and on handlers, so the given value stands. An unknown name fails.
 */
export function applyOptions(spec: JsonObject, options: Record<string, Json> = {}): JsonObject {
  const signals = (spec.signals ?? []) as JsonObject[];
  for (const [name, value] of Object.entries(options)) {
    const signal = signals.find((s) => s.name === name);
    if (!signal) throw new Error(`option '${name}' is not a top-level signal of the spec`);
    delete signal.update;
    delete signal.on;
    signal.value = value;
  }
  return spec;
}

// Deneb's container names. Same word-boundary patterns and replacement order as Deneb 2.0's
// textual migration (packages/vega-runtime/src/lib/signals/migration.ts, as mirrored by the
// deneb-pbir renderer).
const LEGACY_TO_MODERN: [string, string][] = [
  ['pbiContainerWidth', 'denebContainer.width'],
  ['pbiContainerHeight', 'denebContainer.height'],
  ['pbiContainer', 'denebContainer'],
];
const MODERN = 'denebContainer';
export const CONTAINER_NAMES = ['pbiContainerWidth', 'pbiContainerHeight', 'pbiContainer', MODERN];
export const wordPattern = (name: string) => new RegExp(`\\b${name}\\b`, 'g');

/**
 * Supply the container size as the given Deneb version does. Deneb 1.9 defines pbiContainerWidth,
 * pbiContainerHeight and pbiContainer. Deneb 2.0 rewrites those names in the spec text to
 * denebContainer (a textual rewrite, so a name inside a label changes too) and defines
 * denebContainer. Only names the spec uses and does not define itself are added.
 */
export function prepareForDeneb(spec: JsonObject, deneb: DenebVersion, width: number, height: number): JsonObject {
  let text = JSON.stringify(spec);
  if (deneb === '2.0') {
    text = LEGACY_TO_MODERN.reduce((t, [from, to]) => t.replace(wordPattern(from), to), text);
  }
  const out = JSON.parse(text) as JsonObject;
  const container: JsonObject = { width, height, scrollWidth: width, scrollHeight: height, scrollTop: 0, scrollLeft: 0 };
  const candidates: [string, Json][] = deneb === '2.0'
    ? [[MODERN, container]]
    : [['pbiContainer', container], ['pbiContainerWidth', width], ['pbiContainerHeight', height]];
  const signals = (out.signals ?? []) as JsonObject[];
  const defined = new Set(signals.map((s) => s.name));
  const added = candidates
    .filter(([name]) => wordPattern(name).test(text) && !defined.has(name))
    .map(([name, value]) => ({ name, value }));
  out.signals = [...added, ...signals];
  return out;
}
