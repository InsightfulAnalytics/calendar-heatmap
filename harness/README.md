# Template seam harness

The template seam from `SPEC.md` ("Testing Decisions"): a Deneb calendar spec as a black box in
headless Microsoft Edge. It feeds the spec rows shaped the way Deneb delivers them, replays what a
viewer does with a mouse or a finger, judges every `pbiCrossFilterApply` call the way Deneb judges
it, and answers questions about the drawn scene by date. No Power BI is involved.

Every template check runs six times: under Vega 6.2 (Deneb 1.9) and Vega 6.4 (Deneb 2.0), each in
UTC, Pacific/Auckland and America/Los_Angeles. Each cell is proved to be what it claims: the page
reports its own time zone and its Vega bundle's version, and a date placeholder in an apply
expression resolves the way that cell's Deneb writes it (an ISO string under 2.0,
`Date.toString()` under 1.9).

## Commands

Run from this folder. Node 24 runs the TypeScript directly; the browser is the installed Edge.

```powershell
npm install          # once: TypeScript, Playwright's library (no browser download), Vega 6.2 and 6.4
npm test             # every check; one pass or fail line each; exits 1 on any failure
npm run typecheck    # tsc --noEmit
npm run render -- --spec prototype --fixture base-2025 --size 1080x362 --theme bi-nexus `
  --option titleText=Revenue --vega 6.2 --tz Pacific/Auckland `
  --check "fill 2025-12-19 #113d77" --check "drag 2025-07-07 2025-08-20 selects 42"
```

`render` writes `out/<spec>__<fixture>__<size>__vega<v>__<zone>.png` and `.scene.json` (the folder
is ignored by git), then prints a pass or fail line per `--check`. The check forms are listed at
the top of `src/checks.ts`: `fill`, `label`, `tooltip`, `ring`, `drag ... selects n`,
`click ... selects n` and `scan`. A single test file runs with
`node --test --test-reporter=./src/reporter.ts test/apply.test.ts`.

## What it models

| Piece | Where | Notes |
|---|---|---|
| Spec loading | `src/spec.ts` | Merges a config the way `prototype/prep.py` does; option overrides set top-level signal values. Deneb 1.9 gets `pbiContainerWidth`, `pbiContainerHeight` and `pbiContainer`; Deneb 2.0 gets its textual rewrite to `denebContainer` |
| Row delivery | `src/page/runtime.js` | Fixture fields, then `<measure>__highlight` when highlight values are given, then `__row__` and `__selected__` (`on`, `off`, or `neutral` when nothing is selected) |
| Date delivery | `dateDelivery` | `local` midnight (default, the working assumption), `utc` midnight, or `text`. Only the date field's shape changes |
| Apply evaluation | `src/page/runtime.js` | A mirror of Deneb's own source at tags 2.0.0.0 and 1.9.1.0, rule by rule, with the source lines in the comment block at the top of the file |
| Host | `src/page/runtime.js` | Records `select` and `clear`; a selection is fed back into the dataset and the spec is embedded again, as Deneb does on a data update |
| Theme | `src/theme.ts` | `pbiColor` with Deneb's shade maths over the theme's data colours and named colours. `pbiFormat` and `pbiFormatAutoUnit` are stand-ins |
| Spec adapter | `src/adapter.ts` | The one place that knows the day mark (`cell`), where a day's date lives (`date`) and the ring mark (`peakRing`) |

Not modelled yet: Deneb's simple selection mode and the host's multi-select merge (both arrive
with Selection, T09; a shift or ctrl select is recorded, but the selection is left as it was), and
the context menu and tooltip host calls (the scene reports each day's tooltip and row identity).

One Deneb rule worth knowing: `limit: 0` is not rejected. Deneb only range-checks a limit that is
truthy, and a zero limit falls back to the format pane's data point limit (50 by default), so a
drag over more than 50 rows is refused and a smaller one applies.

## The interface

```ts
import { openHarness } from './src/index.ts';

const harness = await openHarness();
const cal = await harness.render({
  spec: 'prototype',            // or a .json path relative to harness/, or { path, config }
  fixture: 'base-2025',         // or a Fixture object
  size: { width: 1080, height: 362 },
  theme: 'bi-nexus',
  options: { titleText: 'Revenue' },
  vega: '6.4', timeZone: 'Pacific/Auckland', dateDelivery: 'local',
  selected: [0, 1],             // rows the host already holds selected
  highlight: { Sales: [/* one value or null per row */] },
  dataPointLimit: 50,           // the format pane's data point limit
});
await cal.drag('2025-07-07', '2025-08-20');   // also click, rightClick, middleClick, tap,
                                               // backgroundClick, dragReleasedOutside; shift and ctrl
await cal.hostCalls();          // [{ type: 'select', rows, dates, multiSelect }] or [{ type: 'clear' }]
await cal.applyCalls();         // each call's expression, options and Deneb-style result
await cal.day('2025-12-19');    // fill, opacity, ring, position, size, tooltip, row identity
await cal.labels();             // every drawn label
await cal.vegaVersion();        // '6.2.0' or '6.4.0', as the page's Vega bundle reports itself
await harness.close();
```

A page holds one view, so a later `render` in the same Vega version and time zone replaces the
previous Calendar; reading the old one throws.

## Adding a check

Write it as a test in `test/`, inside `for (const { vega, timeZone, label } of CELLS)` (`CELLS`
from `src/index.ts`) so it runs in all six cells, and prefix its name with `label`. Open the
browser with `const harness = useHarness()` from `test/helpers.ts`, which also holds `rowsDated`
(a fixture's row identities in a date range, from its own date text) and `sorted`. Assert what a viewer
or the host would see, through the interface above, with expected values from an independent
source: a literal, a worked example or the SPEC. Never name a signal, mark or transform in a test;
if the harness cannot answer a question by date, extend the scene query in `src/page/runtime.js`
and keep mark names in `src/adapter.ts`.

Deliberately wrong specs live in `test/specs/`. `strip.json` is the valid baseline they vary.
`apply-date-placeholder.json` is a valid variant whose click applies a `_{date}_` placeholder, to
tell Deneb 1.9 from 2.0.

## Adding a fixture

Add a generator function to `src/fixtures.ts` and register it in `FIXTURES`. Use `seeded(n)` for
anything random and `datesOfYear(y)` for dates, and keep dates as `YYYY-MM-DD` text: delivery turns
them into what the spec receives, inside the page, in the page's time zone. Then add its name and
sha256 fingerprint to `FINGERPRINTS` in `test/fixtures.test.ts`, with a test of the properties it
promises. The fingerprint is a deliberate change detector: it is what proves the fixture is the
same on every run and machine, so update it only in a commit that means to change the fixture.
Row order is row identity: row `i` is delivered as `__row__ = i`.
