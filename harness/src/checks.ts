// Checks the render command accepts on its command line, one string each. Each check asks what a
// viewer or the host would see, by date, never by signal or mark name.
//
//   fill <date> <#rrggbb>          the day for that date is drawn in that colour
//   label <text>                   a label with exactly that text is drawn
//   tooltip <date> <key>=<value>   the day's tooltip holds that value under that key
//   ring <date>                    the Peak day ring is drawn on that day
//   drag <from> <to> selects <n>   a left drag between the two days selects n rows (fresh render)
//   click <date> selects <n>       a left click on the day selects n rows (fresh render)
//   scan                           container size names appear only in the top-level width and height
import type { Calendar, RenderInput, Harness } from './index.ts';
import { containerScan } from './index.ts';

export interface CheckOutcome {
  check: string;
  pass: boolean;
  detail: string;
}

type Runner = (words: string[], ctx: { calendar: Calendar; harness: Harness; input: RenderInput }) => Promise<[boolean, string]>;

const selectedRows = async (cal: Calendar) =>
  (await cal.hostCalls()).flatMap((c) => (c.type === 'select' ? c.rows : []));

const RUNNERS: Record<string, { usage: string; run: Runner }> = {
  fill: {
    usage: 'fill <date> <#rrggbb>',
    run: async ([date, colour], { calendar }) => {
      const day = await calendar.day(date);
      const fill = day?.fill ?? 'no day drawn';
      return [fill.toLowerCase() === colour.toLowerCase(), `fill is ${fill}`];
    },
  },
  label: {
    usage: 'label <text>',
    run: async (words, { calendar }) => {
      const text = words.join(' ');
      const labels = (await calendar.labels()).map((l) => l.text);
      return [labels.includes(text), `labels drawn: ${labels.join(' | ')}`];
    },
  },
  tooltip: {
    usage: 'tooltip <date> <key>=<value>',
    run: async ([date, ...rest], { calendar }) => {
      const [key, ...value] = rest.join(' ').split('=');
      const tooltip = (await calendar.day(date))?.tooltip as Record<string, unknown> | undefined;
      return [tooltip != null && String(tooltip[key]) === value.join('='), `tooltip is ${JSON.stringify(tooltip)}`];
    },
  },
  ring: {
    usage: 'ring <date>',
    run: async ([date], { calendar }) => {
      const ringed = (await calendar.days()).filter((d) => d.ring).map((d) => d.date);
      return [ringed.includes(date), `ring drawn on: ${ringed.join(', ') || 'no day'}`];
    },
  },
  drag: {
    usage: 'drag <from> <to> selects <n>',
    run: async ([from, to, word, n], { harness, input }) => {
      if (word !== 'selects') throw new Error('expected: drag <from> <to> selects <n>');
      const fresh = await harness.render(input);
      await fresh.drag(from, to);
      const rows = await selectedRows(fresh);
      return [rows.length === Number(n), `selected ${rows.length} rows`];
    },
  },
  click: {
    usage: 'click <date> selects <n>',
    run: async ([date, word, n], { harness, input }) => {
      if (word !== 'selects') throw new Error('expected: click <date> selects <n>');
      const fresh = await harness.render(input);
      await fresh.click(date);
      const rows = await selectedRows(fresh);
      return [rows.length === Number(n), `selected ${rows.length} rows`];
    },
  },
  scan: {
    usage: 'scan',
    run: async (_words, { input }) => {
      const scan = containerScan(input.spec);
      return [scan.ok, scan.ok ? 'container names only in the top-level width and height' : scan.findings.map((f) => `${f.name} at ${f.path}`).join('; ')];
    },
  },
};

/**
 * Run the checks in order against a rendered Calendar. Checks that replay gestures render afresh,
 * so every check reads the Calendar's first state. The Calendar is read before any fresh render.
 */
export async function runChecks(checks: string[], ctx: { calendar: Calendar; harness: Harness; input: RenderInput }): Promise<CheckOutcome[]> {
  const readFirst = checks.filter((c) => !/^(drag|click) /.test(c));
  const replay = checks.filter((c) => /^(drag|click) /.test(c));
  const outcomes = new Map<string, CheckOutcome>();
  for (const check of [...readFirst, ...replay]) {
    const [kind, ...words] = check.trim().split(/\s+/);
    const runner = RUNNERS[kind];
    try {
      if (!runner) throw new Error(`unknown check; known: ${Object.values(RUNNERS).map((r) => r.usage).join(', ')}`);
      const [pass, detail] = await runner.run(words, ctx);
      outcomes.set(check, { check, pass, detail });
    } catch (e) {
      outcomes.set(check, { check, pass: false, detail: (e as Error).message });
    }
  }
  return checks.map((c) => outcomes.get(c)!);
}
