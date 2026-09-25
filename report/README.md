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
| `tieout.json` | The DAX tie-out suite the loop runs. Later tickets add checks here |

## The model

- `DimDate`: the standard date table from the date-table skill, 1 Jul 2023 to 30 Jun 2026, fiscal
  year from July, marked as the date table.
- `Sales`: synthetic daily sales at the day by channel by region grain, a DAX calculated table
  generated from `DimDate` by a fixed formula. Blank days have no rows. The generation pattern, and
  why it never reads the date table's blank row, is in the project LEARNINGS
  (`Vault\Projects\Calendar Heatmap\LEARNINGS.md`).
- `Measure Table`: `Total Sales`, `Days in Filter` (a count of date rows, never blank for a date, so
  a Calendar that binds it receives every date as a row) and `Dates Selected` (the title text).

## The report seam loop

Open the PBIP first, one Desktop instance only, by its absolute path:

```powershell
Start-Process "B:\VS Code Files\PBI Projects\Calendar Heatmap\report\Daily Sales.pbip"
```

Then run the loop with Windows PowerShell 5.1, from any folder, naming where the screenshots go:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "B:\VS Code Files\PBI Projects\Calendar Heatmap\report\seam.ps1" -OutDir "<folder>"
```

It exits 0 only when every step passes:

1. Finds the one Desktop instance holding this PBIP.
2. Validates the Report by its absolute path, and fails unless the first output line reads
   `Validating Daily Sales` (an active pbir connection hijacks relative paths). A second, full
   validate (`--all`) must show no errors beyond one known false positive: pbir reads the text box
   dynamic value that Desktop itself writes as a Column bound to a measure.
3. Applies the on-disk model and report by clicking Desktop's **Apply external changes** banner,
   and confirming its overwrite dialog, when Desktop has noticed a change on disk.
4. Refreshes data inside Desktop (the Home ribbon Refresh, through UI Automation) twice, and fails
   unless both refreshes give the same data fingerprint.
5. Reloads the canvas.
6. Takes the all-pages screenshot into `-OutDir`. Open every PNG and look at it: a Calendar that
   draws an empty skeleton still passes every other step.
7. Runs every check in `tieout.json`.

`-SkipScreenshot` skips step 6 for a quick DAX-only rerun.

The loop never saves, and it leaves Desktop with unsaved changes after the data refresh. That is
safe for the next run, whose step 3 puts the disk copy over them. Do not save from Desktop while
on-disk edits are waiting to be applied: a Desktop save writes its own copy over them.

Two routes are deliberately not used. `pbir desktop refresh -m` refuses a model that defines a
culture, and Desktop writes `cultures/en-US.tmdl` on its first save. An external TMSL full refresh
hangs Desktop after an external model apply. Both are in the project LEARNINGS.

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
must match exactly unless the check sets `tolerance`. A check that counts rows should add `+ 0`,
because `COUNTROWS` of an empty table is blank, not 0.
