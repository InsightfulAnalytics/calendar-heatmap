// Loading a spec the way Deneb would run it: config merged, option overrides applied to top-level
// signals, and the container size signals supplied the way the chosen Deneb version supplies them.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectPath, harnessPath } from './paths.ts';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export type DenebVersion = '1.9' | '2.0';

/**
 * Where a spec comes from: a spec JSON file with an optional config JSON file (Deneb's separate
 * config) to merge into it; a Deneb visual's visual.json in a PBIR report, whose embedded spec and
 * config are read the way Deneb stores them (see readDenebVisual); or a Deneb template, whose
 * placeholders are mapped to field names the way Deneb's import maps them (see readTemplate).
 */
export type SpecSource =
  | { path: string; config?: string }
  | { visual: string }
  | { template: string; fields: Record<string, string> };

/** The Template: template/calendar-heatmap/, in the library's shape. */
export const TEMPLATE_FILE = projectPath('template', 'calendar-heatmap', 'calendar-heatmap.json');

/** Named specs. */
export const SPECS: Record<string, SpecSource> = {
  // T06 restructure step: the prototype checks run on the Template, its placeholders mapped to the
  // prototype's field names, to prove the restructure changed nothing.
  prototype: { template: TEMPLATE_FILE, fields: { __0__: 'Date', __1__: 'Sales' } },
  // The Report's sales Calendar on Daily overview, as T01 embedded it. Read only, never written.
  'report-calendar': { visual: projectPath('report', 'Daily Sales.Report', 'definition', 'pages', 'dailyOverview', 'visuals', 'calendar', 'visual.json') },
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
 * Blank out line and block comments outside strings, keeping every other character. Deneb's editors
 * accept JSONC and strip comments this way before JSON.parse (packages/utils/src/lib/jsonc.ts), so
 * a saved spec may carry them. Mirrors strip_jsonc_comments in the deneb-pbir skill.
 */
function stripJsoncComments(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\' && i + 1 < text.length) out += text[++i];
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? text.length : end;
      out += ' '.repeat(stop - i);
      i = stop - 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\r\n]/g, ' ');
      i = stop - 1;
    } else {
      out += ch;
    }
  }
  return out;
}

const parseJsonc = (text: string, what: string): JsonObject => {
  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    try {
      return JSON.parse(stripJsoncComments(text)) as JsonObject;
    } catch (e) {
      throw new Error(`${what} is not valid JSON or JSONC: ${(e as Error).message}`);
    }
  }
};

