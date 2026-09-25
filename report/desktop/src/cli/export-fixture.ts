// Exports the sales Calendar's own query rows for FY26 as a harness fixture: the rows the Report
// delivers to the Calendar (date, the never-blank helper and sales), for the template seam.
//
//   npm run export-fixture              write harness/fixtures/report-sales-fy26.json
//   npm run export-fixture -- --check   export again and fail unless the rows equal the file's
//
// The query is the Calendar's own: `pbir visuals query` builds it from the Calendar's visual.json
// (its SUMMARIZECOLUMNS over the date column and the two measures, with the page's filters), and
// only the page's date filter is swapped for FY26. It runs against the engine of the Desktop
// instance holding the PBIP, through `pbir model -q`. pbir's JSON cannot carry a datetime, so the
// date comes back as yyyy-mm-dd text, the form harness fixtures keep. The Calendar's projections
// give each column its name, in the Calendar's order: the names the spec reads. Rows are in date
// order, which is row identity in the harness. The file holds no timestamp, so a second export of
// the same data is byte-identical; --check proves it. Any change on the page that the export does
// not understand (a second filter, a different field) fails rather than exporting something else.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PBIP, PROJECT, REPORT, dax, desktopInstances, pbir } from '../desktop.ts';

const { values } = parseArgs({ options: { check: { type: 'boolean' }, out: { type: 'string' } } });
const OUT = path.resolve(values.out ?? path.join(PROJECT, 'harness', 'fixtures', 'report-sales-fy26.json'));
const CALENDAR_VISUAL = path.join(REPORT, 'definition', 'pages', 'dailyOverview', 'visuals', 'calendar', 'visual.json');
const FY26_FILTER = `TREATAS ( { "FY26" }, 'DimDate'[FYear] )`;

interface Projection { field: { Column?: Ref; Measure?: Ref }; displayName?: string; nativeQueryRef: string }
interface Ref { Expression: { SourceRef: { Entity: string } }; Property: string }

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

/** The Calendar's fields, in its order: each one's table, column or measure, and the name the spec reads. */
function calendarFields(): { kind: 'column' | 'measure'; table: string; name: string; as: string }[] {
  const visual = JSON.parse(readFileSync(CALENDAR_VISUAL, 'utf8')) as { visual: { query: { queryState: { dataset: { projections: Projection[] } } } } };
  return visual.visual.query.queryState.dataset.projections.map((p) => {
    const ref = p.field.Column ?? p.field.Measure;
    if (!ref) fail(`the Calendar binds a field that is neither a column nor a measure: ${JSON.stringify(p.field)}`);
    return { kind: p.field.Column ? 'column' : 'measure', table: ref.Expression.SourceRef.Entity, name: ref.Property, as: p.displayName ?? p.nativeQueryRef };
  });
}

