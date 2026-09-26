# Daily Sales report

The working Report: a thick PBIP whose model lives beside it, with no external files, gateway or
credentials. Built by ticket T01 as the probe Report and the skeleton every later Report ticket
extends. [SPEC.md](../SPEC.md) holds the decisions.

| Path | What |
|---|---|
| `Daily Sales.pbip` | Open this in Power BI Desktop |
| `Daily Sales.SemanticModel/` | The model (TMDL, compatibility level 1702, auto date/time off) |
| `Daily Sales.Report/` | The Report (PBIR, BI Nexus theme), one page so far: Daily overview |
| `seam.ps1` | The report seam loop, below |
| `tieout.json` | The DAX tie-out suite the loop runs, with its fixed set of filters. Later tickets add checks here |
| `validate-model.ps1` | The model's offline TMDL round trip, run by the loop before Desktop applies anything |
| `desktop/` | The Desktop driver: replays gestures in Desktop through remote debugging, the #2 probe, the #5 card check, the #6 Calendar check and the fixture export. See "Gestures in Desktop" below |

## The model

- `DimDate`: the standard date table from the date-table skill, 1 Jul 2023 to 30 Jun 2026, fiscal
  year from July (`FYear` reads FY24 to FY26), marked as the date table.
- `Sales`: synthetic daily sales at the day by channel by region grain, a DAX calculated table
  generated from `DimDate` by a fixed formula. Blank days have no rows. The generation pattern, and
  why it never reads the date table's blank row, is in the project LEARNINGS
  (`Vault\Projects\Calendar Heatmap\LEARNINGS.md`). Its Channel and Region columns are hidden:
  filters go through the dimensions.
- `Channel` and `Region`: the dimensions, DAX calculated tables of their members sorted by a hidden
  order column, related many to one from `Sales`.
- `Measure Table`, every measure in the house DAX style:
  - `Total Sales`: the sum of the amounts.
  - `Mean per Day`: the total over every calendar day in the date filter, blank days counted as zero
    (FY26 divides by 365, FY24 by 366).
  - `Peak Day`: the date of the best day in the filter, the earliest on a tie.
  - `Active Days`: the days with sales in the filter, shown out of the days in the filter (`343 /
    365`) by a dynamic format string from the `Fmt.OutOf` function in `functions.tmdl`.
  - `Top Day Sales`: a day's total only when it is one of the five best days in the visual's filter,
    so a visual of the date and this measure shows exactly the Top days.
  - `Days in Filter`: the never-blank helper, a count of date rows. Every Calendar binds it beside its
    value measure, so it receives every date as a row, blank-sales days included, under any channel
    or region filter.
  - `Dates Selected`: the title text.

