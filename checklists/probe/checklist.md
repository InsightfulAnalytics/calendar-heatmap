# Probe checklist (T02)

> **Retired on 2026-09-26, never run by a human.** Tim dropped the click-through checklists, and #2
> runs every step below through WebView2 remote debugging instead: `npm run probe` in
> `report/desktop` (see `report/README.md`, "Gestures in Desktop"). Its screenshots, under the names
> given here, and `probe.json` (every answer and check) are in `screenshots/`. The answers are
> recorded in `SPEC.md`. The steps and expected values below are kept as the probe's source.

Tim performs this in Power BI Desktop on the probe Report, `report/Daily Sales.pbip`, page
**Daily overview**. A fresh session then reviews the screenshots and closes T02. Written by T01.

- Save every screenshot to `checklists/probe/screenshots/` under the name given
  (`B:\VS Code Files\PBI Projects\Calendar Heatmap\checklists\probe\screenshots\`). A screenshot of
  the whole Desktop window is best: every visual and the Filters pane in one image.
- Where a step says **Record**, write the answer in the table at the end, or leave it for the
  review to read off the screenshot.
- Do not run `report/seam.ps1` or edit any project file while working through this. A seam run
  with `-OverwriteUnsaved` puts the disk copy over Desktop, and a Desktop save writes over any
  on-disk edit that has not been applied.
- Desktop marks the project as changed as soon as it opens, before you touch anything (seen in
  T01, and a save straight after an open wrote nothing), and an agent's seam run leaves its data
  refresh unsaved. So the unsaved flag is often on when you start, and Desktop asks to save on
  every close. Neither is your work. When Desktop asks to save on close, choose **Don't save**.
- Save from Desktop only at 0.1 (optional) and D2.
- The checklist ends with Selections cleared, the page filter as built (calendar 2025), and the
  deliberate save at D2, so Desktop is left open with no unsaved changes.

## The page and the numbers

Top: the title text box. Under it, across the page: the Calendar (Deneb). Bottom left: the
**Total sales** card over the **Days in filter** card. Bottom right: the **Daily rows** table
(Date, Total Sales, Days in Filter, sorted by date, with a Total row). The table shows dates as
`07-Jul-25`.

Every expected total below was computed in T01 twice: once with the Report's measures and once
with an independent DAX sum straight over the `Sales` rows. The two agreed in every case.

| Case | Table rows (= Days in filter) | Total sales | Title text |
|---|---|---|---|
| Calendar 2025, no Selection (baseline) | 365 | 1,181,520 | Selected Period: 2025 |
| 7 Jul to 20 Aug 2025 | 45 | 148,343 | Selected Period: 7 Jul - 20 Aug 2025 |
| 7 Jul 2025 only | 1 | 4,120 | Selected Period: 7 Jul 2025 |
| 17 Jul 2025 only (no sales) | 1 | (Blank) | Selected Period: 17 Jul 2025 |
| 14 Aug 2025 only | 1 | 4,382 | Selected Period: 14 Aug 2025 |
| 7 Jul to 20 Aug without 14 Aug | 44 | 143,961 | Selected Period: See Date Slicers |
| 4 to 10 Aug 2025 | 7 | 25,252 | Selected Period: 4 - 10 Aug 2025 |
| 7 Jul to 20 Aug without 4 to 10 Aug | 38 | 123,091 | Selected Period: See Date Slicers |

Days with no sales in 2025 (23): 4, 19 and 30 Jan; 14 Feb; 11 and 17 Mar; 11 and 26 Apr; 7 and
22 May; 16 and 22 Jun; **17 Jul, 1 Aug, 12 Aug** (the three inside the drag); 27 Aug; 21 and
27 Sep; 22 Oct; 6 and 17 Nov; 2 and 27 Dec. Each still has a table row, with Total Sales blank and
Days in Filter 1.

Weekdays of the days used below: 1 Jul Tue, 6 Jul Sun, 7 Jul Mon, 17 Jul Thu, 4 Aug Mon, 10 Aug
Sun, 14 Aug Thu, 20 Aug Wed, 21 Aug Thu. Hover a Calendar cell to see its date in the tooltip.

## 0. Before you start

**0.1** In a terminal, run:

```powershell
pbir desktop list
```

Expected: exactly one instance, holding `B:\VS Code Files\PBI Projects\Calendar Heatmap\report\Daily Sales.pbip`.
If Desktop is not open, open it with
`Start-Process "B:\VS Code Files\PBI Projects\Calendar Heatmap\report\Daily Sales.pbip"`, wait
for the page to draw, and run `pbir desktop list` again.

The instance may show unsaved changes (`hasUnsavedChanges` true). That is expected and is not your
work: Desktop turns the flag on as it opens, and an agent's seam run leaves its data refresh
unsaved. Closing and reopening does not clear it, because the flag comes back on as Desktop opens.

If Desktop shows an **Apply external changes** banner, stop here and do not save: an agent's
on-disk edit has not been applied, and a save would write over it. Ask for a seam run first.

Otherwise pick one:

- **Clear the flag (the usual choice).** Press **Ctrl+S** once in Desktop. Then in the terminal:

  ```powershell
  git -C "B:\VS Code Files\PBI Projects\Calendar Heatmap" status --short -- report
  pbir desktop list
  ```

  Expected: git lists nothing, and the instance shows no unsaved changes. If git lists files, the
  save wrote Desktop's own serialization of something an agent changed: leave them uncommitted for
  the review, **Record** them in the table at the end, and go on.
- **Start over without saving.** If the page does not look as built (for example a Selection is
  left over), close Desktop, choose **Don't save**, and open the PBIP again with the command above.
  The flag is on again after the reopen; leave it, since D2 saves once at the end.

Screenshot: `00-start.png` (the terminal after the commands above, with Desktop beside it if it
fits)

**0.2** Look at the page without clicking anything. Open the Filters pane.

Expected:
- Calendar: January to December 2025, weeks as columns, Monday to Sunday down the side, header
  "Sales by Order Date" with 1.18M. The no-sales days are pale gaps.
- Table: first row `01-Jan-25` 2,735 1; a `04-Jan-25` row with Total Sales blank and Days in
  Filter 1; Total row 1,181,520 and 365.
- Total sales 1,181,520. Days in filter 365.
- Title: `Selected Period: 2025`.
- Filters pane, Filters on this page: Year is 2025.

Screenshot: `01-baseline.png`

## A. Deneb's debug view, in your own time zone

**A1** Select the Calendar, open **More options (...)**, choose **Edit**. Deneb's editor opens with
the Calendar in a preview and a debug pane under it. Open the debug pane's data view for the
dataset (named `dataset`).

Expected field list (15 columns): `Date`, `Days in Filter`, `Sales`, `__row__`, `__selected__`,
and for each of `Days in Filter` and `Sales` the five companions `__highlight`,
`__highlightStatus`, `__highlightComparator`, `__format`, `__formatted` (for example
`Sales__highlight`). `Date` has no companions. `__selected__` reads `neutral` on every row.

**Record:** the dataset row count. Expected **365**. A count of **342** means the 23 no-sales days
were dropped: do step F before going on.

**Record:** that `Sales__highlight` is in the list (the sales measure's highlight companion).

If the editor shows Deneb's version anywhere (an About or Help entry), screenshot it as
`03-deneb-version.png` (optional; D3 reads the build from the file).

Screenshot: `02-debug-fields.png` (the field list and the row count both visible)

**A2** Find the `04-Jan-25` row (`__row__` 3 if the rows arrive in date order) and the 17 Jul
2025 row (`__row__` 197).

Expected: both present, `Sales` empty or null, `Days in Filter` 1.

Screenshot: `04-debug-blank-rows.png`

**A3** Find the 1 July 2025 row (`__row__` 181 if in date order). Its Sales is 4,045.

**Record:** the `Date` cell exactly as shown, what a hover over it shows, and its type as far as
the view tells you (a date, a number or text).

How to read it (your zone is AUS Eastern, UTC+10 on 1 July):

| If the value shows as | It means |
|---|---|
| 1751292000000, or 2025-06-30T14:00:00.000Z, or Tue Jul 01 2025 00:00:00 GMT+1000 | local midnight (the SPEC's working assumption) |
| 1751328000000, or 2025-07-01T00:00:00.000Z, or Tue Jul 01 2025 10:00:00 GMT+1000 | UTC midnight |
| text such as 2025-07-01T00:00:00 or 1/07/2025 | text |

Screenshot: `05-debug-1jul-own-zone.png`

**A4** Leave the editor (**Back to report**). The page is unchanged from 0.2.

Screenshot: `06-back-to-report.png`

## F. Fallback, only if A1 counted fewer than 365 rows

**F1** Select the Calendar. In Visualizations, Build, open the drop-down on the `Date` field and
tick **Show items with no data**. Reopen the editor (A1).

**Record:** the row count now, and whether the 4 Jan and 17 Jul rows appear.

Screenshot: `F1-show-items-no-data.png`

**F2** Untick **Show items with no data** again, and check the count is back to A1's. The Report
must be as built for the rest of the checklist.

Screenshot: `F2-show-items-no-data-off.png` (the editor's row count back to A1's)

## B. One reading west of UTC

**B1** Close Desktop. When it asks to save, choose **Don't save**.

Screenshot: `07-close-prompt.png` (the save prompt, before you choose **Don't save**)

**B2** Switch Windows to Pacific Time. In a terminal:

```powershell
tzutil /s "Pacific Standard Time"
tzutil /g
```

Expected: `Pacific Standard Time`. (Or Settings, Time & language, Date & time, Time zone
"(UTC-08:00) Pacific Time (US & Canada)". Automatic time zone is off on this machine.) On 1 July,
Pacific Time is on daylight time, UTC-7.

**Record:** the `tzutil /g` output.

Screenshot: `08-zone-west.png` (the terminal showing the `tzutil /g` output, or the Date & time
settings page showing the zone)

**B3** Open the PBIP again:

```powershell
Start-Process "B:\VS Code Files\PBI Projects\Calendar Heatmap\report\Daily Sales.pbip"
```

Expected: the table, both cards and the title exactly as in 0.2 (the model does not depend on the
zone). The Calendar should also look as in 0.2. **Record** if it does not: under UTC-midnight
delivery every day draws one day early here, so 1 Jan 2025 (a Wednesday) lands on Tuesday 31 Dec
2024.

Screenshot: `09-west-canvas.png`

**B4** Open the Calendar in Deneb's editor (A1) and find the 1 July 2025 row again.

**Record:** the `Date` cell, the hover, the type.

| If the value shows as | It means |
|---|---|
| 1751353200000, or 2025-07-01T07:00:00.000Z, or Tue Jul 01 2025 00:00:00 GMT-0700 | local midnight (expected: the raw value changed from A3) |
| 1751328000000, or 2025-07-01T00:00:00.000Z, or Mon Jun 30 2025 17:00:00 GMT-0700 | UTC midnight (the raw value did not change) |

Screenshot: `10-debug-1jul-west.png`

**B5** Back to report. Close Desktop, **Don't save**. Restore your zone:

```powershell
tzutil /s "AUS Eastern Standard Time"
tzutil /g
```

Expected: `AUS Eastern Standard Time`. Then open the PBIP again (B3's command). Expected: the page
as in 0.2.

**Record:** the `tzutil /g` output.

Screenshot: `11-zone-restored.png` (the terminal showing the `tzutil /g` output, with the reopened
page beside it if it fits)

## C. Clicks and drags on the Calendar

Every step starts from the state the one before it left.

**C1 Drag.** Press the left button on 7 Jul 2025 (Monday), drag to 20 Aug 2025 (Wednesday) and
release.

Expected:
- Table: first row `07-Jul-25` 4,120 1; last row `20-Aug-25` 4,196 1; rows for `17-Jul-25`,
  `01-Aug-25` and `12-Aug-25` with Total Sales blank and Days in Filter 1; no `06-Jul-25` and no
  `21-Aug-25`; Total row 148,343 and 45.
- Days in filter: 45.
- Total sales: 148,343 (independent DAX for 7 Jul to 20 Aug 2025: 148,343).
- Title: `Selected Period: 7 Jul - 20 Aug 2025`.
- Calendar: still draws all of 2025; the 45 days stay strong and the rest dim.

**Record:** whether the title changed to the text above (the title question).

Screenshots: `12-drag.png`, then scroll the table so 17 Jul to 1 Aug show: `13-drag-blank-rows.png`

**C2 Selected flags after the drag.** With the Selection held, open the Calendar in Deneb's editor
(A1).

Expected `__selected__`: `06-Jul` (`__row__` 186) off, `07-Jul` (187) on, `17-Jul` (197) on,
`20-Aug` (231) on, `21-Aug` (232) off. In all, 45 rows on and 320 off.

**Record:** the five values, and whether the preview shows the 45 days strong.

Screenshot: `14-debug-flags-drag.png` (use `14b-...` for a second page of rows)

**C3 Selected flags after a clear.** In the editor's preview, click the Calendar background: inside
its frame, off the day cells (the strip between the header and the grid). Read the same five rows.

Expected: `neutral` on all five, and on every row.

**Record:** the five values.

Screenshot: `15-debug-flags-cleared.png`

Back to report. Expected: the page as in 0.2. If the Selection is still applied there, click the
Calendar background on the canvas, then reopen the editor, read the five rows again and screenshot
that instead as `15-debug-flags-cleared.png`.

**C4 Click one day.** Click 7 Jul 2025 once, without dragging.

Expected: table one row `07-Jul-25` 4,120 1, Total row 4,120 and 1; Days in filter 1; Total sales
4,120; title `Selected Period: 7 Jul 2025`.

Screenshot: `16-click-7jul.png`

**C5 Click a day with no sales.** Click 17 Jul 2025 (Thursday).

Expected: table one row `17-Jul-25` with Total Sales blank and Days in Filter 1; Days in filter 1;
Total sales (Blank) (independent DAX: no `Sales` rows on 17 Jul 2025); title
`Selected Period: 17 Jul 2025`.

Screenshot: `17-click-17jul-no-sales.png`

**C6 Right click.** With 17 Jul still selected, right click 14 Aug 2025.

Expected: Power BI's context menu opens. Screenshot it while open: `18-right-click-menu.png`. Press
**Esc** without choosing anything. Then expected: nothing changed, every visual still as in C5.

Screenshot: `19-after-right-click.png`

**C7 Background click.** Click the Calendar background (inside its frame, off the cells).

Expected: the page as in 0.2: 365 rows, 1,181,520, Days in filter 365, `Selected Period: 2025`.

Screenshot: `20-background-click.png`

**C8 Shift-click on a selected day.** Drag 7 Jul to 20 Aug again (C1's values). Then hold
**Shift** and click 14 Aug 2025 (Thursday, a selected day with sales 4,382).

**Record** which of these happened:

| Outcome | Table and Days in filter | Total sales | Title |
|---|---|---|---|
| a. 14 Aug removed | 44 rows, no `14-Aug-25` | 143,961 | Selected Period: See Date Slicers |
| b. only 14 Aug left | 1 row `14-Aug-25` | 4,382 | Selected Period: 14 Aug 2025 |
| c. no change | 45 | 148,343 | Selected Period: 7 Jul - 20 Aug 2025 |
| d. Selection cleared | 365 | 1,181,520 | Selected Period: 2025 |
| e. something else | describe it | | |

Screenshot: `21-shift-click.png` (for outcome a, scroll the table so 13 to 15 Aug show)

**C9 Shift-drag over selected days.** Click the background, then drag 7 Jul to 20 Aug again. Hold
**Shift** and drag from 4 Aug 2025 (Monday) to 10 Aug 2025 (Sunday): one week column, all seven
days already selected.

**Record** which of these happened:

| Outcome | Table and Days in filter | Total sales | Title |
|---|---|---|---|
| a. the seven days removed | 38 rows, no `04-Aug-25` to `10-Aug-25` | 123,091 | Selected Period: See Date Slicers |
| b. replaced by 4 to 10 Aug | 7 rows, `04-Aug-25` 4,380 to `10-Aug-25` 1,959 | 25,252 | Selected Period: 4 - 10 Aug 2025 |
| c. no change | 45 | 148,343 | Selected Period: 7 Jul - 20 Aug 2025 |
| d. refused or cleared | describe it | | |

Screenshot: `22-shift-drag.png`

**C10 Clear.** Click the Calendar background. Expected: the page as in 0.2.

Screenshot: `23-cleared.png`

## D. Save, the build stamp and the container names

**D1** Check the restored state: no Selection on the Calendar, the Filters pane shows only
Year is 2025 on this page, and the page matches 0.2. Deneb's editor has been opened in this session
(C2, C3), which the container-name check needs.

Screenshot: `24-restored-state.png` (the page with the Filters pane open)

**D2** Save: **Ctrl+S**. This is the deliberate save the checklist ends on. It saves only what
Desktop already holds: the Selections are cleared and the page filter is as built.

Screenshot: `25-after-save.png` (the Desktop window straight after the save)

**D3** In a terminal:

```powershell
python "C:\Users\timos\.claude\skills\custom-visuals\skills\deneb-pbir\scripts\deneb_spec.py" audit "B:\VS Code Files\PBI Projects\Calendar Heatmap\report\Daily Sales.Report\definition\pages\dailyOverview\visuals\calendar\visual.json"
git -C "B:\VS Code Files\PBI Projects\Calendar Heatmap" status --short -- report
```

Expected from the audit:
- `developer.version: 2.0.0.0` (the Deneb build Desktop runs) and `vega.version: 6.4.0`.
- `legacy signals: total=2 pbiContainerWidth=1 pbiContainerHeight=1 pbiContainer=0`.
- `denebContainer references: 0`.

Expected from git: nothing listed, because T01's save already recorded Desktop's stamps. Leave
anything listed as it is, uncommitted, for the review.

**Record:** the build, and whether the legacy names survived.

Screenshot: `26-audit-after-save.png` (the terminal)

**D4** In the terminal: `pbir desktop list`. Expected: one instance on the PBIP, no unsaved
changes.

Screenshot: `27-final-state.png` (the page as in 0.2, with the terminal beside it if it fits)

Leave Desktop open.

## Answers (Tim fills in, or the review reads them off the screenshots)

| Step | Question | Answer |
|---|---|---|
| 0.1 | Unsaved flag at the start; which option you took; files git listed after the save (none expected) | |
| A1 | Calendar dataset rows with the helper bound (365 expected) | |
| A1 | `Sales__highlight` listed in the debug view | |
| A3 | 1 Jul 2025 in own zone: shown as, hover, type | |
| F1 | Rows with Show items with no data (only if A1 was short) | |
| B2 | Zone set west of UTC: `tzutil /g` output (Pacific Standard Time expected) | |
| B3 | Calendar drawn on the right weekdays in Pacific Time | |
| B4 | 1 Jul 2025 in Pacific Time: shown as, hover, type; changed from A3? | |
| B5 | Zone restored: `tzutil /g` output (AUS Eastern Standard Time expected); page as in 0.2 | |
| C1 | Drag gave 45 rows, blank days included, 148,343 | |
| C1 | Title followed the Selection | |
| C2 | Flags after the drag (6 Jul, 7 Jul, 17 Jul, 20 Aug, 21 Aug) | |
| C3 | Flags after the clear | |
| C4, C5 | Single-day clicks, including the no-sales day | |
| C6 | Right click: menu opened, nothing changed | |
| C7 | Background click restored every date | |
| C8 | Shift-click outcome (a to e) | |
| C9 | Shift-drag outcome (a to d) | |
| D3 | Deneb build; legacy container names survived the save | |
| D4 | No unsaved changes at the end | |
