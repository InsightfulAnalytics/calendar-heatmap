// Power BI Desktop, driven the way a viewer drives it, through the report canvas's WebView2 remote
// debugging. Desktop's report canvas is a WebView2 page; a Deneb visual is an iframe inside it.
// Started with a localhost debugging port, Desktop accepts a Chrome DevTools Protocol client, so
// this module can press, move and release the real mouse over a Calendar's days, read the dataset
// the Calendar's own Vega view holds, open Deneb's editor, and read what every other visual on the
// page then shows. The recipe and its limits are in report/README.md and the project LEARNINGS.
//
// Nothing here names a signal, a transform or a mark: the day mark and the day's date field come
// from the harness's spec adapter, the one place that knows them.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type Browser, type ElementHandle, type Frame, type Locator, type Page } from 'playwright-core';
import { ADAPTER, type SpecAdapter } from '../../../harness/src/adapter.ts';

export const PROJECT = path.resolve(import.meta.dirname, '..', '..', '..');
export const PBIP = path.join(PROJECT, 'report', 'Daily Sales.pbip');
export const REPORT = path.join(PROJECT, 'report', 'Daily Sales.Report');
export const PBI_DESKTOP_EXE = 'C:\\Program Files\\Microsoft Power BI Desktop\\bin\\PBIDesktop.exe';
/** The localhost port the report canvas's WebView2 listens on for this run. */
export const DEBUG_PORT = 9339;
/** WebView2 reads extra browser arguments from this variable when it starts its browser process. */
export const WEBVIEW2_ARGS_VARIABLE = 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS';
const UIA_SCRIPT = path.join(import.meta.dirname, 'uia.ps1');

// ------------------------------------------------------------------------------------------------
// The Desktop process: which instance holds the PBIP, starting it with a debugging port, saving and
// closing it through UI Automation. Windows and Desktop only.

export interface DesktopInstance {
  pid: number;
  currentFilePath: string;
  hasUnsavedChanges: boolean;
}

/** pbir, started without a shell so every argument arrives exactly as given. */
export function pbir(args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync('pbir', args, { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? -1, out: r.stdout ?? '', err: r.stderr ?? '' };
}

/** Desktop instances holding this project's PBIP, from `pbir desktop list`. */
export function desktopInstances(pbip = PBIP): DesktopInstance[] {
  const r = pbir(['desktop', 'list', '--json']);
  let parsed: { instances?: DesktopInstance[] } = {};
  try { parsed = JSON.parse(r.out); } catch { return []; }
  return (parsed.instances ?? []).filter((i) => i.currentFilePath && path.resolve(i.currentFilePath) === path.resolve(pbip));
}

/** Every running PBIDesktop.exe, whatever it holds. */
export function desktopProcesses(): number[] {
  const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq PBIDesktop.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return (r.stdout ?? '').split(/\r?\n/).map((l) => l.split('","')[1]).filter(Boolean).map(Number);
}

async function waitFor<T>(what: string, seconds: number, probe: () => Promise<T | undefined> | T | undefined): Promise<T> {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await probe();
    if (v !== undefined && v !== null && v !== false) return v;
    if (Date.now() > until) throw new Error(`timed out after ${seconds}s waiting for ${what}`);
    await sleep(1000);
  }
}

async function cdpVersion(port: number): Promise<{ Browser: string } | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as { Browser: string }) : undefined;
  } catch { return undefined; }
}

/**
 * Starts Desktop on the PBIP and waits until `pbir desktop list` shows it. With a debugging port,
 * the WebView2 variable is set in the child's environment only, never for the user or the machine,
 * and the call also waits for the DevTools endpoint on 127.0.0.1. WebView2 applies browser
 * arguments only when it starts its browser process, which Desktop instances share, so the call
 * refuses to start while any Desktop is running.
 */
