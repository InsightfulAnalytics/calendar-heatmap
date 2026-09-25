// The template seam: render a Deneb calendar spec in headless Edge, the way Deneb and the Power BI
// host would feed and judge it, replay viewer gestures, and answer questions about the scene by
// date. Checks use only this module's interface; they never name signals, marks or transforms.
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { harnessPath } from './paths.ts';
import { ADAPTER } from './adapter.ts';
import { loadFixture, type Fixture } from './fixtures.ts';
import { loadTheme } from './theme.ts';
import {
  applyOptions, loadSpec, prepareForDeneb, readDenebVisual, resolveSpecSource, scanContainerNames,
  type DenebVersion, type Json, type JsonObject, type ScanResult, type SpecSource,
} from './spec.ts';

export { applyLimits, withApplyLimit } from './spec.ts';
export type { Json, JsonObject, ScanResult, ScanFinding, SpecSource } from './spec.ts';
export type { Fixture, FixtureRow } from './fixtures.ts';

export type VegaVersion = '6.2' | '6.4';
/** Deneb 1.9 runs Vega 6.2.0; Deneb 2.0 runs Vega 6.4.0. */
export const DENEB_OF: Record<VegaVersion, DenebVersion> = { '6.2': '1.9', '6.4': '2.0' };
export const VEGA_VERSIONS: VegaVersion[] = ['6.2', '6.4'];
/** The default suite's time zones: UTC, one well east and one well west. */
export const TIME_ZONES = ['UTC', 'Pacific/Auckland', 'America/Los_Angeles'];

/** Where a check runs: a Vega version (so a Deneb version) and the page's time zone. */
export interface Cell {
  vega: VegaVersion;
  timeZone: string;
}

/** A render with no cell given runs here. */
export const DEFAULT_CELL: Cell = { vega: '6.4', timeZone: 'UTC' };

/** A cell's name, which prefixes every check run in it: "[Vega 6.2, Pacific/Auckland]". */
export const cellLabel = ({ vega, timeZone }: Cell): string => `[Vega ${vega}, ${timeZone}]`;

/** The suite's matrix: both Vega versions (Deneb 1.9 and 2.0), each in every default time zone. */
export const CELLS: (Cell & { label: string })[] = VEGA_VERSIONS.flatMap((vega) =>
  TIME_ZONES.map((timeZone) => ({ vega, timeZone, label: cellLabel({ vega, timeZone }) })));

/**
 * How the host delivers a date column: local midnight, UTC midnight or the date as text. Desktop
 * delivers a Date at local midnight in the viewer's time zone (SPEC, "Dates and time zones": read
 * by #2 in two Windows time zones), so 'local' is the default and the other two are the
 * alternatives the spec must not depend on.
 */
export const DATE_DELIVERIES = ['local', 'utc', 'text'] as const;
export type DateDelivery = (typeof DATE_DELIVERIES)[number];

/** What to render. The cell (vega and timeZone) defaults to DEFAULT_CELL, field by field. */
export interface RenderInput extends Partial<Cell> {
  /** A named spec ('prototype'), a .json path relative to harness/, or a source with a config. */
  spec: string | SpecSource;
  /** A named fixture, or a fixture object. */
  fixture: string | Fixture;
  /** The visual's container size in pixels. Default 1080 by 362 (the prototype's card). */
  size?: { width: number; height: number };
  /** A named theme ('bi-nexus') or a theme JSON path. Default 'bi-nexus'. */
  theme?: string;
  /** Values for top-level signals (the spec's named options). */
  options?: Record<string, Json>;
  dateDelivery?: DateDelivery;
  /** Row identities the host already holds selected when the visual renders. */
  selected?: number[];
  /** Highlight companion values per measure, one per fixture row (null: not highlighted). */
  highlight?: Record<string, (number | null)[]>;
  /** The format pane's data point limit (selectionMaxDataPoints). Default 50. */
  dataPointLimit?: number;
}