/** The Calendar's own DAX query, as pbir builds it from the visual, with its date filter set to FY26. */
function calendarQueryForFy26(fields: ReturnType<typeof calendarFields>): string {
  const r = pbir(['visuals', 'query', `${REPORT}/dailyOverview.Page/calendar.Visual`]);
  if (r.code !== 0) fail(`pbir visuals query exited ${r.code}: ${r.err.trim() || r.out.trim()}`);
  const query = r.out.trim();
  if (!/^DEFINE\b/.test(query)) fail(`pbir visuals query did not print a DEFINE query:\n${query}`);

  // The page's filters arrive as VAR __DS0FilterTable... = <table>, one per filter. Only a filter on
  // the date table is expected, and it is the one replaced; anything else stops the export.
  const filterVars = [...query.matchAll(/^(\s*VAR (__DS0FilterTable\d*) =)\s*([\s\S]*?)\r?\n\s*\r?\n/gm)];
  if (filterVars.length !== 1) fail(`expected exactly one page filter in the Calendar's query, found ${filterVars.length}:\n${query}`);
  const [whole, head, , expr] = filterVars[0];
  if (!/'DimDate'\[/.test(expr)) fail(`the Calendar's one filter is not on the date table: ${expr.trim()}`);
  let out = query.replace(whole, `${head} ${FY26_FILTER}\n\n`);

  // The core: SUMMARIZECOLUMNS over the date column with one "alias", 'Table'[Measure] per measure.
  const core = /VAR __DS0Core =\s*SUMMARIZECOLUMNS\(([\s\S]*?)\n\s*\)\s*\r?\n/.exec(out);
  if (!core) fail(`no __DS0Core SUMMARIZECOLUMNS in the Calendar's query:\n${out}`);
  const aliases = new Map([...core[1].matchAll(/"(\w+)",\s*'([^']+)'\[([^\]]+)\]/g)].map((m) => [`${m[2]}.${m[3]}`, m[1]]));
  const select = fields.map((f) => {
    if (f.kind === 'column') {
      if (f.table !== 'DimDate' || f.name !== 'Date') fail(`the Calendar's column is ${f.table}.${f.name}, not DimDate.Date`);
      return `"${f.as}", FORMAT ( 'DimDate'[Date], "yyyy-mm-dd" )`;
    }
    const alias = aliases.get(`${f.table}.${f.name}`);
    if (!alias) fail(`the Calendar's query has no column for ${f.table}.${f.name}`);
    return `"${f.as}", [${alias}]`;
  });

  // Every row of the core, not the first window of it: FY26 is 365 rows, well inside Deneb's row
  // window, and TOPN(1001) is pbir's generic paging, not the Calendar's.
  const evaluate = out.indexOf('\nEVALUATE');
  if (evaluate < 0) fail(`no EVALUATE in the Calendar's query:\n${out}`);
  out = `${out.slice(0, evaluate)}\nEVALUATE\nSELECTCOLUMNS (\n    __DS0Core,\n    ${select.join(',\n    ')}\n)\nORDER BY [${fields[0].as}]\n`;
  return out;
}

function exportRows(): { query: string; fields: string[]; rows: Record<string, string | number | null>[] } {
  const fields = calendarFields();
  const query = calendarQueryForFy26(fields);
  const raw = dax(query);
  const names = fields.map((f) => f.as);
  const rows = raw.map((r) => Object.fromEntries(names.map((n) => [n, (r[n] ?? null) as string | number | null])));
  return { query, fields: names, rows };
}

/** One row per line, so a diff of two exports reads by date. */
function serialise(e: ReturnType<typeof exportRows>): string {
  const head = {
    about: "The sales Calendar's own query rows for FY26, exported from the Report's model in Power BI Desktop by report/desktop (npm run export-fixture). Its fields and their order are the Calendar's; dates are yyyy-mm-dd text; a blank measure value is null. Harness fixture 'report-sales-fy26'. Do not edit: export again.",
    source: path.relative(PROJECT, CALENDAR_VISUAL).split(path.sep).join('/'),
    dateFilter: `${FY26_FILTER}, in place of the page's date filter`,
    query: e.query.split(/\r?\n/),
    fields: e.fields,
  };
  const lines = JSON.stringify(head, null, 2).split('\n');
  lines.pop();
  lines[lines.length - 1] += ',';
  lines.push('  "rows": [');
  e.rows.forEach((r, i) => lines.push(`    ${JSON.stringify(r)}${i < e.rows.length - 1 ? ',' : ''}`));
  lines.push('  ]', '}');
  return lines.join('\n') + '\n';
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

if (desktopInstances(PBIP).length !== 1) fail(`expected one Desktop instance holding ${PBIP}; open it first (npm run desktop -- open)`);
const exported = exportRows();
const text = serialise(exported);
const rowsHash = sha(JSON.stringify(exported.rows));
const blank = exported.rows.filter((r) => r[exported.fields[2]] === null).length;
console.log(`exported ${exported.rows.length} rows (${blank} with blank ${exported.fields[2]}), ${exported.rows[0]?.[exported.fields[0]]} to ${exported.rows.at(-1)?.[exported.fields[0]]}; rows sha256 ${rowsHash}`);

if (values.check) {
  if (!existsSync(OUT)) fail(`${OUT} does not exist; export it first`);
  const onDisk = JSON.parse(readFileSync(OUT, 'utf8')) as { rows: unknown[] };
  const diskHash = sha(JSON.stringify(onDisk.rows));
  if (diskHash !== rowsHash) fail(`a second export gives different rows: ${OUT} has sha256 ${diskHash}, this export ${rowsHash}`);
  if (readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') !== text) fail(`the rows agree, but the file differs from a fresh export (query or header); export again`);
  console.log(`pass a second export gives identical rows and an identical file: ${OUT}`);
} else {
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}`);
}