export async function launchDesktop(opts: { debugPort?: number | null; pbip?: string } = {}): Promise<DesktopInstance> {
  const pbip = opts.pbip ?? PBIP;
  const port = opts.debugPort === undefined ? DEBUG_PORT : opts.debugPort;
  if (desktopProcesses().length > 0) throw new Error('a Power BI Desktop process is already running; close it first (one instance per PBIP, and WebView2 shares one browser process)');
  if (!existsSync(PBI_DESKTOP_EXE)) throw new Error(`Power BI Desktop is not at ${PBI_DESKTOP_EXE}`);
  const env = { ...process.env };
  delete env[WEBVIEW2_ARGS_VARIABLE];
  if (port !== null) env[WEBVIEW2_ARGS_VARIABLE] = `--remote-debugging-port=${port}`;
  const child = spawn(PBI_DESKTOP_EXE, [pbip], { env, detached: true, stdio: 'ignore' });
  child.unref();
  const instance = await waitFor('Desktop to open the PBIP (pbir desktop list)', 240, () => desktopInstances(pbip)[0]);
  if (port !== null) await waitFor(`the DevTools endpoint on 127.0.0.1:${port}`, 60, () => cdpVersion(port));
  return instance;
}

function runUia(action: 'save' | 'close', pid: number, timeoutSeconds = 120): { ok: boolean; detail: string } {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', UIA_SCRIPT, '-Action', action, '-ProcessId', String(pid), '-TimeoutSeconds', String(timeoutSeconds)], { encoding: 'utf8' });
  const line = (r.stdout ?? '').trim().split(/\r?\n/).pop() ?? '';
  try { return JSON.parse(line); } catch { return { ok: false, detail: `${line} ${r.stderr ?? ''}`.trim() }; }
}

/**
 * Closes Desktop through its window, answering the save prompt with "Don't save". Never kills it:
 * a force-kill after a save truncates the data cache (see the connect-pbid skill).
 */
export async function closeDesktop(pid: number): Promise<string> {
  const r = runUia('close', pid, 180);
  if (!r.ok) throw new Error(`Desktop ${pid} did not close: ${r.detail}`);
  await waitFor('the Desktop process to exit', 60, () => !desktopProcesses().includes(pid));
  return r.detail;
}

/**
 * Saves through the title bar Save button, then waits until `pbir desktop list` reports no unsaved
 * changes and the data cache has stopped growing (so a later close cannot truncate it).
 */
export async function saveDesktop(pid: number, pbip = PBIP): Promise<void> {
  const r = runUia('save', pid);
  if (!r.ok) throw new Error(`save failed: ${r.detail}`);
  await waitFor('the save to finish (no unsaved changes)', 120, () => desktopInstances(pbip).find((i) => i.pid === pid && !i.hasUnsavedChanges));
  const cache = path.join(path.dirname(pbip), `${path.basename(pbip, '.pbip')}.SemanticModel`, '.pbi', 'cache.abf');
  const { statSync } = await import('node:fs');
  let last = -1, stable = 0;
  for (let i = 0; i < 60 && stable < 3; i++) {
    const size = existsSync(cache) ? statSync(cache).size : 0;
    stable = size > 0 && size === last ? stable + 1 : 0;
    last = size;
    await sleep(2000);
  }
}

// ------------------------------------------------------------------------------------------------
// DAX against the engine of the Desktop instance holding the Report, through pbir model -q.
// pbir's JSON output cannot carry a datetime cell, so queries return numbers, text and flags only.

export function dax(query: string, report = REPORT): Record<string, unknown>[] {
  const r = pbir(['model', report, '-q', query, '--json']);
  if (r.code !== 0) throw new Error(`pbir model -q exited ${r.code}: ${r.err.trim() || r.out.trim()}`);
  const rows = JSON.parse(r.out) as Record<string, unknown>[];
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/^\[|\]$/g, ''), v])));
}

/** One scalar: its value, or null when blank. */
export function daxScalar(expr: string, report = REPORT): number | string | boolean | null {
  const [row] = dax(`EVALUATE ROW ( "blank", ISBLANK ( ${expr} ), "v", ${expr} )`, report);
  if (!row) throw new Error(`no row for ${expr}`);
  return row.blank ? null : (row.v as number | string | boolean);
}

// ------------------------------------------------------------------------------------------------
// The report canvas, over the DevTools Protocol.

/** A value in a Calendar's dataset, as the Calendar received it. Dates are described, not converted. */
export type DatasetValue = string | number | boolean | null | { date: { type: string; time: number; text: string; iso: string; localDay: string } };
export interface TableReading {
  /** The grid's own row count: header, data rows and the Total row. */
  ariaRowCount: number;
  header: string[];
  rows: string[][];
  total: string[] | null;
}
/** What the rest of the page shows: every card, every text box, and each table's rows. */
export interface PageReading {
  cards: Record<string, string>;
  textBoxes: string[];
  tables: Record<string, TableReading>;
}