export interface DayScene {
  /** The calendar day, 'YYYY-MM-DD', in the viewer's time zone. */
  date: string;
  /** Page coordinates and size of the drawn day. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill as the browser resolves it ('#rrggbb', or rgba() when translucent). */
  fill: string | null;
  opacity: number;
  fillOpacity: number;
  /** True when the Peak day ring is drawn on this day. */
  ring: boolean;
  ringStroke?: string;
  ringWidth?: number;
  /** The tooltip content the day hands to the host. */
  tooltip: unknown;
  /**
   * The dataset row identity (__row__) the day's datum carries: a row number; null when the datum
   * has the identity field set to null; undefined when the datum has no identity field at all.
   * The difference matters: Deneb 1.9 treats any identity that is present as real, null included.
   */
  row: number | null | undefined;
  /** Whether the day's datum has an identity field at all. False only when the identity is absent. */
  hasIdentity: boolean;
}

export interface Label {
  text: string;
  x: number;
  y: number;
  fill: string | null;
  fontSize: number | null;
}

export interface Scene {
  days: DayScene[];
  labels: Label[];
}

export type HostCall =
  | { type: 'select'; rows: number[]; dates: string[]; multiSelect: boolean }
  | { type: 'clear' };

/** Deneb's apply result, as the spec receives it. */
export interface ApplyResult {
  rowNumbers?: number[];
  multiSelect?: boolean;
  exceedsLimit?: boolean;
  warning?: string;
}

export interface ApplyCall {
  expression: unknown;
  resolvedExpression?: string;
  options: unknown;
  browserEvent: boolean;
  eventType: string | null;
  result: ApplyResult;
}

export interface Modifiers {
  shift?: boolean;
  ctrl?: boolean;
}

export type DescribedValue =
  | { type: 'Date'; localDate: string; localTime: string; utcDate: string; utcTime: string }
  | { type: 'string'; value: string }
  | string | number | boolean | null;

const VEGA_BUNDLE: Record<VegaVersion, string> = {
  '6.2': harnessPath('node_modules', 'vega-6.2', 'build', 'vega.min.js'),
  '6.4': harnessPath('node_modules', 'vega-6.4', 'build', 'vega.min.js'),
};
const RUNTIME = harnessPath('src', 'page', 'runtime.js');
/** The visual's container size when none is given: the prototype's card. */
const DEFAULT_SIZE = { width: 1080, height: 362 };
const MARGIN = 40;

/** The Calendar each page currently shows. A page holds one view: a later render replaces it. */
const current = new WeakMap<Page, Calendar>();

/** One rendered Calendar: the scene, the host's view of it, and gestures. */
export class Calendar {
  readonly input: RenderInput;
  readonly fixture: Fixture;
  readonly #page: Page;

  constructor(page: Page, input: RenderInput, fixture: Fixture) {
    this.#page = page;
    this.input = input;
    this.fixture = fixture;
  }

  #call<T>(fn: string, ...args: unknown[]): Promise<T> {
    if (current.get(this.#page) !== this) {
      throw new Error('this Calendar was replaced by a later render in the same Vega version and time zone; read it before rendering again');
    }
    return this.#page.evaluate(([f, a]) => (window as any).__harness[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
  }

  async scene(): Promise<Scene> {
    return this.#call<Scene>('scene');
  }

  async days(): Promise<DayScene[]> {
    return (await this.scene()).days;
  }

  /** The drawn day for a date ('YYYY-MM-DD'), or undefined when no day is drawn for it. */
  async day(date: string): Promise<DayScene | undefined> {
    return (await this.days()).find((d) => d.date === date);
  }

  /** Every label drawn (visible text), in scene order. */
  async labels(): Promise<Label[]> {
    return (await this.scene()).labels;
  }

  async hostCalls(): Promise<HostCall[]> {
    const calls = await this.#call<({ type: 'select'; rows: number[]; multiSelect: boolean } | { type: 'clear' })[]>('hostCalls');
    return calls.map((c) => (c.type === 'select' ? { ...c, dates: c.rows.map((r) => String(this.fixture.rows[r]?.[this.fixture.dateField])) } : c));
  }