/** Deneb's name for a field: its display name with \ " . [ ] each replaced by _ (deneb-pbir skill). */
const denebFieldName = (displayName: string) => displayName.replace(/[\\".[\]]/g, '_');

export interface DenebVisual {
  spec: JsonObject;
  /** The visual's jsonConfig, when it has one. */
  config?: JsonObject;
  /** The field names the spec receives, in projection order. */
  fields: string[];
}

/**
 * Read a Deneb visual.json the way Deneb stores its spec (deneb-pbir skill): the spec and config
 * are PBIR text literals at visual.objects.vega[0].properties.jsonSpec and .jsonConfig, wrapped in
 * single quotes with each embedded single quote doubled, and may carry JSONC comments. Fails
 * loudly, naming the file, when the file is missing or is not a Vega Deneb visual.
 */
export function readDenebVisual(file: string): DenebVisual {
  if (!existsSync(file)) throw new Error(`the Deneb visual ${file} does not exist`);
  type Literal = { expr?: { Literal?: { Value?: unknown } } };
  type Projection = { displayName?: string; nativeQueryRef?: string; queryRef?: string };
  const doc = JSON.parse(readFileSync(file, 'utf8')) as {
    visual?: {
      objects?: { vega?: { properties?: Record<string, Literal> }[] };
      query?: { queryState?: Record<string, { projections?: Projection[] }> };
    };
  };
  const props = doc.visual?.objects?.vega?.[0]?.properties;
  if (!props) throw new Error(`${file} is not a Deneb visual: it has no visual.objects.vega[0].properties`);
  const literal = (name: string): string | undefined => {
    const raw = props[name]?.expr?.Literal?.Value;
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string' || raw.length < 2 || !raw.startsWith("'") || !raw.endsWith("'")) {
      throw new Error(`${file}: ${name} is not a single-quoted PBIR text literal`);
    }
    return raw.slice(1, -1).replaceAll("''", "'");
  };
  const provider = literal('provider');
  if (provider !== 'vega') throw new Error(`${file}: the harness runs Vega specs, and this visual's provider is ${provider ?? 'not set'}`);
  const specText = literal('jsonSpec');
  if (specText === undefined) throw new Error(`${file} has no jsonSpec`);
  const configText = literal('jsonConfig');
  const projections = Object.values(doc.visual?.query?.queryState ?? {}).flatMap((role) => role.projections ?? []);
  return {
    spec: parseJsonc(specText, `${file} jsonSpec`),
    config: configText === undefined ? undefined : parseJsonc(configText, `${file} jsonConfig`),
    fields: projections.map((p) => denebFieldName(p.displayName ?? p.nativeQueryRef ?? p.queryRef ?? '')),
  };
}

/** One placeholder a Deneb template declares (usermeta.dataset, template metadata version 1). */
export interface TemplateField {
  key: string;
  name: string;
  type: string;
  kind: string;
  description?: string;
}

export interface DenebTemplate {
  /** The spec body with usermeta removed and every placeholder still in place. */
  body: JsonObject;
  usermeta: JsonObject;
  fields: TemplateField[];
}

const PLACEHOLDER = /__\d+__/g;

/** Read a Deneb template (version 1 metadata) without mapping its placeholders. */
export function readTemplate(file: string): DenebTemplate {
  if (!existsSync(file)) throw new Error(`the template ${file} does not exist`);
  const { usermeta, ...body } = readJson(file);
  if (!usermeta || typeof usermeta !== 'object' || Array.isArray(usermeta)) throw new Error(`${file} has no usermeta block`);
  const fields = ((usermeta as JsonObject).dataset ?? []) as unknown as TemplateField[];
  return { body, usermeta: usermeta as JsonObject, fields };
}

/**
 * The template's spec as Deneb's import leaves it: usermeta removed, and each placeholder key
 * replaced in the spec text by the mapped field's name, encoded as Deneb encodes a field name. A
 * declared placeholder with no mapping, or a mapping for an undeclared one, fails.
 */
export function mapTemplate(file: string, fields: Record<string, string>): JsonObject {
  const template = readTemplate(file);
  const declared = template.fields.map((f) => f.key);
  const missing = declared.filter((k) => !(k in fields));
  if (missing.length) throw new Error(`${file}: no field mapped to ${missing.join(', ')}`);
  const extra = Object.keys(fields).filter((k) => !declared.includes(k));
  if (extra.length) throw new Error(`${file}: ${extra.join(', ')} is not a placeholder the template declares`);
  const text = JSON.stringify(template.body).replace(PLACEHOLDER, (key) => {
    const name = fields[key];
    return name === undefined ? key : JSON.stringify(denebFieldName(name)).slice(1, -1);
  });
  return JSON.parse(text) as JsonObject;
}

/**
 * Read a spec and merge its config the way prototype/prep.py does: the config becomes the spec's
 * config, with a white background so a screenshot reads like the Power BI visual container. A
 * Deneb visual's jsonConfig and a template's own config are merged the same way.
 */
export function loadSpec(source: SpecSource): JsonObject {
  if ('template' in source) {
    const spec = mapTemplate(source.template, source.fields);
    if (spec.config) spec.config = { ...(spec.config as JsonObject), background: '#ffffff' };
    return spec;
  }
  if ('visual' in source) {
    const { spec, config } = readDenebVisual(source.visual);
    if (config) spec.config = { ...config, background: '#ffffff' };
    return spec;
  }
  const spec = readJson(source.path);
  if (source.config) spec.config = { ...readJson(source.config), background: '#ffffff' };
  return spec;
}

// ------------------------------------------------------------------ apply limits, as written
// The limit option of a pbiCrossFilterApply call, in an expression string: 'limit: 400'.
const APPLY_LIMIT = /(\blimit\s*:\s*)([^,}\s]+)/g;
const mapApplyCallText = (node: Json, fn: (text: string) => string): Json => {
  if (typeof node === 'string') return node.includes('pbiCrossFilterApply') ? fn(node) : node;
  if (Array.isArray(node)) return node.map((child) => mapApplyCallText(child, fn));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, mapApplyCallText(v, fn)]));
  return node;
};

/** The limit each pbiCrossFilterApply call in the spec passes, as written ('2500', 'selectionLimit'). */
export function applyLimits(spec: JsonObject): string[] {
  const found: string[] = [];
  mapApplyCallText(spec, (text) => {
    for (const match of text.matchAll(APPLY_LIMIT)) found.push(match[2]);
    return text;
  });
  return found;
}

/** The spec with the limit of every pbiCrossFilterApply call written as the given text. */
export function withApplyLimit(spec: JsonObject, limit: string): JsonObject {
  return mapApplyCallText(spec, (text) => text.replace(APPLY_LIMIT, (_match, before: string) => `${before}${limit}`)) as JsonObject;
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

export interface ScanFinding {
  /** Where the name appears, as a JSON path ('marks[1].encode.update.text.signal'). */
  path: string;
  name: string;
}
export interface ScanResult {
  ok: boolean;
  findings: ScanFinding[];
}

/**
 * The container-name scan. The container size names (pbiContainerWidth, pbiContainerHeight,
 * pbiContainer, denebContainer) may appear only in the top-level width and height. Anywhere else
 * a name is a finding: Deneb 2.0 rewrites them textually, labels included, and the library
 * checker rejects the 2.0 names. Keys and string values are both scanned.
 */
export function scanContainerNames(spec: JsonObject): ScanResult {
  const allowed = new Set(['width', 'width.signal', 'height', 'height.signal']);
  const findings: ScanFinding[] = [];
  const check = (text: string, at: string) => {
    if (allowed.has(at)) return;
    for (const name of CONTAINER_NAMES) {
      const hits = text.match(wordPattern(name)) ?? [];
      for (let i = 0; i < hits.length; i++) findings.push({ path: at, name });
    }
  };
  const walk = (node: Json, at: string) => {
    if (typeof node === 'string') return check(node, at);
    if (Array.isArray(node)) return node.forEach((child, i) => walk(child, `${at}[${i}]`));
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        const here = at ? `${at}.${key}` : key;
        check(key, `${here} (key)`);
        walk(child, here);
      }
    }
  };
  walk(spec, '');
  return { ok: findings.length === 0, findings };
}

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