/** Whether the canvas debugging port answers. */
export async function portAnswers(port = DEBUG_PORT): Promise<boolean> {
  return (await cdpVersion(port)) !== undefined;
}

/**
 * A connection to the Desktop instance holding the PBIP, through the debugging port. When the port
 * does not answer, a Desktop holding the PBIP alone is closed (Don't save) and started again with
 * the port; any other Desktop running stops it.
 */
export async function desktopWithPort(port = DEBUG_PORT): Promise<Desktop> {
  if (!(await portAnswers(port))) {
    if (desktopProcesses().length > 0) {
      const mine = desktopInstances();
      if (mine.length !== 1 || desktopProcesses().length !== 1) throw new Error('another Power BI Desktop is running; this check needs the PBIP alone in Desktop');
      console.log(`  ....  closing Desktop ${mine[0].pid} (no debugging port): ${await closeDesktop(mine[0].pid)}`);
    }
    const i = await launchDesktop({ debugPort: port });
    console.log(`  ....  Desktop ${i.pid} opened ${i.currentFilePath} with the debugging port`);
  }
  return connectDesktop(port);
}

export async function connectDesktop(port = DEBUG_PORT): Promise<Desktop> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = await waitFor('the report view page', 60, () => browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('/reportView.html')));
  return new Desktop(browser, page);
}

export class Desktop {
  readonly browser: Browser;
  readonly page: Page;
  constructor(browser: Browser, page: Page) { this.browser = browser; this.page = page; }

  /** Disconnects. Desktop keeps running: Playwright only drops its own connection. */
  async disconnect(): Promise<void> { await this.browser.close(); }

  /**
   * A visual container by its accessible name: a Deneb visual's alt text, or a native visual's
   * title. Desktop pads the name with a space, so it is compared with spaces normalised.
   */
  container(name: string): Locator {
    return this.page.locator('.visualContainer').and(this.page.locator(`xpath=//*[normalize-space(@aria-label)="${name}"]`));
  }

  deneb(altText: string, adapter: SpecAdapter = ADAPTER): DenebVisual { return new DenebVisual(this, altText, adapter); }

  /** Waits until the canvas has drawn its visuals, and a named Deneb visual its days. */
  async waitForCanvas(calendar?: DenebVisual): Promise<void> {
    await waitFor('the report canvas', 120, async () => (await this.page.locator('.visualContainer').count()) > 0 || undefined);
    if (calendar) await waitFor('the Calendar to draw its days', 120, async () => { try { return (await calendar.days()).length > 0 || undefined; } catch { return undefined; } });
  }

  /** Every card, text box and table on the page, as a viewer reads them. Tables are scrolled through. */
  async read(): Promise<PageReading> {
    const cards: Record<string, string> = {};
    const tables: Record<string, TableReading> = {};
    const found = await this.page.evaluate(() => [...document.querySelectorAll('.visualContainer')].map((v) => ({
      role: v.getAttribute('aria-roledescription') ?? '', label: (v.getAttribute('aria-label') ?? '').trim(), grid: !!v.querySelector('[role=grid]'),
      text: ((v as HTMLElement).innerText ?? '').replace(/\uFEFF/g, '').trim(),
    })));
    const textBoxes: string[] = [];
    for (const v of found) {
      if (v.role === 'Card') cards[v.label] = v.text.split('\n').map((s) => s.trim()).filter((s) => s && s !== v.label)[0] ?? '';
      else if (v.role === 'Text box') textBoxes.push(v.text);
      else if (v.grid && v.label) tables[v.label] = await this.table(v.label);
    }
    return { cards, textBoxes, tables };
  }

