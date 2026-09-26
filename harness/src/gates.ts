// The gates the Template must pass beside the harness (SPEC, "Testing Decisions" and "Prior art"):
// the Deneb template library's offline checker, and the deneb-pbir skill's parse check under the
// Deneb 1.9 and 2.0 rules. Both tools live outside this repo: the library clone
// (InsightfulAnalytics/Deneb) and the installed deneb-pbir skill. Set DENEB_LIBRARY or
// DENEB_PBIR_RENDERER to point elsewhere; a tool that is not there fails its gate, naming the
// variable, rather than being skipped.
//
// The checker renders headless in Node, in the time zone given (TZ), exactly as a library
// maintainer runs it. readSvgScene reads its SVG back as a scene of days and labels, so a check can
// ask where a day was drawn without trusting the checker's own pass line.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADAPTER } from './adapter.ts';
import { PROJECT_DIR } from './paths.ts';

/** The Template's folder, in the library's shape: <slug>.json, sample-data.csv, render.json, README.md. */
export const TEMPLATE_DIR = path.join(PROJECT_DIR, 'template', 'calendar-heatmap');

export const LIBRARY_DIR = process.env.DENEB_LIBRARY ?? path.resolve(PROJECT_DIR, '..', '..', 'Deneb');
export const LIBRARY_CHECKER = path.join(LIBRARY_DIR, 'tools', 'check-templates.mjs');
export const PARSE_RENDERER = process.env.DENEB_PBIR_RENDERER
  ?? path.join(os.homedir(), '.claude', 'skills', 'custom-visuals', 'skills', 'deneb-pbir', 'renderer', 'render.mjs');

function need(file: string, variable: string, what: string): void {
  if (!existsSync(file)) throw new Error(`${what} is not at ${file}; set ${variable} to its location`);
}

export interface CheckerRun {
  ok: boolean;
  /** The checker's own output: one ok or FAIL line per template, with its errors and warnings. */
  output: string;
  /** The rendered SVG, when a render folder was given. */
  svg?: string;
}

/**
 * Run the library's offline checker (tools/check-templates.mjs) on one template folder, in a time
 * zone. With renderDir, it also renders the template over its sample data and the SVG is returned.
 */
export function libraryCheck(templateDir: string, opts: { renderDir?: string; timeZone?: string } = {}): CheckerRun {
  need(LIBRARY_CHECKER, 'DENEB_LIBRARY', "The Deneb template library's checker");
  const args = [LIBRARY_CHECKER, templateDir, ...(opts.renderDir ? ['--render', opts.renderDir] : [])];
  const env = { ...process.env, ...(opts.timeZone ? { TZ: opts.timeZone } : {}) };
  const r = spawnSync(process.execPath, args, { cwd: path.dirname(LIBRARY_CHECKER), encoding: 'utf8', env, timeout: 180000 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const slug = path.basename(templateDir);
  const svgFile = opts.renderDir ? path.join(opts.renderDir, `${slug}.svg`) : undefined;
  return { ok: r.status === 0, output, svg: svgFile && existsSync(svgFile) ? readFileSync(svgFile, 'utf8') : undefined };
}

export interface ParseRun {
  ok: boolean;
  output: string;
  /** The renderer's JSON result line, when it printed one. */
  result?: Record<string, unknown>;
}

/**
 * The deneb-pbir parse check: render a spec file over sample rows under one Deneb version's rules.
 * Under 1.9 it fails on a denebContainer reference; under 2.0 it applies Deneb's container rename.
 * Any Vega error printed while rendering fails it too.
 */
export function parseCheck(specFile: string, dataFile: string, deneb: '1.9' | '2.0', size: { width: number; height: number }, outFile: string): ParseRun {
  need(PARSE_RENDERER, 'DENEB_PBIR_RENDERER', "The deneb-pbir skill's renderer");
  const args = [PARSE_RENDERER, specFile, outFile, '--data', dataFile, '--provider', 'vega', '--width', String(size.width), '--height', String(size.height), '--deneb', deneb];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const line = (r.stdout ?? '').trim().split(/\r?\n/).pop() ?? '';
  let result: Record<string, unknown> | undefined;
  try { result = JSON.parse(line) as Record<string, unknown>; } catch { result = undefined; }
  const errors = /\bError\b/.test(r.stderr ?? '');
  return { ok: r.status === 0 && !!result && !errors, output, result };
}

// ------------------------------------------------------------------ reading a rendered SVG

export interface SvgBox {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string | null;
}
export interface SvgLabel {
  text: string;
  x: number;
  y: number;
}
export interface SvgScene {
  /** Every day the day mark drew, in drawing order, as boxes. */
  days: SvgBox[];
  /** Every text drawn, at its anchor point. */
  labels: SvgLabel[];
}

const attrs = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

const translateOf = (transform: string | undefined): [number, number] => {
  const m = /translate\(\s*(-?[\d.e+-]+)[ ,]+(-?[\d.e+-]+)\s*\)/.exec(transform ?? '');
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};

/** The bounding box of an SVG path's points (M, L, H, V, C, S, Q, T, A, Z; absolute or relative). */
export function pathBox(d: string): { x1: number; y1: number; x2: number; y2: number } {
  const tokens = [...d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g)];
  let cmd = '';
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const xs: number[] = [], ys: number[] = [];
  const nums: number[] = [];
  const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const flush = () => {
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const n = arity[upper];
    if (upper === 'Z') { cx = sx; cy = sy; return; }
    while (n && nums.length >= n) {
      const a = nums.splice(0, n);
      const pts: [number, number][] = [];
      if (upper === 'H') pts.push([rel ? cx + a[0] : a[0], cy]);
      else if (upper === 'V') pts.push([cx, rel ? cy + a[0] : a[0]]);
      else if (upper === 'A') pts.push([rel ? cx + a[5] : a[5], rel ? cy + a[6] : a[6]]);
      else for (let i = 0; i < n; i += 2) pts.push([rel ? cx + a[i] : a[i], rel ? cy + a[i + 1] : a[i + 1]]);
      for (const [px, py] of pts) { xs.push(px); ys.push(py); }
      [cx, cy] = pts[pts.length - 1];
      if (upper === 'M') { [sx, sy] = [cx, cy]; cmd = rel ? 'l' : 'L'; }
    }
  };
  for (const [, c, num] of tokens) {
    if (c) { flush(); nums.length = 0; cmd = c; if (c.toUpperCase() === 'Z') flush(); }
    else nums.push(Number(num));
  }
  flush();
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** Read a rendered SVG back: the day mark's boxes (the mark named in the spec adapter) and every text. */
export function readSvgScene(svg: string): SvgScene {
  const group = new RegExp(`<g class="mark-\\w+ role-mark ${ADAPTER.dayMark}"[^>]*>([\\s\\S]*?)</g>`).exec(svg);
  const days = group
    ? [...group[1].matchAll(/<path\b([^>]*)>/g)].map(([, tag]) => {
      const a = attrs(tag);
      const [tx, ty] = translateOf(a.transform);
      const b = pathBox(a.d ?? '');
      return { x: b.x1 + tx, y: b.y1 + ty, width: b.x2 - b.x1, height: b.y2 - b.y1, fill: a.fill ?? null };
    })
    : [];
  const labels = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map(([, tag, text]) => {
    const [x, y] = translateOf(attrs(tag).transform);
    return { text: text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), x, y };
  });
  return { days, labels };
}