The DAX functions need compatibility level 1702. The DAX Studio TOM assembly on this machine
(19.84.1.0) predates them, so `validate-model.ps1` round-trips a copy of the definition without
`functions.tmdl` (the pbip:tmdl skill's documented workaround) and says so; Desktop loads and
queries the function, which the tie-out checks.

## The page

Daily overview holds the Calendar, the title, the `Daily rows` table, a month slicer, and five
native cards: Total sales, Days in filter, Mean per day, Peak day and Active days. The Calendar
filters the table, the title and every card; the table filters nothing. The page filter limits it
to FY26 (`DimDate[FYear]`, since #6) until the rail's fiscal year slicer arrives (#8).

The Calendar is the Template (`template/calendar-heatmap/`) over `Date` and `Sales`, embedded by
#6 with a July fiscal-year Window and 'every date has a row' on, because it binds the never-blank
`Days in Filter` helper. So it draws FY26 from 1 July 2025, and a day with no sales is an Empty day.
It keeps the visual name `calendar` and the legacy container signal names, which Deneb 1.9 needs.
To embed it again, write the Template with `npm run template` in `harness/` and embed that with the
deneb-pbir skill (the command is at the top of `harness/src/cli/template.ts`).

## The report seam loop

Open the PBIP first, one Desktop instance only, by its absolute path:

```powershell
Start-Process "B:\VS Code Files\PBI Projects\Calendar Heatmap\report\Daily Sales.pbip"
```

Then run the loop with Windows PowerShell 5.1, from any folder, naming where the screenshots go:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "B:\VS Code Files\PBI Projects\Calendar Heatmap\report\seam.ps1" -OutDir "<folder>" -OverwriteUnsaved
```

Pass `-OverwriteUnsaved` only after checking that nobody has canvas work open in that Desktop
instance (see "Unsaved changes in Desktop" below).

It exits 0 only when every step passes:

1. Finds the one Desktop instance holding this PBIP.
2. Validates the Report by its absolute path, and fails unless the first output line reads
   `Validating Daily Sales` (an active pbir connection hijacks relative paths). A second, full
   validate (`--all`) must show no errors beyond one known false positive: pbir reads the text box
   dynamic value that Desktop itself writes as a Column bound to a measure. Then the model's
   offline round trip (`validate-model.ps1`): the TMDL deserializes, and every measure, format
   string and dynamic format string written in it comes back (a measure body at the wrong depth
   parses but swallows its format string, and only this catches it).
3. Applies the on-disk model and report by clicking Desktop's **Apply external changes** banner,
   when Desktop has noticed a change on disk. If Desktop then asks **Overwrite your unsaved
   edits**, the loop confirms only with `-OverwriteUnsaved`.
4. Refreshes data inside Desktop (the Home ribbon Refresh, through UI Automation) twice, and fails
   unless both refreshes give the same data fingerprint.
5. Reloads the canvas.
6. Takes the all-pages screenshot into `-OutDir`. Open every PNG and look at it: a Calendar that
   draws an empty skeleton still passes every other step.
7. Runs every check in `tieout.json`, after the two refreshes.

`-SkipScreenshot` skips step 6 for a quick DAX-only rerun. `-ListChecks` prints every check's two
expressions, with the per-filter checks expanded, and exits without touching Desktop (no `-OutDir`
needed).

Every DAX query the loop runs (the compatibility level, the refresh-completion poll, the
fingerprint and the tie-out) goes through `pbir model "<absolute Report path>" -q --json`, which
queries the engine of the Desktop instance that has this Report open. `pbir model` has no `--pid`
flag (pbir 0.9.32); step 1 fails unless exactly one instance holds the PBIP, so the match is never
ambiguous. pbir's JSON output cannot serialize a datetime cell ("Object of type datetime is not
JSON serializable"), so the loop never returns one: each value comes back as flags, text and a
number. The loop opens no connection of its own. If `pbir model -q` ever cannot run a query, the
fallback is the ADOMD route in the `pbi-desktop:connect-pbid` skill (`scripts/query-dax.ps1`, with
the assembly found per its `references/assembly-discovery.md`), not a connection written into this
script.

Two routes are deliberately not used. `pbir desktop refresh -m` refuses a model that defines a
culture, and Desktop writes `cultures/en-US.tmdl` on its first save. An external TMSL full refresh
hangs Desktop after an external model apply. Both are in the project LEARNINGS.

### Unsaved changes in Desktop

Desktop marks this PBIP as changed as soon as it opens, before anyone touches it, and every seam
run leaves its data refresh unsaved. So when step 3 has something to apply, Desktop almost always
asks **Overwrite your unsaved edits**, and confirming it discards whatever the canvas holds.

- Without `-OverwriteUnsaved`, the loop cancels that dialog, changes nothing, prints why, and exits
  1. Desktop and the disk stay as they were.
- With it, the loop confirms the dialog and the disk copy replaces Desktop's.

Before passing it, check that nobody has canvas work open in that instance: an agent build with no
human edits, or a Desktop that has only been opened, is safe. If someone does have canvas work,
decide which copy wins first, and say which: saving from Desktop writes its copy over the on-disk
edits waiting to be applied, and `-OverwriteUnsaved` discards the canvas work.

The loop never saves. Do not save from Desktop while on-disk edits are waiting to be applied.

## Gestures in Desktop (remote debugging)

Desktop's report canvas is a WebView2 page, and a Deneb visual is an iframe inside it. Started with
a localhost debugging port, Desktop accepts a Chrome DevTools Protocol client, so a script can
press, move and release the real mouse over a Calendar's days and then read what every visual
shows. #2 proved it on Desktop 2.157.1354.0 (26.08) with Deneb 2.0.0.0: a drag, clicks, shift
gestures, a right click and a background click all replayed, and Deneb's editor opened and read.
**Later tickets replay every Desktop gesture this way.**

`desktop/` is a small Node package (Node 24 runs its TypeScript directly). Run from that folder:

```powershell
npm install                          # once: Playwright's library (no browser download) and TypeScript
npm run desktop -- open              # start Desktop on the PBIP with the debugging port 9339
npm run desktop -- open --plain      # start it without a port
npm run desktop -- save              # save through the title bar Save button
npm run desktop -- close             # close it, answering the save prompt with Don't save
npm run probe                        # the #2 probe, end to end (below)
npm run cards                        # the #5 card check (below)
npm run calendar                     # the #6 Calendar check (below)
npm run export-fixture               # the sales Calendar's FY26 rows as a harness fixture (below)
npm run export-fixture -- --check    # export again; fail unless identical to the committed fixture
npm test                             # offline checks, no Desktop needed
npm run typecheck
```

The recipe, which `src/desktop.ts` implements:

1. **Start Desktop with the port in its own environment only.** `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`
   is set to `--remote-debugging-port=9339` in the environment of the child process that launches
   `PBIDesktop.exe` with the `.pbip`, never for the user or the machine. The port listens on
   127.0.0.1 only. WebView2 reads the variable only when it starts its browser process, and Desktop
   instances share one, so `open` refuses while any Desktop is running. Without the port, nothing
   below works; close Desktop and open it with `open`.
2. **Connect** with Playwright's `chromium.connectOverCDP('http://127.0.0.1:9339')` and take the page
   whose URL ends `/minerva/reportView.html` (the other pages are the model, DAX query, TMDL and
   dialog views). `browser.close()` only disconnects: Desktop keeps running.
3. **Find a visual** by its accessible name: `.visualContainer` whose `aria-label` (spaces
   normalised) is a Deneb visual's alt text or a native visual's title. A Deneb visual's frame is
   the `iframe` inside it, named `visual-sandbox`.
4. **Read the Calendar.** Vega's SVG renderer binds each scene item to its element as `__data__`,
   so a day is the element whose item belongs to the adapter's day mark with the day's date in the
   adapter's date field (`harness/src/adapter.ts`, shared). The root item's `context.dataflow` is
   the Vega view, and `view.data('dataset')` is the dataset exactly as Deneb delivered it: Date
   objects, `__row__`, `__selected__` and every companion field. This needs the SVG renderer.
5. **Replay gestures** with Playwright's mouse at a day's on-screen centre (the element's bounding
   box, which Playwright maps through the iframe and the canvas's CSS scale). These are real,
   trusted input events (`Input.dispatchMouseEvent`), so Deneb accepts the apply call as a browser
   event. Shift and ctrl are held with the keyboard, and the mouse events carry them. A background
   click lands in the view's top-left padding.
6. **Read every other visual** from the canvas DOM: a card's value, a text box's text, and a
   table's rows (an ARIA grid whose `aria-rowcount` counts the header and Total rows; the body is
   virtualised, so it is scrolled through and read by `aria-rowindex`). An open context menu is a
   visible `pbi-menu[role=menu]`. `settle()` waits until all of it reads the same for three
   seconds, rather than sleeping a guessed time.
7. **Deneb's editor**: More options (`data-testid=visual-more-options-btn`), then
   `pbimenu-item.Edit`. The debug pane's tabs are `button[name=debugMode]` with values `source`
   (the dataset as received), `data`, `signal` and `log`; the Source table pages 50 rows at a time.
   `data-testid=back-to-report-button` leaves.
8. **Save and close** go through UI Automation (`src/uia.ps1`). The save prompt on close is an
   MSHTML page that UI Automation cannot see into, so it is answered through its DOM. See the
   project LEARNINGS.

DAX for the expected values goes through `pbir model -q` exactly as the seam loop does.

### The #2 probe

`npm run probe -- [--out <folder>]` answers every gating Desktop question on this Report without a
human, and writes its screenshots and `probe.json` (every answer and every check) to `--out`, by
default `checklists/probe/screenshots/`. It closes any Desktop on the PBIP (Don't save), opens it
with the port, and checks the baseline, the dataset and 1 July 2025 as received, the drag, the
clicks, the right click, the background click and three shift gestures, each against the table,
both cards, the title and the Calendar's own selected flags; then saves, audits the saved
`visual.json`, and leaves Desktop open without a port. It prints a pass or fail line per check and
exits 1 on any failure. Expected values come from literals, from date arithmetic in the probe, and
from independent DAX over the rows. The answers are recorded in the SPEC.

The probe was written for #2's page filter, calendar 2025, and still expects it: since #6 moved the
page to FY26 it has not been updated or run. Bring its expectations to the page filter before the
next ticket that needs it.

The probe reads dates in the machine's own time zone only. **Never change Windows' time zone** to
read another one (Tim, 2026-09-26): other zones are proved in the harness only. The probe checks at
the end that the zone is the one it started in, and `npm test` fails if any script here sets the
zone. #2's first probe run did switch Windows to Pacific Time after this was decided; see the
project LEARNINGS.

### The #5 card check

`npm run cards -- [--out <folder>]` connects through the debugging port (starting Desktop with it
when needed), then reads Total sales, Mean per day, Peak day, Active days and Days in filter off the
canvas: with no Selection, after a drag from 7 July to 20 August 2025 replayed on the Calendar, and
after a background click. Each reading must equal the value worked out from independent DAX over
the Sales rows and date arithmetic (148,343, 3,297, 15 Aug 2025 and 42 / 45 for the drag). With no
Selection it expects the page filter's values, FY26 since #6. It then checks on disk that the page
holds only its page filter, on `DimDate[FYear]`, and no visual has a filter of its own. Screenshots
and `cards.json` go to `--out`, by default `evidence/05-sales-model/`; #6's rerun is in
`evidence/06-template-skeleton/cards/`.

### The #6 Calendar check

`npm run calendar -- [--out <folder>]` connects the same way, clears any Selection with a
background click, and reads every drawn day off the Calendar's SVG: its date, its box and its fill.
It checks that the Calendar draws exactly the 365 FY26 days, 1 July 2025 in the first week column
and 30 June 2026 in the last, each day in its weekday's row (Monday at the top) and its week's
column, and that the 22 days with no sales, and only they, draw in the empty colour and keep their
own row. The expected days come from date arithmetic and independent DAX over the date table and
the Sales rows. The screenshot and `calendar.json` go to `--out`, by default
`evidence/06-template-skeleton/`.

### The Report-exported fixture

`npm run export-fixture` writes `harness/fixtures/report-sales-fy26.json`, the harness fixture
`report-sales-fy26`: the sales Calendar's own query (`pbir visuals query` on the Calendar, its
SUMMARIZECOLUMNS over the date and the two measures) with the page's date filter swapped for FY26,
run in Desktop through `pbir model -q`. Each column takes the name the Calendar gives it, in the
Calendar's order, dates as `yyyy-mm-dd` text and a blank as `null`: 365 rows, 22 with no sales.
The file has no timestamp, so `--check` exports again and fails unless the rows and the file are
identical. A second date filter, or a Calendar field the export does not expect, stops it rather
than exporting something else. Run it after a data refresh, and export again whenever the model's
sales change; the harness's fixture test pins the rows by fingerprint.

## Adding a tie-out check

Each check in `tieout.json` is two DAX scalar expressions that must agree:

```json
{
  "name": "total sales, calendar 2025 (the page filter)",
  "ticket": "T01",
  "report": "CALCULATE ( [Total Sales], 'DimDate'[Year] = 2025 )",
  "independent": "SUMX ( FILTER ( 'Sales', YEAR ( 'Sales'[Date] ) = 2025 ), 'Sales'[Amount] )"
}
```

`report` uses the Report's own measures under the test's filters. `independent` is a query straight
over the fact and date tables, or the expected constant. Either may be an array of lines. Numbers
must match exactly unless the check sets `tolerance`.

A blank on either side fails the check, even when both sides are blank: two blanks agree just as
well when the rows a check is about are missing. A check whose answer really is blank says so with
`"blankExpected": true`, and then passes only when both sides are blank:

```json
{
  "name": "17 Jul 2025 has no sales (the checklist's no-sales click)",
  "ticket": "T01",
  "report": "CALCULATE ( [Total Sales], 'DimDate'[Date] = DATE ( 2025, 7, 17 ) )",
  "independent": "SUMX ( FILTER ( 'Sales', 'Sales'[Date] = DATE ( 2025, 7, 17 ) ), 'Sales'[Amount] )",
  "blankExpected": true
}
```

So write an existence check as a non-blank condition against a constant
(`NOT ISBLANK ( ... )` against `TRUE ()`) or as a count, never as two values that could both be
blank. A check that counts rows should add `+ 0`, because `COUNTROWS` of an empty table is blank,
not 0.

### Checks under the fixed set of filters

`tieout.json` holds a fixed set of `filters`, each a name and the fragments a check needs:
`report` (the CALCULATE filter arguments for the Report's measures), `salesRows` (the same filter
as a condition on a `Sales` row, for the independent side), `from`, `to` and `days` (the calendar
day count, worked out by hand). The five are FY26, FY24, 7 Jul to 20 Aug 2025, FY26 with channel
Retail and FY26 with region EMEA. A check with `"each": "filters"` runs once per filter, and one
with `"each": ["FY26", "FY24"]` once per named filter; every `{{key}}` in its name and expressions
is replaced by that filter's value:

```json
{
  "name": "Mean per day, {{name}}: the total over {{days}} calendar days",
  "ticket": "T05",
  "each": "filters",
  "report": "CALCULATE ( [Mean per Day], {{report}} )",
  "independent": "DIVIDE ( SUMX ( FILTER ( 'Sales', {{salesRows}} ), 'Sales'[Amount] ), {{days}} )",
  "tolerance": 1e-9
}
```

A later fact table adds its own fragment to every filter (for example `targetRows`, the condition
on a target row) rather than a second filter set. A key a filter does not define, or a filter name
the suite does not hold, fails the loop before it touches Desktop; `-ListChecks` shows the expanded
suite. To test a measure the way a visual queries it (ALLSELECTED included), wrap
`SUMMARIZECOLUMNS` in `CALCULATE ( ..., {{report}} )`, as the Top days checks do.