  /** A table visual's rows, scrolled through from top to bottom, then scrolled back. */
  async table(title: string): Promise<TableReading> {
    const grid = this.container(title).locator('[role=grid]');
    // The grid is virtualised: only the rows in view exist. Rows are collected by aria-rowindex
    // while the body scrolls down in small steps, in up to four passes until none is missing.
    return grid.evaluate(async (g) => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const cellsOf = (row: Element) => [...row.querySelectorAll('[role=gridcell],[role=columnheader],[role=rowheader]')]
        .map((c) => ((c as HTMLElement).innerText ?? '').replace(/\u00A0/g, ' ').trim())
        .filter((t, i) => !(i === 0 && (t === 'Select Row' || t === 'Row Selection')));
      const count = Number(g.getAttribute('aria-rowcount'));
      const byIndex = new Map<number, string[]>();
      const collect = () => {
        for (const r of g.querySelectorAll('[role=row]')) {
          const cells = cellsOf(r);
          if (cells.some((c) => c !== '')) byIndex.set(Number(r.getAttribute('aria-rowindex')), cells);
        }
      };
      const missing = () => { for (let i = 1; i <= count; i++) if (!byIndex.has(i)) return true; return false; };
      const scroller = g.querySelector('.mid-viewport') as HTMLElement | null;
      await wait(200);
      collect();
      for (let pass = 0; scroller && pass < 4 && missing(); pass++) {
        scroller.scrollTop = 0; await wait(300); collect();
        for (let guard = 0; guard < 4000 && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1; guard++) {
          const before = scroller.scrollTop;
          scroller.scrollTop += Math.max(16, Math.floor(scroller.clientHeight * 0.4));
          await wait(200); collect();
          if (scroller.scrollTop === before) break;
        }
        await wait(300); collect();
      }
      if (scroller) scroller.scrollTop = 0;
      const rows: string[][] = [];
      for (let i = 2; i < count; i++) rows.push(byIndex.get(i) ?? ['(not read)']);
      return { ariaRowCount: count, header: byIndex.get(1) ?? [], rows, total: count > 1 ? byIndex.get(count) ?? null : null };
    });
  }

  /** The items of an open context or options menu, or null when none is open. */
  async openMenu(): Promise<string[] | null> {
    const items = await this.page.evaluate(() => {
      const menus = [...document.querySelectorAll('pbi-menu[role=menu]')].filter((m) => m.getBoundingClientRect().width > 0);
      if (!menus.length) return null;
      return menus.flatMap((m) => [...m.querySelectorAll('[role^=menuitem]')].map((i) => ((i as HTMLElement).innerText ?? '').trim()).filter(Boolean));
    });
    return items;
  }

  async pressEscape(): Promise<void> { await this.page.keyboard.press('Escape'); }

  /**
   * Waits until the page stops changing after a gesture: what every card, text box and table shows
   * and the given Calendars' selected flags must read the same over three seconds.
   */
  async settle(calendars: DenebVisual[] = [], seconds = 30): Promise<void> {
    await sleep(1200);
    let last = '', stable = 0;
    const until = Date.now() + seconds * 1000;
    while (stable < 5) {
      if (Date.now() > until) throw new Error(`the page did not settle within ${seconds}s`);
      const sig = JSON.stringify([
        await this.page.evaluate(() => [...document.querySelectorAll('.visualContainer')].map((v) => {
          const g = v.querySelector('[role=grid]');
          return [((v as HTMLElement).innerText ?? '').slice(0, 400), g ? g.getAttribute('aria-rowcount') : null];
        })),
        ...(await Promise.all(calendars.map(async (c) => { try { return await c.selectedFlags(); } catch { return 'unreadable'; } }))),
      ]);
      stable = sig === last ? stable + 1 : 0;
      last = sig;
      await sleep(600);
    }
  }

  /** A PNG of the page canvas (canvasOnly) or of the whole report view. */
  async screenshot(file: string, opts: { canvasOnly?: boolean } = {}): Promise<string> {
    if (opts.canvasOnly) {
      const box = await this.page.locator('.visualContainerHost[role=region]').first().boundingBox();
      if (box) { await this.page.screenshot({ path: file, clip: box }); return file; }
    }
    await this.page.screenshot({ path: file });
    return file;
  }

  /** Leaves Deneb's editor (focus mode) for the report canvas. */
  async backToReport(): Promise<void> {
    await this.page.locator('[data-testid=back-to-report-button]').click();
    await waitFor('the report canvas after Back to report', 60, async () => (await this.page.locator('[data-testid=back-to-report-button]').count()) === 0 || undefined);
    await sleep(1500);
  }
}