  async applyCalls(): Promise<ApplyCall[]> {
    return this.#call<ApplyCall[]>('applyCalls');
  }

  /** The row identities the host holds selected now. */
  async selection(): Promise<number[]> {
    return this.#call<number[]>('selection');
  }

  /** Whether Deneb is showing its selection limit warning. */
  async limitWarning(): Promise<boolean> {
    return this.#call<boolean>('limitWarning');
  }

  /** Errors Vega reported while rendering or handling events. */
  async errors(): Promise<string[]> {
    return (await this.#call<{ errors: string[] }>('status')).errors;
  }

  /** The rows the spec received, dates described by their shape. */
  async deliveredRows(): Promise<Record<string, DescribedValue>[]> {
    return this.#call<Record<string, DescribedValue>[]>('deliveredRows');
  }

  /** The time zone the page runs in. */
  async timeZone(): Promise<string> {
    return this.#call<string>('timeZone');
  }

  /** The version the page's Vega bundle reports ('6.2.0' or '6.4.0'). */
  async vegaVersion(): Promise<string> {
    return this.#call<string>('vegaVersion');
  }

  async screenshot(file: string): Promise<void> {
    await this.#page.locator('#vis').screenshot({ path: file });
  }

  async #point(date: string): Promise<{ x: number; y: number }> {
    const p = await this.#call<{ x: number; y: number } | null>('pointOf', date);
    if (!p) throw new Error(`no day is drawn for ${date}`);
    return p;
  }

  async #settle(): Promise<void> {
    const status = await this.#call<{ harnessErrors: string[] }>('settle');
    if (status.harnessErrors.length) throw new Error(`harness: ${status.harnessErrors.join('; ')}`);
  }

  async #withModifiers(mods: Modifiers | undefined, act: () => Promise<void>): Promise<void> {
    const keys = [mods?.shift && 'Shift', mods?.ctrl && 'Control'].filter(Boolean) as string[];
    for (const k of keys) await this.#page.keyboard.down(k);
    try {
      await act();
    } finally {
      for (const k of keys.reverse()) await this.#page.keyboard.up(k);
    }
    await this.#settle();
  }

  /** Left mouse button down on one day, across to another, and released there. */
  async drag(from: string, to: string, mods?: Modifiers): Promise<void> {
    const a = await this.#point(from);
    const b = await this.#point(to);
    const mouse = this.#page.mouse;
    await this.#withModifiers(mods, async () => {
      await mouse.move(a.x, a.y);
      await mouse.down();
      for (const f of [0.3, 0.6, 1]) await mouse.move(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, { steps: 6 });
      await mouse.up();
    });
  }

  /** A left drag from one day to another that carries on outside the view and is released there. */
  async dragReleasedOutside(from: string, to: string): Promise<void> {
    const a = await this.#point(from);
    const b = await this.#point(to);
    const out = await this.#call<{ x: number; y: number }>('outsidePoint');
    const mouse = this.#page.mouse;
    await this.#withModifiers(undefined, async () => {
      await mouse.move(a.x, a.y);
      await mouse.down();
      await mouse.move(b.x, b.y, { steps: 12 });
      await mouse.move(out.x, out.y, { steps: 6 });
      await mouse.up();
    });
  }

  async click(date: string, mods?: Modifiers & { button?: 'left' | 'right' | 'middle' }): Promise<void> {
    const p = await this.#point(date);
    await this.#withModifiers(mods, () => this.#page.mouse.click(p.x, p.y, { button: mods?.button ?? 'left' }));
  }

  async rightClick(date: string): Promise<void> {
    await this.click(date, { button: 'right' });
  }

  async middleClick(date: string): Promise<void> {
    await this.click(date, { button: 'middle' });
  }

  /** A left click inside the view on no day. */
  async backgroundClick(): Promise<void> {
    const p = await this.#call<{ x: number; y: number } | null>('backgroundPoint');
    if (!p) throw new Error('no background point: days cover every corner of the view');
    await this.#withModifiers(undefined, () => this.#page.mouse.click(p.x, p.y));
  }

  /** A touch tap on one day. */
  async tap(date: string): Promise<void> {
    const p = await this.#point(date);
    await this.#withModifiers(undefined, () => this.#page.touchscreen.tap(p.x, p.y));
  }
}

