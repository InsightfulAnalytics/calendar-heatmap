// In-page runtime: a stand-in for Deneb and the Power BI host, around one Vega view.
//
// Plain browser JavaScript, injected into the page after a Vega browser bundle (6.2 for Deneb 1.9,
// 6.4 for Deneb 2.0). The Node side (src/index.ts) drives it through window.__harness.
//
// DENEB FIDELITY. The cross-filter apply evaluator below mirrors Deneb's own source, rule by rule.
// Line numbers are at tag 2.0.0.0 of github.com/deneb-viz/deneb; 1.9.1.0 differs only where noted.
//   A1 src/lib/vega-embed/cross-filter-expressions.ts L85-92: selection mode must be advanced, else
//      return {} (this host is always in advanced mode; simple mode arrives with Selection, T09).
//   A2 L96-102, L239: the event must be a browser event (event instanceof Event), else the call is
//      rejected with the Event_Type warning.
//   A3 L105-111, L245: the expression must be a string when given.
//   A4 L112-121, L196-217: _{field}_ placeholders are replaced from the clicked item's datum, then
//      the expression is parsed (vega.parseExpression). 1.9.1.0 L167-180 writes a Date as
//      toDate('<Date.toString()>') and does not escape quotes; 2.0 writes toDate('<ISO>') and escapes.
//   A5 L123-129, L251-256: options.limit, when truthy, must lie in 1 to 2,500 (CROSS_FILTER_LIMITS in
//      src/lib/interactivity/constants.ts), else the whole call is rejected. A limit of 0 is falsy,
//      so it passes this check and later falls back to the format pane's data point limit (C4).
//   A6 L223-234: options default to {mode: expr ? 'advanced' : 'simple', filterExpr, limit: 50,
//      multiSelect: ['ctrl', 'shift']} (INTERACTIVITY_DEFAULTS.selectionMaxDataPoints = 50 in
//      packages/powerbi-compat/src/lib/interactivity/constants.ts), overridden by the given options.
//   A7 L147-149, L171-188: any warning rejects the call: the spec gets {warning, rowNumbers: []}
//      and the host is not called, so the previous selection stands.
//   C1 src/lib/interactivity/cross-filter.ts L103-179 getResolvedCrossFilterResult: multi-select
//      flag, resolution, limit check ({exceedsLimit: true, rowNumbers, multiSelect}), then
//      {rowNumbers, multiSelect} when rows matched, else {rowNumbers: []} (which clears).
//   C2 L186-249 getCrossFilterSelectionAdvanced: a separate headless View over the base dataset
//      values, seeded with the visual view's top-level signals only (event.dataflow._signals, the
//      operators themselves, as Deneb passes them), with one filter transform; the matching rows'
//      __row__ values are the result. Errors come back as a General_Error warning.
//   C3 L312-320, L343-360: the size checked is the matched rows plus, when the event is a
//      multi-select, the rows already selected; exceeded when it is greater than the limit.
//   C4 L279-290: the limit is (options.limit || null) ?? the format pane's data point limit.
//   C5 L366-387: multi-select is true when a key in options.multiSelect (ctrl, shift, alt) is held;
//      simple mode (not modelled here) uses ctrl, shift or meta.
//   D1 src/lib/interactivity/data-point.ts L130-146 getRowNumbersFromData: unique __row__ values;
//      2.0 keeps only integers within the dataset (isValidRowIndex L27-34); 1.9.1.0 L103-115 keeps
//      any defined value.
//   H1 src/lib/interactivity/interactivity-manager.ts L322-354 crossFilter: exceedsLimit shows the
//      limit warning and changes nothing; no rows clears the selection; otherwise select(rows,
//      multiSelect). L296-306 (cross-filter.ts): each row's __selected__ is 'on' when selected,
//      'neutral' when nothing is selected, else 'off'. After a selection change Deneb updates the
//      dataset and the spec is embedded again (a fresh view: signal state does not survive).
//   F1 packages/vega-runtime/src/lib/extensibility/expressions/color.ts and
//      packages/utils/src/lib/color.ts shadeColor: pbiColor, with Power BI's shade maths.
// Not modelled yet: simple mode, the host's multi-select merge (both T09), context menu and
// tooltip host calls. A select with multiSelect set is recorded but leaves the selection as it was.
(() => {
  'use strict';
  const vega = window.vega;
  const api = (window.__harness = {}); // what the Node side calls

  // ------------------------------------------------------------------ Deneb expression functions
  const WARN = {
    general: (msg) => `[pbiCrossFilterApply] ${msg}`,
    eventType: 'The first parameter must be a valid `event` from the Vega view.',
    missingFilter: 'The second parameter must be a valid filter expression.',
    options: '`options` must be a valid object, and contain valid property values. Refer to the documentation for more information.',
  };
  const CROSS_FILTER_LIMITS = { minDataPointsValue: 1, maxDataPointsAdvancedValue: 2500 };
  const DEFAULT_LIMIT = 50;
  const DEFAULT_COLOR = '#000000';

  let mounted = null; // the current mount: its config, view, rows, selection and records

  // F1: Power BI's shade maths, as Deneb's shadeColor.
  const shadeColor = (color, percent) => {
    const f = parseInt(color.slice(1), 16);
    const t = percent < 0 ? 0 : 255;
    const p = percent < 0 ? percent * -1 : percent;
    const R = f >> 16;
    const G = (f >> 8) & 0x00ff;
    const B = f & 0x0000ff;
    return `#${(0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1)}`;
  };
  const namedColors = () => {
    const p = mounted.cfg.palette;
    return { max: p.maximum, min: p.minimum, middle: p.center, negative: p.negative, bad: p.negative, positive: p.positive, good: p.positive, neutral: p.neutral };
  };
  const pbiColor = (value, shadePercent = 0) => {
    const byName = Object.prototype.hasOwnProperty.call(namedColors(), `${value}`) ? namedColors()[`${value}`] : undefined;
    return shadeColor(byName || (mounted.cfg.palette.colors[parseInt(`${value}`) || 0] ?? DEFAULT_COLOR), shadePercent);
  };
  // Formatting stand-ins (Power BI's formatter is not available offline). Same as the prototype.
  const pbiFormat = (v) => (v == null ? '' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v));
  const pbiFormatAutoUnit = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(2) + 'K' : String(v));

  vega.expressionFunction('pbiColor', pbiColor);
  vega.expressionFunction('pbiFormat', pbiFormat);
  vega.expressionFunction('pbiFormatAutoUnit', pbiFormatAutoUnit);
  vega.expressionFunction('pbiCrossFilterApply', (event, filterExpr, options) => crossFilterApply(event, filterExpr, options));
  vega.expressionFunction('pbiCrossFilterClear', () => crossFilterClear());

  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const harnessError = (message) => {
    mounted.harnessErrors.push(message);
    return new Error(message);
  };

  // A2, A3
  const isEventPresent = (event) => event && event instanceof Event;
  const isExpressionPresent = (expr) => !expr || typeof expr === 'string';
  // A5
  const isCrossFilterOptionValid = (options) =>
    !options ||
    (options && typeof options === 'object' && options.limit
      ? options.limit >= CROSS_FILTER_LIMITS.minDataPointsValue && options.limit <= CROSS_FILTER_LIMITS.maxDataPointsAdvancedValue
      : true);
  // A6
  const resolveOptions = (expr, options) => ({
    ...{ mode: expr ? 'advanced' : 'simple', filterExpr: expr, limit: DEFAULT_LIMIT, multiSelect: ['ctrl', 'shift'] },
    ...options,
  });
  // A4
  const resolvePlaceholders = (filterExpr, datum) =>
    filterExpr?.replace(/_{(.*?)}_/g, (_m, m1) => {
      const value = datum?.[m1];
      if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;
      if (value instanceof Date) return mounted.cfg.deneb === '2.0' ? `toDate('${value.toISOString()}')` : `toDate('${value}')`;
      if (mounted.cfg.deneb === '2.0') return `'${`${value}`.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
      return `'${datum?.[m1]}'`;
    });
  const isSimpleMode = (options) => !options || options.mode === 'simple';
  // C5
  const isMultiSelect = (event, options) =>
    isSimpleMode(options)
      ? !!(event.ctrlKey || event.shiftKey || event.metaKey)
      : (options?.multiSelect?.includes('ctrl') && event.ctrlKey && true) ||
        (options?.multiSelect?.includes('shift') && event.shiftKey && true) ||
        (options?.multiSelect?.includes('alt') && event.altKey && true) ||
        false;
  // D1
  const isValidRowIndex = (value, length) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
  const rowNumbersFromData = (data, datasetLength) => {
    const out = [];
    data.forEach((d) => {
      const rowIndex = d.__row__;
      const usable = datasetLength === undefined ? rowIndex !== undefined : isValidRowIndex(rowIndex, datasetLength);
      if (usable && out.indexOf(rowIndex) === -1) out.push(rowIndex);
    });
    return out;
  };
  // C2
  const resolveAdvanced = (event, dataset, options) => {
    try {
      const signals = event?.['dataflow']?._signals || {};
      const { filterExpr } = options;
      const datasetName = 'cross-filter';
      const headlessSpec = {
        signals: Object.keys(signals).map((key) => ({ name: key, value: signals[key] })),
        data: [{ name: datasetName, values: dataset.values, transform: filterExpr ? [{ type: 'filter', expr: filterExpr }] : [] }],
      };
      const filteredData = new vega.View(vega.parse(headlessSpec)).logLevel(vega.Warn).initialize(undefined).renderer('none').hover().run().data(datasetName);
      const rowNumbers = rowNumbersFromData(filteredData, mounted.cfg.deneb === '2.0' ? dataset.values.length : undefined);
      return { rowNumbers };
    } catch (e) {
      return { rowNumbers: [], warning: WARN.general(e.message) };
    }
  };
  // C3, C4
  const limitSize = (options) => ((options && options.limit) || null) ?? mounted.cfg.dataPointLimit;
  const potentialSize = (rowNumbers, event, options) => (rowNumbers?.length || 0) + (isMultiSelect(event, options) ? mounted.selection.size || 0 : 0);
  const isLimitExceeded = (rowNumbers, event, options) => potentialSize(rowNumbers, event, options) > limitSize(options) || false;
  // C1
  const resolveResult = (event, dataset, options) => {
    try {
      const multiSelect = isMultiSelect(event, options);
      if (isSimpleMode(options)) throw harnessError('not modelled yet: an apply call without a filter expression (simple resolution from the clicked item, T09)');
      const resolved = resolveAdvanced(event, dataset, options);
      if (resolved.warning) throw new Error(resolved.warning);
      if (isLimitExceeded(resolved.rowNumbers, event, options)) return { exceedsLimit: true, rowNumbers: resolved.rowNumbers, multiSelect };
      if (resolved.rowNumbers.length > 0) return { rowNumbers: resolved.rowNumbers, multiSelect };
    } catch (e) {
      return { rowNumbers: [], warning: WARN.general(e.message) };
    }
    return { rowNumbers: [] };
  };

  // H1: the host side of a cross-filter directive.
  const crossFilter = (directive) => {
    const { rowNumbers = [], multiSelect = false, exceedsLimit = false } = directive || {};
    if (exceedsLimit) {
      mounted.limitWarning = true;
      return;
    }
    if (rowNumbers.length === 0) {
      mounted.hostCalls.push({ type: 'clear' });
      mounted.limitWarning = false;
      setSelection([]);
      return;
    }
    mounted.hostCalls.push({ type: 'select', rows: rowNumbers.slice(), multiSelect });
    mounted.limitWarning = false;
    // The host's multi-select merge is not modelled until T09: the call is recorded, the selection stays.
    if (multiSelect) return;
    setSelection(rowNumbers);
  };

  // A1 to A7
  const crossFilterApply = (event, filterExpr, fOptions) => {
    const record = { expression: filterExpr, options: clone(fOptions), browserEvent: event instanceof Event, eventType: event?.type ?? null };
    mounted.applyCalls.push(record);
    const dataset = { values: mounted.rows };
    let result;
    try {
      if (!isEventPresent(event)) throw new Error(WARN.eventType);
      if (!isExpressionPresent(filterExpr)) throw new Error(WARN.missingFilter);
      const item = event['item'];
      const expr = resolvePlaceholders(filterExpr, item?.datum);
      record.resolvedExpression = expr;
      if (expr) vega.parseExpression(expr);
      if (!isCrossFilterOptionValid(fOptions)) throw new Error(WARN.options);
      const options = resolveOptions(expr, fOptions);
      result = resolveResult(event, dataset, options);
      if (result.warning) throw new Error(result.warning);
      crossFilter(result);
    } catch (e) {
      result = { warning: e.message, rowNumbers: [] };
    }
    record.result = clone(result);
    return result;
  };

  // createCrossFilterClearHandler: InteractivityManager.crossFilter() with no directive.
  const crossFilterClear = () => {
    crossFilter();
  };

  // ------------------------------------------------------------------ delivery and embedding
  const deliverDate = (text, mode) => {
    if (text == null) return text;
    if (mode === 'text') return text;
    const [y, mo, d] = String(text).split('-').map(Number);
    if (mode === 'epoch') return Date.UTC(y, mo - 1, d);
    return mode === 'utc' ? new Date(Date.UTC(y, mo - 1, d)) : new Date(y, mo - 1, d);
  };

  // Rows shaped the way Deneb delivers them: the fixture fields (the date field in the chosen
  // delivery shape), each measure's highlight companion when highlight values are given, then the
  // row identity and the selected flag.
  const deliver = () => {
    const { rows, dateField, dateDelivery, highlight } = mounted.cfg;
    const sel = mounted.selection;
    return rows.map((r, i) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) out[k] = k === dateField ? deliverDate(v, dateDelivery) : v;
      for (const [measure, values] of Object.entries(highlight || {})) out[`${measure}__highlight`] = values[i] ?? null;
      out.__row__ = i;
      out.__selected__ = sel.size === 0 ? 'neutral' : sel.has(i) ? 'on' : 'off';
      return out;
    });
  };

  // Vega's errors while rendering or handling events, for Calendar.errors() and a failed render.
  const makeLogger = () =>
    vega.logger(vega.Warn, undefined, (method, _level, input) => {
      if (method === 'error') mounted.errors.push([...input].map((x) => (x && x.message) || String(x)).join(' '));
    });

  const embed = async () => {
    if (mounted.view) {
      await mounted.view.runAsync();
      mounted.view.finalize();
    }
    mounted.container.innerHTML = '';
    mounted.rows = deliver();
    const spec = JSON.parse(JSON.stringify(mounted.cfg.spec));
    const dataset = (spec.data || []).find((d) => d.name === 'dataset');
    if (!dataset) throw harnessError("the spec has no data named 'dataset'");
    dataset.values = mounted.rows;
    try {
      mounted.view = new vega.View(vega.parse(spec), { renderer: 'svg', container: mounted.container, hover: true, logger: makeLogger() });
      await mounted.view.runAsync();
    } catch (e) {
      mounted.errors.push(e.message);
    }
  };

  const setSelection = (rows) => {
    mounted.selection = new Set(rows);
    const prev = mounted.pending || Promise.resolve();
    mounted.pending = prev.then(() => new Promise((r) => setTimeout(r, 0))).then(embed);
  };

  api.mount = async (cfg) => {
    if (mounted?.view) mounted.view.finalize();
    const container = document.getElementById('vis');
    container.style.width = `${cfg.width}px`;
    container.style.height = `${cfg.height}px`;
    mounted = {
      cfg, container, view: null, rows: [], selection: new Set(cfg.selected || []),
      hostCalls: [], applyCalls: [], errors: [], harnessErrors: [],
      pending: null, limitWarning: false,
    };
    await embed();
    return api.status();
  };

  api.settle = async () => {
    await new Promise((r) => setTimeout(r, 0));
    if (mounted.view) await mounted.view.runAsync();
    while (mounted.pending) {
      const p = mounted.pending;
      await p;
      if (mounted.pending === p) mounted.pending = null;
      if (mounted.view) await mounted.view.runAsync();
    }
    return api.status();
  };

  api.status = () => ({ errors: mounted.errors.slice(), harnessErrors: mounted.harnessErrors.slice() });
  api.hostCalls = () => clone(mounted.hostCalls);
  api.applyCalls = () => clone(mounted.applyCalls);
  api.selection = () => [...mounted.selection].sort((a, b) => a - b);
  api.limitWarning = () => mounted.limitWarning;
  api.timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  // The version the loaded Vega bundle reports about itself, so a check can prove which one a page runs.
  api.vegaVersion = () => vega.version;

  // ------------------------------------------------------------------ the scene, by date
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  const utcDate = (d) => d.toISOString().slice(0, 10);
  const utcTime = (d) => d.toISOString().slice(11, 23);

  const colorCtx = document.createElement('canvas').getContext('2d');
  const normColor = (c) => {
    if (c == null) return null;
    if (typeof c !== 'string') return String(c);
    colorCtx.fillStyle = '#000000';
    colorCtx.fillStyle = c;
    return colorCtx.fillStyle;
  };

  const walk = (mark, dx, dy, visit) => {
    for (const item of mark.items || []) {
      visit(mark, item, dx, dy);
      if (mark.marktype === 'group') {
        for (const child of item.items || []) walk(child, dx + (item.x || 0), dy + (item.y || 0), visit);
      }
    }
  };

  const geometry = (item, dx, dy) => {
    const b = item.bounds;
    const x = (item.x ?? b.x1) + dx;
    const y = (item.y ?? b.y1) + dy;
    const width = item.width ?? b.x2 - b.x1;
    const height = item.height ?? b.y2 - b.y1;
    return { x, y, width, height };
  };

  api.scene = () => {
    const adapter = mounted.cfg.adapter;
    const box = mounted.container.getBoundingClientRect();
    const [ox, oy] = mounted.view.origin();
    const days = new Map();
    const rings = [];
    const labels = [];
    const swatches = [];
    walk(mounted.view.scenegraph().root, box.left + ox, box.top + oy, (mark, item, dx, dy) => {
      if (mark.name === adapter.dayMark) {
        const d = item.datum?.[adapter.dayDateField];
        if (!(d instanceof Date)) return;
        const g = geometry(item, dx, dy);
        const hasIdentity = Object.prototype.hasOwnProperty.call(item.datum, '__row__');
        days.set(localDate(d), {
          date: localDate(d),
          ...g,
          fill: normColor(item.fill),
          opacity: item.opacity ?? 1,
          fillOpacity: item.fillOpacity ?? 1,
          stroke: normColor(item.stroke),
          strokeWidth: item.strokeWidth ?? 1,
          strokeOpacity: item.strokeOpacity ?? 1,
          cornerRadius: item.cornerRadius ?? 0,
          ring: false,
          tooltip: clone(item.tooltip) ?? null,
          row: hasIdentity ? item.datum.__row__ : undefined,
          hasIdentity,
        });
      } else if (mark.name === adapter.ringMark) {
        const d = item.datum?.[adapter.dayDateField];
        const drawn = (item.opacity ?? 1) > 0 && item.stroke != null && (item.strokeWidth ?? 1) > 0 && (item.strokeOpacity ?? 1) > 0;
        if (d instanceof Date && drawn) rings.push({ date: localDate(d), stroke: normColor(item.stroke), strokeWidth: item.strokeWidth ?? 1, cornerRadius: item.cornerRadius ?? 0, width: item.width ?? 0 });
      } else if (mark.name === adapter.swatchMark) {
        if ((item.opacity ?? 1) > 0) swatches.push({ ...geometry(item, dx, dy), fill: normColor(item.fill) });
      } else if (mark.marktype === 'text') {
        const text = Array.isArray(item.text) ? item.text.join('\n') : item.text;
        const visible = text != null && text !== '' && (item.opacity ?? 1) > 0 && (item.fillOpacity ?? 1) > 0;
        if (visible) labels.push({ text: String(text), x: (item.x ?? 0) + dx, y: (item.y ?? 0) + dy, fill: normColor(item.fill), fontSize: item.fontSize ?? null });
      }
    });
    for (const r of rings) {
      const day = days.get(r.date);
      if (day) Object.assign(day, { ring: true, ringStroke: r.stroke, ringWidth: r.strokeWidth, ringCornerRadius: r.cornerRadius, ringBoxWidth: r.width });
    }
    swatches.sort((a, b) => a.x - b.x);
    return { days: [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), labels, swatches };
  };

  // Page coordinates of the centre of a day, for gesture replay.
  api.pointOf = (date) => {
    const day = api.scene().days.find((d) => d.date === date);
    if (!day) return null;
    return { x: day.x + day.width / 2, y: day.y + day.height / 2 };
  };

  // A point inside the view but on no day: a corner of the view, 3px in.
  api.backgroundPoint = () => {
    const box = mounted.container.getBoundingClientRect();
    const days = api.scene().days;
    const hit = (x, y) => days.some((d) => x >= d.x - 2 && x <= d.x + d.width + 2 && y >= d.y - 2 && y <= d.y + d.height + 2);
    const candidates = [[box.left + 3, box.top + 3], [box.right - 3, box.top + 3], [box.left + 3, box.bottom - 3], [box.right - 3, box.bottom - 3]];
    const found = candidates.find(([x, y]) => !hit(x, y));
    return found ? { x: found[0], y: found[1] } : null;
  };

  // The colour drawn at a page point, as '#rrggbb' (or rgba() when translucent): the view rendered
  // to a canvas and read back, so it is what a viewer sees there, whichever marks drew it.
  api.pixelAt = async (x, y) => {
    const box = mounted.container.getBoundingClientRect();
    const canvas = await mounted.view.toCanvas(1);
    const [r, g, b, a] = canvas.getContext('2d').getImageData(Math.floor(x - box.left), Math.floor(y - box.top), 1, 1).data;
    if (a === 255) return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
  };

  // A point outside the view, to release a drag on.
  api.outsidePoint = () => {
    const box = mounted.container.getBoundingClientRect();
    return { x: box.right + 40, y: box.top + box.height / 2 };
  };

  // The rows as the spec receives them, with each date described so Node can compare shapes.
  api.deliveredRows = () =>
    mounted.rows.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        out[k] = v instanceof Date
          ? { type: 'Date', localDate: localDate(v), localTime: localTime(v), utcDate: utcDate(v), utcTime: utcTime(v) }
          : typeof v === 'string' && k === mounted.cfg.dateField ? { type: 'string', value: v } : v;
      }
      return out;
    });
})();