/** One Deneb visual on the page, found by its alt text. */
export class DenebVisual {
  readonly desktop: Desktop;
  readonly altText: string;
  readonly adapter: SpecAdapter;
  constructor(desktop: Desktop, altText: string, adapter: SpecAdapter) { this.desktop = desktop; this.altText = altText; this.adapter = adapter; }

  get page(): Page { return this.desktop.page; }

  /** The visual container: in the report its accessible name is the alt text (Desktop prefixes a space). */
  container(): Locator { return this.desktop.container(this.altText); }

  /** The visual's sandbox frame. In Deneb's editor the report containers are gone and one sandbox remains. */
  async frame(): Promise<Frame> {
    const inReport = this.container();
    if ((await inReport.count()) === 1) {
      const f = await (await inReport.locator('iframe').elementHandle())?.contentFrame();
      if (f) return f;
    }
    const sandboxes = this.page.frames().filter((f) => f.name() === 'visual-sandbox');
    if ((await this.page.locator('[data-testid=back-to-report-button]').count()) > 0 && sandboxes.length === 1) return sandboxes[0];
    throw new Error(`no Deneb visual with alt text "${this.altText}" on the canvas`);
  }

  /** The dataset the visual's Vega view holds, row by row, exactly as Deneb delivered it. */
  async dataset(): Promise<{ fields: string[]; rows: Record<string, DatasetValue>[] }> {
    const frame = await this.frame();
    return frame.evaluate(() => {
      const holder = [...document.querySelectorAll('svg *')].find((el) => (el as unknown as { __data__?: { context?: { dataflow?: unknown } } }).__data__?.context?.dataflow);
      if (!holder) throw new Error('no Vega view in the visual (is it drawn with the SVG renderer?)');
      const view = (holder as unknown as { __data__: { context: { dataflow: { data: (n: string) => Record<string, unknown>[] } } } }).__data__.context.dataflow;
      const pad = (n: number) => String(n).padStart(2, '0');
      const rows = view.data('dataset');
      const fields = rows.length ? Object.keys(rows[0]).filter((k) => !k.startsWith('_') || k === '__row__' || k === '__selected__') : [];
      return {
        fields,
        rows: rows.map((r) => Object.fromEntries(fields.map((k) => {
          const v = r[k];
          if (v instanceof Date) return [k, { date: { type: Object.prototype.toString.call(v), time: v.getTime(), text: String(v), iso: v.toISOString(), localDay: `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` } }];
          return [k, v === undefined ? null : (v as string | number | boolean | null)];
        }))),
      };
    });
  }

  /** Counts of each row's selected flag: on, off or neutral. */
  async selectedFlags(): Promise<Record<string, number>> {
    const { rows } = await this.dataset();
    const counts: Record<string, number> = {};
    for (const r of rows) { const f = String(r.__selected__); counts[f] = (counts[f] ?? 0) + 1; }
    return counts;
  }

  /** The time zone the visual's page runs in, as its own Intl reports it. */
  async timeZone(): Promise<string> {
    return (await this.frame()).evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  }