export class Harness {
  readonly #browser: Browser;
  readonly #contexts = new Map<string, BrowserContext>();
  readonly #pages = new Map<string, Page>();

  constructor(browser: Browser) {
    this.#browser = browser;
  }

  async #page(timeZone: string, vega: VegaVersion): Promise<Page> {
    const key = `${timeZone}|${vega}`;
    const existing = this.#pages.get(key);
    if (existing) return existing;
    let context = this.#contexts.get(timeZone);
    if (!context) {
      context = await this.#browser.newContext({ timezoneId: timeZone, hasTouch: true, deviceScaleFactor: 1, locale: 'en-US' });
      this.#contexts.set(timeZone, context);
    }
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}#vis{position:absolute;left:${MARGIN}px;top:${MARGIN}px}</style></head><body><div id="vis"></div></body></html>`);
    await page.addScriptTag({ path: VEGA_BUNDLE[vega] });
    await page.addScriptTag({ path: RUNTIME });
    this.#pages.set(key, page);
    return page;
  }

  /** Render a spec over a fixture. Fails when Vega reports an error while rendering. */
  async render(input: RenderInput): Promise<Calendar> {
    const vega = input.vega ?? DEFAULT_CELL.vega;
    const timeZone = input.timeZone ?? DEFAULT_CELL.timeZone;
    const size = input.size ?? DEFAULT_SIZE;
    const fixture = typeof input.fixture === 'string' ? loadFixture(input.fixture) : input.fixture;
    const spec = specAsRun(input.spec, vega, size, input.options);
    const page = await this.#page(timeZone, vega);
    await page.setViewportSize({ width: size.width + 2 * MARGIN + 120, height: size.height + 2 * MARGIN + 80 });
    const cfg = {
      spec,
      deneb: DENEB_OF[vega],
      width: size.width,
      height: size.height,
      rows: fixture.rows,
      dateField: fixture.dateField,
      dateDelivery: input.dateDelivery ?? 'local',
      selected: input.selected ?? [],
      highlight: input.highlight ?? {},
      palette: loadTheme(input.theme ?? 'bi-nexus'),
      dataPointLimit: input.dataPointLimit ?? 50,
      adapter: ADAPTER,
    };
    const status = await page.evaluate((c: unknown) => (window as any).__harness.mount(c), cfg as unknown) as { errors: string[]; harnessErrors: string[] };
    const problems = [...status.harnessErrors, ...status.errors];
    if (problems.length) throw new Error(`render failed: ${problems.join('; ')}`);
    const calendar = new Calendar(page, input, fixture);
    current.set(page, calendar);
    return calendar;
  }

  async close(): Promise<void> {
    await this.#browser.close();
  }
}

/** The container-name scan of a spec as authored: container size names only in the top-level width and height. */
export function containerScan(spec: string | SpecSource): ScanResult {
  return scanContainerNames(loadSpec(resolveSpecSource(spec)));
}

/**
 * A spec as the given Vega version's Deneb runs it, which is what render embeds: its config merged,
 * any option values set, and the container size supplied the way that Deneb version supplies it.
 */
export function specAsRun(spec: string | SpecSource, vega: VegaVersion, size = DEFAULT_SIZE, options?: Record<string, Json>): JsonObject {
  return prepareForDeneb(applyOptions(loadSpec(resolveSpecSource(spec)), options), DENEB_OF[vega], size.width, size.height);
}

/** The field names a Deneb visual source delivers to its spec, in projection order. A spec file has none. */
export function specFields(spec: string | SpecSource): string[] {
  const source = resolveSpecSource(spec);
  if (!('visual' in source)) throw new Error('only a Deneb visual source binds fields; a spec file does not');
  return readDenebVisual(source.visual).fields;
}

/** Launch headless Microsoft Edge (the installed browser; nothing is downloaded). */
export async function openHarness(): Promise<Harness> {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  return new Harness(browser);
}