  /** Every drawn day: its date, its box on screen, its fill, and the dataset row it shows (by the row's own date). */
  async days(): Promise<{ date: string; x: number; y: number; width: number; height: number; fill: string | null; rowDay: string | null; row: number | null }[]> {
    const frame = await this.frame();
    return frame.evaluate((a) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const holder = [...document.querySelectorAll('svg *')].find((el) => (el as unknown as { __data__?: { context?: { dataflow?: unknown } } }).__data__?.context?.dataflow);
      const view = holder ? (holder as unknown as { __data__: { context: { dataflow: { data: (n: string) => Record<string, unknown>[] } } } }).__data__.context.dataflow : null;
      const rowDay = new Map<number, string>();
      if (view) for (const r of view.data('dataset')) { const d = Object.values(r).find((v) => v instanceof Date) as Date | undefined; if (d) rowDay.set(r.__row__ as number, key(d)); }
      const out = [];
      for (const el of document.querySelectorAll('svg *')) {
        const it = (el as unknown as { __data__?: { mark?: { name?: string }; datum?: Record<string, unknown> } }).__data__;
        if (!it || !it.mark || it.mark.name !== a.dayMark || !it.datum) continue;
        const d = it.datum[a.dayDateField];
        if (!(d instanceof Date)) continue;
        const b = el.getBoundingClientRect();
        const row = typeof it.datum.__row__ === 'number' ? (it.datum.__row__ as number) : null;
        out.push({ date: key(d), x: b.x, y: b.y, width: b.width, height: b.height, fill: el.getAttribute('fill'), row, rowDay: row === null ? null : rowDay.get(row) ?? null });
      }
      return out;
    }, this.adapter);
  }

  /** The on-screen centre of one day, in page coordinates. */
  async dayCentre(date: string): Promise<{ x: number; y: number }> {
    const frame = await this.frame();
    const handle = await frame.evaluateHandle(({ a, date }) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      for (const el of document.querySelectorAll('svg *')) {
        const it = (el as unknown as { __data__?: { mark?: { name?: string }; datum?: Record<string, unknown> } }).__data__;
        const d = it?.datum?.[a.dayDateField];
        if (it?.mark?.name === a.dayMark && d instanceof Date && `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === date) return el;
      }
      return null;
    }, { a: this.adapter, date });
    const el = handle.asElement() as ElementHandle | null;
    if (!el) throw new Error(`${date} is not drawn`);
    const box = await el.boundingBox();
    if (!box) throw new Error(`${date} has no box on screen`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  async #withKeys<T>(keys: { shift?: boolean; ctrl?: boolean }, act: () => Promise<T>): Promise<T> {
    const held = [keys.shift ? 'Shift' : null, keys.ctrl ? 'Control' : null].filter(Boolean) as string[];
    for (const k of held) await this.page.keyboard.down(k);
    try { return await act(); } finally { for (const k of held.reverse()) await this.page.keyboard.up(k); }
  }

  /** A left click on one day, optionally with shift or ctrl held. */
  async click(date: string, keys: { shift?: boolean; ctrl?: boolean } = {}): Promise<void> {
    const c = await this.dayCentre(date);
    await this.#withKeys(keys, () => this.page.mouse.click(c.x, c.y));
  }

  /** A left-button drag from one day to another, passing over the days between. */
  async drag(from: string, to: string, keys: { shift?: boolean; ctrl?: boolean } = {}): Promise<void> {
    const a = await this.dayCentre(from), b = await this.dayCentre(to);
    await this.#withKeys(keys, async () => {
      await this.page.mouse.move(a.x, a.y);
      await this.page.mouse.down();
      await this.page.mouse.move(b.x, b.y, { steps: 24 });
      await this.page.mouse.up();
    });
  }

  async rightClick(date: string): Promise<void> {
    const c = await this.dayCentre(date);
    await this.page.mouse.click(c.x, c.y, { button: 'right' });
  }

  /** A left click inside the visual where nothing is drawn: its top-left padding corner. */
  async backgroundClick(): Promise<void> {
    const frame = await this.frame();
    // The frame also holds Deneb's own icon SVGs; the view is the SVG that holds the scenegraph root.
    const handle = await frame.evaluateHandle(() => {
      const holder = [...document.querySelectorAll('svg *')].find((el) => (el as unknown as { __data__?: { context?: { dataflow?: unknown } } }).__data__?.context?.dataflow);
      let svg = holder ? (holder as SVGElement).ownerSVGElement : null;
      while (svg && svg.ownerSVGElement) svg = svg.ownerSVGElement;
      return svg;
    });
    const svg = handle.asElement() as ElementHandle | null;
    const box = svg ? await svg.boundingBox() : null;
    if (!box) throw new Error('the visual has no drawn view');
    await this.page.mouse.click(box.x + 4, box.y + 4);
  }

  // ---- Deneb's editor, opened from the visual's More options menu ----------------------------

  async openEditor(): Promise<void> {
    const host = this.page.locator('visual-container', { has: this.container() });
    await this.container().hover();
    await host.locator('[data-testid=visual-more-options-btn]').click({ force: true });
    await this.page.locator('[data-testid="pbimenu-item.Edit"]').click();
    await waitFor("Deneb's editor and its debug pane", 90, async () => {
      const frames = this.page.frames().filter((f) => f.name() === 'visual-sandbox');
      for (const f of frames) if ((await f.locator('button[name=debugMode][value=source]').count()) > 0) return true;
      return undefined;
    });
    await sleep(1000);
  }

  /** Switches the editor's debug pane to a tab: source (the dataset as received), data, signal or log. */
  async debugTab(tab: 'source' | 'data' | 'signal' | 'log'): Promise<void> {
    const frame = await this.frame();
    await frame.locator(`button[name=debugMode][value=${tab}]`).click();
    await sleep(800);
  }

  /** The editor's Source table in full, paged through: its "of N" count, headers and every row's text. */
  async debugSource(): Promise<{ count: number; headers: string[]; rows: string[][] }> {
    await this.debugTab('source');
    const frame = await this.frame();
    const first = frame.locator('button[aria-label="Go to first page"]');
    if (await first.isEnabled()) {
      await first.click();
      await waitFor('the first page of the Source table', 20, async () => (/^1-/.test((await frame.evaluate(() => (document.body.innerText.match(/\d+-\d+ of \d+/) ?? [''])[0]))) ? true : undefined));
    }
    // One grid, a header row group and a body row group; each body row's cells are the columns in
    // header order. The pager reads "151-200 of 365".
    const read = () => frame.evaluate(() => {
      const grid = document.querySelector('[role=grid]');
      const headers = grid ? [...grid.querySelectorAll('[role=columnheader]')].map((h) => (h as HTMLElement).innerText.trim()) : [];
      const bodies = grid ? [...grid.querySelectorAll(':scope [role=rowgroup]')] : [];
      const body = bodies[bodies.length - 1];
      const rows = body ? [...body.children].filter((r) => r.getAttribute('role') === 'row').map((r) => [...r.children].map((c) => (c as HTMLElement).innerText.trim())) : [];
      const m = document.body.innerText.match(/(\d+)-(\d+) of (\d+)/);
      return { headers, rows, range: m ? m[0] : '', count: m ? Number(m[3]) : -1 };
    });
    let page = await read();
    const byFirstCell = new Map<string, string[]>();
    const keep = (rows: string[][]) => { for (const r of rows) byFirstCell.set(r[0] ?? '', r); };
    keep(page.rows);
    const next = frame.locator('button[aria-label="Go to next page"]');
    for (let guard = 0; guard < 500 && (await next.isEnabled()); guard++) {
      const was = page.range;
      await next.click();
      page = await waitFor('the next page of the Source table', 20, async () => { const p = await read(); return p.range !== was ? p : undefined; });
      keep(page.rows);
    }
    if (await first.isEnabled()) await first.click();
    return { count: page.count, headers: page.headers, rows: [...byFirstCell.values()] };
  }

  /** Pages the editor's Source table to the row whose first cell (__row__) reads `rowId`, and returns it. */
  async showSourceRow(rowId: string): Promise<string[]> {
    await this.debugTab('source');
    const frame = await this.frame();
    const range = () => frame.evaluate(() => (document.body.innerText.match(/\d+-\d+ of \d+/) ?? [''])[0]);
    const first = frame.locator('button[aria-label="Go to first page"]');
    if (await first.isEnabled()) {
      await first.click();
      await waitFor('the first page of the Source table', 20, async () => (/^1-/.test(await range()) ? true : undefined));
    }
    // Finds the row on the page shown, scrolls it into view, and returns its cells' text.
    const find = () => frame.evaluate((id) => {
      const body = [...document.querySelectorAll('[role=grid] [role=rowgroup]')].pop();
      const row = body ? [...body.children].find((r) => ((r.children[0] as HTMLElement | undefined)?.innerText ?? '').trim() === id) : undefined;
      if (!row) return null;
      row.scrollIntoView({ block: 'center' });
      return [...row.children].map((c) => (c as HTMLElement).innerText.trim());
    }, rowId);
    const next = frame.locator('button[aria-label="Go to next page"]');
    for (let guard = 0; guard < 500; guard++) {
      const row = await find();
      if (row) { await sleep(400); return row; }
      if (!(await next.isEnabled())) break;
      const was = await range();
      await next.click();
      await waitFor('the next page of the Source table', 20, async () => ((await range()) !== was ? true : undefined));
    }
    throw new Error(`no Source row ${rowId}`);
  }

  /** The editor's log lines (parse errors, warnings, runtime errors). */
  async debugLogs(): Promise<string[]> {
    await this.debugTab('log');
    const frame = await this.frame();
    const text = await frame.evaluate(() => document.body.innerText);
    return text.split('\n').map((l) => l.trim()).filter((l) => /^\[(Warn|Error|Info)\]/.test(l));
  }
}
