# Spec: Calendar Heatmap template and working report

Status: ready for agent. Tim confirmed both test seams on 2026-09-25 (see Testing Decisions). On
2026-09-26 he dropped the click-through checklists: agents build everything and verify it
themselves, and only the outward steps (the courtesy note, publishing, the library PR) stay his.
Written 2026-09-25 from the feasibility study and prototype session, then reviewed by three critics
for completeness, technical accuracy and spec craft.

## Problem Statement

Tim builds Power BI reports and publishes a free, MIT-licensed library of Deneb templates under his
own name. Power BI has no good way to show a year of daily values in one view. A matrix with
conditional formatting can fake a calendar, but it cannot draw a true weeks-by-weekdays grid, mark
the peak day, or act as a date-range slicer when you click or drag across it.

Lumeric Visuals is building a Calendar Heatmap custom visual that does this well: capsule-shaped
cells, a five-step sequential ramp, empty days that read as "no data" rather than zero, a ringed
peak day, and "every cell is a slicer". It is still in development, and it ships as a separate
custom visual with its own formatting model. Their website also shows a "Daily Sales · FY26" report
built around three copies of the visual, with KPI cards, a monthly column chart and a Top days list,
all driven by one dataset. This spec calls that report **the mock**. The feasibility study in this
project describes the mock element by element, and local captures of the site sit beside it.

Tim wants the same capability as a Deneb template, so it lives in any report that already allows
Deneb, follows the report theme, and can join his template library. He also wants it proved in a
real, working report where clicking or dragging on a calendar actually filters the rest of the
page, not a static lookalike.

## Solution

Two deliverables, built together in this project:

1. **A Vega calendar heatmap template for Deneb.** A window of days (a calendar year, a fiscal year
   or a rolling 52 weeks) drawn as week columns by weekday rows, in capsule or square cells,
   coloured in steps of the report theme's first colour. Empty days are drawn but never read as
   zero. The peak day is ringed. A left click selects one day, a left drag selects a date range,
   and a click on the background clears the selection. The calendar dims to match when other
   visuals highlight it. Report page tooltips and drill-through work from any day. Options such as
   cell shape, density, number of steps, week start, window and the optional header, KPI strip and
   month totals are named settings at the top of the spec.

2. **A working report, as a separate PBIP, in the BI Nexus theme.** A "Daily Sales" report laid out
   after the mock but styled in BI Nexus colours and fonts. It has three pages (Daily overview, By
   region, Targets), a left rail with a page navigator, a date range and filters, four KPI cards,
   three calendars (sales, support tickets, web sessions), Sales by month and a Top days list.
   Everything reads one shared semantic model with a proper date table, so every slicer and every
   calendar selection genuinely filters the page.

When both are done, the template is packaged to the conventions of Tim's public Deneb template
library, ready to contribute once a courtesy note has gone to Lumeric Visuals.

## User Stories

### Report viewer: reading a calendar

1. As a report viewer, I want to see a full year of daily values in one visual, so that I can read
   the shape of the year without scrolling, paging or small multiples.
2. As a report viewer, I want weeks as columns and weekdays as rows, so that weekly rhythm (busy
   weekdays, quiet weekends) shows up as horizontal bands.
3. As a report viewer, I want each day coloured in one of a few ordered steps from light to dark, so
   that I can compare days at a glance.
4. As a report viewer, I want days with no data to look clearly different from low days, so that I
   never mistake a missing day for a zero.
5. As a report viewer, I want the highest day of the window marked with a ring, so that I can find
   the peak without hunting.
6. As a report viewer, I want month labels above the grid, so that I know where I am in the year.
7. As a report viewer, I want weekday labels beside the grid, so that I can tell which row is Monday
   and which is the weekend.
8. As a report viewer, I want a "Less to More" legend, so that I know which end of the ramp is high.
9. As a report viewer, I want an optional header with a title, a "by <date field>" subtitle and the
   window's total, so that each calendar explains itself.
10. As a report viewer, I want a tooltip on any day showing the date and its value in the model's
    format, so that I can read exact numbers.
11. As a report viewer, I want a report page tooltip on a day when the author has set one, so that I
    can see a richer summary for that day.
12. As a report viewer, I want the tooltip on an empty day to say it has no data, so that the gap is
    explained rather than silent.
13. As a report viewer, I want the calendar to stay legible from a 200-pixel visual up to a full
    page, so that it works on dashboards and detail pages alike.
14. As a report viewer, I want cells never to be stretched out of shape to fill a box, so that the
    grid always reads as a calendar.
15. As a report viewer, I want every week of the window drawn even when the visual is narrow, so
    that a fiscal year never silently loses its first weeks.
16. As a report viewer, I want a window with only one week of data, or with gaps, to still draw
    correctly, so that edge cases do not break the visual.
17. As a report viewer, I want leap years to show 366 days in the right places, so that dates never
    drift.
18. As a report viewer, I want every day to land on the correct weekday wherever I am in the world,
    so that a time-zone offset never shifts the calendar by a day.
19. As a report viewer, I want the slots before the window starts and after it ends left blank, so
    that I never read them as empty days.

### Report viewer: selecting with a calendar

20. As a report viewer, I want to click a day to filter the rest of the page to that day, so that
    the calendar works as a slicer.
21. As a report viewer, I want to drag across a run of days to filter to that date range, so that I
    can select a week, a month or any span in one gesture.
22. As a report viewer, I want the days outside my drag to dim while I drag, so that I can see what
    I am about to select.
23. As a report viewer, I want the days outside my selection to stay dimmed after the filter
    applies, so that I can see what is selected.
24. As a report viewer, I want shift-click to add a day to my selection, or take it out again if it
    is already selected, so that I can compare non-adjacent days.
25. As a report viewer, I want a click on the calendar background to clear my selection, so that I
    can get back to the whole window quickly.
26. As a report viewer, I want a right click to open the context menu without changing my
    selection, so that drill-through and other menu actions do not also filter the page.
27. As a report viewer, I want to drill through from a day to a detail page, so that I can
    investigate one day.
28. As a report viewer, I want an optional readout that states my selection as a date range and a
    day count, so that the current selection is stated in words.
29. As a report viewer, I want a drag that ends outside the visual not to leave the calendar stuck
    mid-drag, so that my next click behaves normally.
30. As a report viewer, I want the calendar to dim the days that another visual's highlight leaves
    out, and to show days that a filter removed as filtered out, so that filtering works in both
    directions.
31. As a report viewer, I want a selection on one calendar to highlight, not empty, the other
    calendars on the page, so that I can still see the rest of their year.
32. As a report viewer in small multiples, I want a drag inside one panel to select that date range
    for that panel's group only, so that I can pick one region's run of days.
33. As a report viewer on a touch device, I want a tap to select a day, so that the calendar is
    still usable without a mouse, even though dragging a range needs one.
34. As a report viewer, I want a warning rather than a silent partial selection when my drag covers
    more rows than the visual can select, so that I know the filter did not apply.

### Report viewer: the working report

35. As a report viewer, I want a Daily overview page with four KPI cards, the main sales calendar,
    two more calendars, Sales by month and a Top days list, so that I can see the year and its
    highlights on one page.
36. As a report viewer, I want a Total card with a small area sparkline of weekly totals, so that I
    see the total and its trend.
37. As a report viewer, I want a Mean per day card, the total divided by every calendar day in the
    current date filter with blank days counted as zero, shown with a small bullet against the mean
    daily target, so that I see the typical day against the goal.
38. As a report viewer, I want a Peak day card showing the date of the best day, with a bar showing
    how the days split across the colour steps, so that I know when the peak happened and how rare
    such days are.
39. As a report viewer, I want an Active days card showing the days with sales out of the calendar
    days in the current date filter, with a small column per month, so that I can see coverage.
40. As a report viewer, I want a Support tickets calendar in square cells, so that I can compare a
    second measure with the same visual in a different style.
41. As a report viewer, I want a Web sessions calendar at high density, so that I can see a measure
    whose weekends peak, the opposite silhouette to sales.
42. As a report viewer, I want a Sales by month column chart in fiscal order, July to June, so that
    I can read the monthly trend the way the business reports it.
43. As a report viewer, I want a Top days list of the five best days with bars, so that I can see
    the standout days.
44. As a report viewer, I want the KPI cards, Top days and the report title to follow whatever I
    click or drag on any calendar, and Sales by month to highlight the selected share, so that the
    page answers "what happened in this range?".
45. As a report viewer, I want a left rail with the page list, a date range control and filters for
    fiscal year and channel, so that navigation and filtering live in one place.
46. As a report viewer, I want the fiscal year filter to redraw every calendar for that fiscal year
    (July to June, so FY26 runs 1 July 2025 to 30 June 2026), so that the calendars match how the
    business reports its year.
47. As a report viewer, I want a region filter in the top bar, so that I can narrow the whole page
    to one region.
48. As a report viewer, I want my rail and region choices to hold when I change page, so that I do
    not have to set them again.
49. As a report viewer, I want the report title to state the fiscal year and date range in force,
    so that a screenshot of the page explains itself.
50. As a report viewer, I want a By region page with one calendar per region on a single shared
    colour scale, so that regions compare fairly.
51. As a report viewer, I want a Targets page where each day is coloured by whether it beat its
    target, so that I can see hit and miss days across the year.
52. As a report viewer, I want the page navigator to list only this report's three pages, so that I
    am not sent to hidden or unrelated pages.
53. As a report viewer, I want the report to open and work with no external files, gateways or
    credentials, so that anyone can open the PBIP or a published copy.

### Report author: using the template

54. As a report author, I want to import the template into Deneb and map just a date field and a
    value field, so that I get a working calendar in minutes.
55. As a report author, I want the README's first setup step to tell me which Deneb settings to
    switch on (advanced selection mode, cross-highlight, tooltips, context menu), so that dragging
    and highlighting work first time.
56. As a report author, I want to switch on target colouring, day markers, extra tooltip fields and
    small multiples by adding a column and naming it in a setting, so that the extras stay optional.
57. As a report author, I want the colours to come from my report theme by default, so that the
    calendar matches the rest of my report without editing hex codes.
58. As a report author, I want to override the ramp with my own colours, so that I can match a
    brand or use a colour-blind-safe palette.
59. As a report author, I want to choose from three to nine steps, or a continuous ramp, so that I
    can trade precision against readability.
60. As a report author, I want to choose the cell shape from capsule to square and a density
    preset, so that I can tune the look for loose reading or tight comparison.
61. As a report author, I want to choose the first day of the week, so that the grid matches local
    convention.
62. As a report author, I want to choose a calendar year, a fiscal year with any start month, or a
    rolling 52 weeks as the window, so that the grid matches how my business counts time.
63. As a report author, I want to switch the header, month labels, weekday labels, legend, peak
    ring and empty days on or off, so that the calendar fits small and large visuals.
64. As a report author, I want an optional KPI strip (total, mean per day, peak day, best month,
    days over target) inside the visual, so that a single visual can carry a whole summary.
65. As a report author, I want an optional month totals strip under the grid, so that monthly
    trend sits with the daily detail.
66. As a report author, I want an optional small multiples mode split by a field, on one shared
    colour scale, so that I can compare regions or products fairly.
67. As a report author, I want a target mode that colours days by whether they beat a target field
    or a share of the mean per day, so that the calendar can show performance, not only volume.
68. As a report author, I want optional day markers from a text field, so that holidays or
    promotions show on the grid.
69. As a report author, I want optional value labels inside cells, shown only when a cell is large
    enough to hold one, so that large calendars can show exact numbers without a tooltip.
70. As a report author, I want all options gathered as named settings at the top of the spec and
    documented in the template's README, so that I can change behaviour without reading the whole
    spec.
71. As a report author, I want the template to work on Deneb 1.9 and 2.0, so that it opens in older
    and newer reports alike.
72. As a report author, I want the calendar to cope with up to ten years of daily data, so that long
    histories do not hit the row limit or slow the report down.
73. As a report author, I want the calendar to print and export to PDF and PowerPoint cleanly, so
    that exports look like the report.
74. As a report author on a Mac or mobile device, I want a sensible fallback font, so that the
    calendar still reads well where Segoe UI is missing.

### Template library maintainer (Tim)

75. As the library maintainer, I want the template packaged like every other template in the Deneb
    library (a version 1 template with author metadata and an embedded thumbnail, under the
    library's size cap; small sample data; an offline render size; a preview captured from its own
    page in the library's showcase report; a README with fields, options and credits; and rows in
    the library README's gallery and credits), so that it drops into the library and into
    Background Designer, the report design tool that harvests the library's templates.
76. As the library maintainer, I want the credit to read "after Lumeric Visuals" in every place the
    library puts credits, with no Lumeric branding, logo, copy or palette in the template or the
    report, so that the work is honest about its inspiration and is not a copy of their product.
77. As the library maintainer, I want the agent to draft a courtesy note to Lumeric Visuals, which I
    send myself, so that they hear about it from me before anything is published.
78. As the library maintainer, I want the template to pass the library's offline checks and render
    its preview in the BI Nexus theme, so that it meets the same bar as the other templates.
79. As the library maintainer, I want the template and the working report developed in their own
    private repository, with the Lumeric captures kept on my machine and never committed, so that
    work in progress stays private and nothing of Lumeric's is redistributed.

### Agent building the work

80. As a coding agent, I want a headless test harness that renders the spec with the Deneb
    functions stubbed, replays mouse gestures and evaluates selections the way Deneb does, so that I
    can prove rendering and selection behaviour without Power BI.
81. As a coding agent, I want test fixtures that exercise blanks, weekends, a December peak, a leap
    year, several regions, ten years and a one-week window, so that tests hit the edge cases.
82. As a coding agent, I want the report's KPI values to tie out against independent DAX queries for
    the same filters, so that I can prove the numbers are right.
83. As a coding agent, I want page screenshots from Power BI Desktop after every batch of report
    edits, so that I can check layout and colour against the intended design.

## Implementation Decisions

### Deliverables and where they live

- This project is its own private repository in Tim's Power BI projects folder. It holds the spec,
  the prototype, the template under development, the working report (PBIP) and the feasibility
  study. Captures of the Lumeric site sit beside them for reference but are never committed, even
  here.
- The template is developed here first, then contributed to Tim's public Deneb template library
  (the MIT-licensed InsightfulAnalytics/Deneb repository on GitHub) in a new "calendar" category.
  That library's main branch takes changes only through pull requests, and the contribution PR is
  opened only after Tim confirms the courtesy note has gone to Lumeric Visuals.
- The library contribution also: adds the calendar category to the showcase's category order; adds
  a showcase part with the default calendar plus variants (square cells, dense, a small visual);
  updates the library README's gallery and its template count from twelve to thirteen; updates the
  Background Designer harvest counts and classifies the template's shape as a heatmap. The library's
  showcase generator turns selection and highlight off and forces Arial, so the library preview
  shows the static look only. Interactivity is proved in this project's working report.
- **Credits** follow the library's five places. The template's author field reads exactly
  "Timothy Osborn, after Lumeric Visuals". The last sentence of its description reads "Design after
  Lumeric Visuals (lumericvisuals.com)." Its README Credit section says it is an independent Deneb
  reimplementation with its own spec and invented data, and lists what differs from the original:
  theme colours, fonts, date-aligned month labels, equal-interval steps and the inset peak ring. The
  library README's gallery caption ends "After Lumeric Visuals." and its Credits table gains a row.
  The working report carries a small footer credit, "Layout after Lumeric Visuals". Lumeric's site
  terms are read before anything is published. The courtesy note, like the earlier Tabular Editor
  one, is open about how the template was made and offers to change the wording or take it down.

### The template

- **Grammar: Vega, not Vega-Lite.** Dragging to select a date range and sending it as one selection
  needs Deneb's advanced selection mode, which only Vega specs can use.
- **Fields.** The template declares exactly two placeholders: a date and a value. Deneb's import
  enables Create only when every placeholder is assigned, and the library checker requires every
  declared placeholder to be used, so optional inputs are not placeholders. The author adds an
  optional column (a target, a marker, extra tooltip fields, a split field) to the Values well and
  names it in a top-level setting such as the target field name. An empty setting switches the
  feature off. The template expects one row per day, or per day and split value. If several rows
  share a day, their values are summed. The spec works out the week column and weekday row from the
  date field. Nothing is precomputed in the data. Fields are read with bracket access, because a
  mapped field name can contain spaces and the library checker rejects dot access to a placeholder.
- **Options.** Every option is a named top-level setting with a documented default. Defaults:
  capsule cells, regular density, five steps from theme shades, Monday week start, calendar-year
  window; header, month labels, weekday labels, legend, peak ring and empty days on; selection
  readout, KPI strip, month totals, target mode, markers, split and value labels off. Density is the
  gap between cells, chosen from three named presets (spacious, regular, dense) or given in pixels.
  The preset sizes are settled in the offline render at a 200-pixel visual and at full page.
- **Window.** The window is the set of days a calendar draws. In calendar-year and fiscal-year modes
  it is every whole year (calendar, or fiscal from the chosen start month) that contains a date in
  the dataset, one band per year, stacked oldest first. In rolling mode it is the 52 whole weeks
  ending with the week that holds the latest date in the dataset. The peak day, the top of the step
  scale and the header total are all taken over the whole window. Slots in the first and last week
  columns that fall outside the window are left blank by default. An option draws them as faint
  outlines, never in the empty colour, and they can never be selected. As built in #6: the
  settings `windowMode` (`calendar`, the default, or `fiscal`) and `fiscalStartMonth` (1 to 12,
  default 7) choose the year, and until #7 stacks one band per year the Window is the one year that
  holds the latest date in the dataset. Its days are generated by stepping calendar dates from the
  first of the start month to the day before the same date a year later, so a leap year has 366.
  Month labels mark every other month counting from the Window's first month.
- **Every day is drawn.** The spec generates every date in the window and looks up the dataset row
  for each. An empty day is a day in the window whose value is blank. It draws in the empty colour,
  never in the lowest step. What a day with no row means depends on a named option, "every date has
  a row". With it off (the default, for a report that binds only a date and a measure), a day with
  no row is also an empty day, and it has no row identity, so it gets no page tooltip, drill-through
  or selection. With it on, the report guarantees a row for every date, so a day with no row was
  removed by an inbound filter and draws as filtered out. The working report turns the option on:
  each calendar binds the date table's date column as a plain column (not the auto date/time
  hierarchy) plus a helper measure that is never blank for any date, such as a count of date table
  rows. Power BI drops a row when every measure on it is blank, so the helper is what brings empty
  days in with their own row identity. Confirmed in Desktop by #2: with the helper bound, the
  Calendar's dataset holds one row per day in the filter (365 for calendar 2025, the count an
  independent DAX query gives), and the 23 no-sales days are among them with the sales value blank
  and the helper 1 (read from the Calendar's Vega view, and from Deneb's debug view, through remote
  debugging). "Show items with no data" was not needed, so it stays the untested alternative. The
  README documents the helper pattern and the fallback.
- **The Filtered-out day look (#6).** A Filtered-out day draws hollow: the cell's own size and
  shape with no fill and a 1-pixel outline in a mid grey (`#cbd5e1`, a named setting), never in the
  empty colour or a Ramp step. Why: a solid cell always means a known value, an Empty day included,
  so a hollow one says "in the Window, but the current filter took it out" and cannot be read as a
  zero or as no data. An outline draws the same under the SVG and canvas renderers and at the dense
  preset, where a hatch pattern would not (Deneb's pattern fill is SVG only, and a hatch blurs in a
  10-pixel cell). It needs no theme colour beyond the fixed greys, so it never competes with the
  Ramp. Slots outside the Window stay blank, so at the defaults nothing else is hollow; #7's
  outline option for those slots must stay distinguishable from it.
- **Colour.** The default ramp is shades of theme colour 1, from light to dark, so it follows any
  report theme. For five steps the shades are 0.8, 0.55, 0.25, -0.1 and -0.45. For any other step
  count, the shades are spaced evenly between the two ends, so the lightest and darkest steps never
  move. A custom colour list is used as given when its length matches the step count, and otherwise
  resampled keeping its first and last colours. Continuous mode interpolates between the same two
  ends. Steps are equal intervals from zero to the window's maximum. Values at or below zero fall in
  the lowest step: the template is for non-negative measures, and the README says so. Text and
  neutral greys are fixed values, because Deneb does not expose theme text colours. Tried and
  rejected: interpolating the theme's minimum to maximum colours, which turned lavender in BI Nexus
  and in other themes need not run light to dark at all. The prototype's ramp, in BI Nexus:

  ```
  palette = [pbiColor(0, 0.8), pbiColor(0, 0.55), pbiColor(0, 0.25), pbiColor(0, -0.1), pbiColor(0, -0.45)]
  BI Nexus result: #d2e2f7  #9abeee  #5693e3  #1b64c3  #113d77   (empty day #f1f5f9)
  ```

- **Geometry.** Every week of the window is always drawn. Lumeric drops the oldest weeks when the
  box is narrow; that is not copied, because a fiscal year that silently loses July reads wrongly.
  Cell width is the largest that fits the grid area both across (all week columns) and down (seven
  rows), whichever is tighter. Cell height then fills the seven rows but is capped at a named aspect
  (1.72 times the width in the prototype), so cells are never stretched. The grid stays
  left-aligned and leftover space falls to the right or below. As the visual shrinks, the header,
  month labels, weekday labels and legend switch off in that order so the grid keeps the space; the
  README gives the smallest size that still reads. The capsule corner radius is half the cell
  width, and square cells use a small fixed radius. At the dense preset, cell positions and widths
  are rounded to whole pixels so the gaps stay even. The peak ring is drawn inside the peak cell,
  keeping its fill.
- **Selection (wiring from the prototype).** Left mouse button only. Mouse-down on a day starts a
  range, moving over days extends it, and mouse-up calls Deneb's cross-filter apply once with a Vega
  filter expression for the range. Deneb does not hand that expression to Power BI. It evaluates it
  in a separate headless Vega view over the visual's own dataset, seeded only with the values of
  top-level signals, and selects the identities of the matching rows. So the expression may use only
  base dataset fields (read with bracket access) and top-level signals such as the range bounds.
  Only days that exist as rows can be selected. The result is an ordinary cross-filter selection of
  row identities, not a date filter: it does not show in the filter pane and does not carry to other
  pages. The range runs in calendar order, not as a rectangle. A mouse-down on the background clears
  the selection, and a drag that ended outside the visual resets on the next mouse-down. After
  Power BI applies the selection, the spec reads each row's selected state and dims the rest.
  Proved in Desktop by #2, with each gesture replayed through remote debugging and checked against
  the table, both cards, the title and independent DAX: Deneb accepts the range expression, and a
  drag from 7 July to 20 August 2025 filters the page to exactly those 45 dates, the three no-sales
  days included (Days in filter 45, Total sales 148,343). A click selects one day, a no-sales day
  too; a background click restores every date; a right click opens Power BI's context menu and
  changes nothing. The selected flags come back: after the drag the 45 rows read `on` and the other
  320 `off`, and after a background click all 365 read `neutral` (the Calendar's Vega view and
  Deneb's debug view agree). So the spec dims from the flags, and no fallback that keeps its own
  applied range is needed. The trimmed wiring:

  ```
  downIdx / headIdx : set on  @cell:mousedown[event.button === 0]
  headIdx           : follows [@cell:mousedown[button 0], window:mouseup] > @cell:mouseover
  reset to null     : on view:mousedown[button 0] outside a cell
  loMs = local midnight of the first selected day                    (top-level signals, both
  hiMs = local midnight of the day after the last selected day - 1ms  built with datetime(y, m, d))
  on view:mouseup[button 0]:
     downIdx == null ? pbiCrossFilterClear()
                     : pbiCrossFilterApply(event, "inrange(time(toDate(datum['<date field>'])), [loMs, hiMs])", {limit: 2500})
  ```

- **Selection limit.** The limit is always passed, because without it Deneb uses a fixed 50 rows
  and ignores the format pane's data point limit. It accepts 1 to 2,500, and a larger value makes
  Deneb reject the whole call, so the spec passes 2,500. (A limit of 0 is not rejected: Deneb's range
  check skips it and falls back to the format pane's limit, as its source at 1.9.1.0 and 2.0.0.0
  shows.) That covers a full year (366 rows) with up
  to six split values. When shift is held, the rows already selected count toward the same limit. A
  selection over the limit is refused: Deneb keeps the previous selection and shows its limit
  warning. The spec checks the apply result and clears its drag preview when the limit was exceeded,
  so the calendar never looks selected when it is not. The README states the cap (about 6.8 years of
  one-row-per-day data in one drag).
- **Adding to a selection.** Shift and ctrl are Deneb's default multi-select keys. Power BI's
  multi-select toggles each identity it is sent, one by one. #2 replayed it in Desktop through
  remote debugging, each time after a drag from 7 July to 20 August 2025, and checked the table,
  both cards and the Calendar's flags: a shift-click on a selected day (14 August) removes it,
  leaving 44 days; a shift-drag over seven days all selected (4 to 10 August) removes them, leaving
  38; and a shift-drag over three selected days and six unselected (18 to 26 August) removes the
  three and adds the six, leaving 48. So the harness's multi-select merge setting is
  `multiSelectMerge: 'toggle'` (each identity in a multi-select apply flips; unselected ones join,
  selected ones leave), which Selection (#9) builds into the harness host. The title reads
  "Selected Period: See Date Slicers" for any selection that is not one run of days. On a Mac,
  ctrl-click is the secondary click and opens the context
  menu, and Deneb has no Command key option, so shift is the documented modifier. A Mac browser can
  report ctrl-click as a left-button mouse-down with ctrl held; test it in a Mac browser, and if it
  also filters, ignore mouse-downs with ctrl held.
- **Small multiples.** A click or drag inside one panel selects that date range for that panel's
  split value only: the expression tests both the date range and the split field. Dimming follows
  each row's own selected state, so the other panels dim.
- **Inbound highlighting.** The template turns cross-highlight on in its metadata, so it is on when
  the visual is created; a visual first opened in Deneb 2.0 with it off has highlight frozen off.
  Highlight values exist only for measures, as the value measure's highlight companion field, never
  for the date column. A day is highlighted when that value is not null and dimmed when it is null.
  An empty day keeps its empty style either way. The spec does not use the highlight status or
  comparator fields: they are opt-in on new 2.0 visuals and the shipped 2.0.0.0 build reports them
  wrongly for un-highlighted rows. In Desktop the Calendar's dataset lists `Sales__highlight` beside
  the status, comparator, format and formatted companions of each measure, and none for the date
  column (#2, read from the Calendar's Vega view and from the columns of Deneb's debug view through
  remote debugging).
- **Tooltips, context menu and drill-through.** Each drawn day that has a dataset row copies that
  row's identity. Default tooltips, report page tooltips and the context menu, drill-through
  included, then resolve to that day on Deneb 1.9 and 2.0 alike. A day without a row leaves the
  identity off rather than setting it to null, because Deneb 1.9 treats any identity that is present
  as real. Report page tooltips need the visual's tooltip type set to Canvas and a matching tooltip
  page. The default tooltip always lists the date and the value explicitly, because sentence-style
  tooltips read only what is listed. The date is text formatted by the spec. The value is passed as
  the raw number under the measure's exact field name, so Power BI applies the model's format
  string, dynamic ones included. It is never passed as a pre-formatted string.
- **Number formats in the visual.** The header total, KPI strip and month totals use a compact d3
  format with an upper-case K (1.33M, 3.6K, 12K), following the library's rule of d3 formats rather
  than Deneb's own format functions.
- **Readout.** The optional readout states the selected date range and its day count, for example
  "7 Jul to 20 Aug 2025, 45 days".
- **Target mode.** A day that meets or beats its target draws in the theme's good colour, and a day
  that falls short draws in the bad colour. Empty days stay empty, and the legend reads Under and
  Over. The target is the target column when one is named, otherwise 80% of the mean per day. In BI
  Nexus the good colour is the same blue as theme colour 1, which is acceptable because the Targets
  page shows target mode only.
- **Mean per day inside the template.** The template uses the report's definition: the total over
  the calendar days in the current date filter, blank days counted as zero. It is not taken over
  the window. The template reads those days from its dataset. With "every date has a row" on, they
  are the dates that arrive as rows. With it off, they are every day from the earliest to the latest
  date that arrives. Target mode and the KPI strip both use this figure, so the KPI strip's mean per
  day matches the report's Mean per day card under the same filters.
- **Markers and value labels.** A day whose marker column is not blank gets a small dot in the ink
  colour at the centre of its cell and the marker text in its tooltip. This look is our own, because
  Lumeric shows no marker design. Value labels print each day's compact value inside its cell, only
  when cells are at least about 15 pixels tall, in white on the two darkest steps.
- **Import settings.** The library ships version 1 templates, the only format Background Designer
  reads, and version 1 metadata cannot declare the advanced selection mode. An imported copy
  therefore arrives in simple mode: a click still selects a day, but a drag does nothing until the
  author switches selection mode to advanced. The template's metadata turns tooltips, context menu,
  selection and highlight on, a deliberate departure from the library's house default of selection
  and highlight off, and the README says why. The README's first setup step lists every setting the
  template needs. The working report applies the same settings to every calendar.
- **Dates and time zones.** Deneb delivers the date column as a JavaScript Date at local midnight
  in the viewer's time zone (#2, read in Desktop in the machine's own zone, Sydney, from the
  Calendar's Vega view and from Deneb's debug view through remote debugging). 1 July 2025 arrived
  as 1751292000000 (2025-06-30T14:00:00.000Z, midnight in Sydney), and every day of 2025 drew in
  its weekday's row showing its own row. Windows' time zone is never changed to read another zone
  (Tim, 2026-09-26). Other zones are proved in the harness only: every template check runs in UTC,
  Pacific/Auckland and America/Los_Angeles with local-midnight delivery. The harness's host setting
  is therefore `dateDelivery: 'local'`, its default. Other hosts deliver other shapes: the library
  checker a local-midnight Date, a text column its ISO string. So the date parse step (#6) accepts
  a Date, an epoch number or a date string, reads its instant, and takes the UTC calendar date when
  the instant falls exactly on UTC midnight and the local calendar date otherwise. A local midnight
  falls on UTC midnight only where the offset is zero, and there both dates agree, so every shape
  resolves to the same day in every zone (the harness draws the same scene from local, UTC, text
  and epoch deliveries in all six cells). A date-time at exactly UTC midnight is read as that UTC
  date, which the README states. The spec uses local date functions only and builds the lookup key
  and the selection bounds the same way. The selection expression, carried over unchanged from the
  prototype, still reads a row's date as its instant, so it matches the right rows only for
  local-midnight delivery, which is what Deneb gives; a host that delivers another shape draws the
  right days but would select by that shape's instant (Selection, #9, may apply the same parse).
  Leap years are handled by stepping calendar dates, never by adding a fixed number of
  milliseconds.
- **Deneb versions.** The spec reads the container size through the legacy signals (pbiContainer
  width and height), which Deneb 1.9 needs and Deneb 2.0 rewrites to its own names when it loads the
  spec. It references them only in the top-level width and height, and everything inside uses
  Vega's own width and height, because Background Designer's preview does not supply them and the
  library checker rejects the 2.0 names. The 2.0 rewrite is textual, so those names must not appear
  inside label or tooltip strings. Importing the template through the Deneb 2.0 editor saves the
  spec with the 2.0 names, so a visual created that way no longer opens on 1.9; the working report
  therefore embeds the spec with the legacy names. Desktop runs Deneb 2.0.0.0 on Vega 6.4.0 (the
  build stamp in the Calendar's `visual.json` after #2's save). Deneb 2.0 rewrites the legacy names
  in memory when it loads the spec (its log: "Migrated 2 legacy pbiContainer signal reference(s) to
  denebContainer"), but not in the saved file: after #2 opened Deneb's editor and debug view through
  remote debugging and saved from Desktop, the saved spec still read `pbiContainerWidth` and
  `pbiContainerHeight` once each and `denebContainer` nowhere (the deneb-pbir audit of the saved
  file). So the seam loop needs no step that restores the legacy names. Importing a template
  through the editor is a different act, and it does save the 2.0 names (above). The spec relies
  on no 2.0-only feature (the 30,000-row window, keyboard focus, continuous view, canvas
  scale-to-zoom, or Vega features newer than 1.9's Vega 6.2).
- **Fonts.** Deneb cannot load web fonts. The template's config names a font stack: Segoe UI, then
  Helvetica Neue, Arial and sans-serif, because Segoe UI is missing on macOS, iOS and Android. The
  BI Nexus report puts Arial first to match its theme. Vega text has no letter-spacing, so tracked
  uppercase labels are not reproduced.
- **Scale.** Deneb's row window is 10,000 rows on 1.9 and 30,000 on 2.0. Ten years of days is about
  3,650 rows, which fits both. A split field multiplies the rows per day, so ten years split more
  than twice needs Deneb 2.0, and the README says so. The renderer choice (SVG or canvas) is a
  documented option. An export renders the visual afresh, so a drag in progress or a hover is never
  captured. Whether an active selection or a scrolled position carries into an export is unverified,
  so export layouts must fit their container without scrolling.
- **Library sample data.** The template ships a small sample file for the library: one year of
  daily rows and one series, with a header exactly matching the field names and well under the
  library's 50 KB warning. The edge-case data lives in the test fixtures, not in the library sample.

### The working report

- **Semantic model: one shared model.** The standard date table from the date-table skill (fiscal
  year starting July) is related to daily fact tables for sales (by channel and region), support
  tickets, web sessions and daily targets, plus region and channel dimensions. Measures follow the
  house DAX standard (the dax-standard skill). Every visual reads this one model, which is what makes
  the filtering real. The region and channel dimensions (#5) are DAX calculated tables of their
  members with a hidden display-order column (North, South, EMEA, APAC; Online, Retail, Wholesale),
  related many to one from Sales, whose own Channel and Region columns are hidden so every filter
  goes through a dimension. The Sales generator keeps its own member list (it carries the shares),
  so the tie-out checks that every sales row finds its member and every member has sales. Only
  Sales carries channel and region.
- **Sample data is synthetic and lives inside the model.** The PBIP opens and publishes with no
  external files, gateway or credentials. It covers three fiscal years, FY24 to FY26 (1 July 2023 to
  30 June 2026), so FY24 carries 29 February 2024 and the leap day can be checked in Desktop. Each
  fact table is a DAX calculated table generated from the date table with a fixed formula (never
  RAND, which changes on every refresh), shaped like the mock: weekdays high and rising to a
  December peak for sales, weekend-heavy sessions, a mid-year surge in tickets, and some blank days.
  It is not built as many small inline Power Query tables: the Deneb library's showcase moved away
  from those after each spawned its own mashup container and refresh ran out of memory.
- **KPI numbers are DAX measures.** Total, mean per day, peak day, active days, the mean daily
  target and the Top days rows are measures or a Top N filter in the model, and the Deneb specs only
  draw them. That is what lets the DAX tie-out test them. Mean per day is total sales over the
  calendar days in the current date filter, with blank days in the divisor. Active days is the days
  with sales over the calendar days in the current date filter, both counted from the date table.
  As built in #5: Mean per day and Active days read 0 on a filter whose days have no sales, and
  blank only when the filter holds no days; Peak day is the date of the best day, the earliest on a
  tie, blank when no day has sales. Top days is a measure, not a Top N filter: Top Day Sales keeps a
  day's total only when it is one of the five best days with sales in the visual's filter
  (slicers, page filters and a Calendar Selection, through ALLSELECTED on the date table), ties to
  the earlier date, so a visual of the date and that measure gets exactly five rows. Formats: Total,
  Mean per day and Top Day Sales `#,##0` (exact, because a Calendar tooltip shows the measure in
  its model format), Peak day `d mmm yyyy`, and Active days a dynamic format string from the
  `Fmt.OutOf` DAX function that reads 343 / 365 while the value stays a number. The house formats
  put DAX user-defined functions in the model, hence compatibility level 1702.
- **Pages.** Daily overview, By region (small multiples on one shared scale) and Targets (target
  mode) are the three visible pages. Two hidden pages support the calendars: Day detail, a
  drill-through page keyed on the date (sales by channel and region for that day, and the day
  against its target), and Day summary, a tooltip page assigned to every calendar with the Canvas
  tooltip type. The page navigator lists visible pages only, so it shows the three. Each page is a
  custom 1280 by 968 canvas, the mock's 1.32 proportions scaled up, shown Fit to page.
- **Rail and top bar.** The left rail and the region pill appear on all three pages. Their slicers
  (fiscal year, date range, channel, region) are synced across pages. The fiscal year slicer is
  single-select with FY26 selected when the report opens, so every calendar draws exactly one fiscal
  year, and the date range slicer narrows within it. The date range control is a native
  between-dates slicer; the mock's little calendar picture is not reproduced, because a decoration
  that looks like a picker but does nothing would mislead. The mock's "Calendar Heatmap" tab pill
  names Lumeric's product and does nothing, so it is not reproduced. The top bar holds the title on
  the left and the region pill on the right. A calendar selection does not carry across pages, and
  the report accepts that.
- **Title.** A measure-driven text box built from the "Dates Selected" measure that the date-table
  skill adds, plus the fiscal year, so it never goes stale. A text box follows a Calendar
  Selection: in #2's replayed gestures it read "Selected Period: 7 Jul - 20 Aug 2025" after the
  drag and "Selected Period: 17 Jul 2025" after a click, with the Calendar set to filter it (read
  from the canvas through remote debugging). So the title stays a text box, and the card fallback
  is not needed.
- **Layout after the mock, in BI Nexus.** A page background image draws the page frame and the rail
  border only. Card borders come from each visual's container settings (rounded corners, a hairline
  border). Native text boxes carry every word, static section labels included, so no text is baked
  into the image.
- **Visual choices.**
  - The three calendars are instances of the template. Sales: capsule cells, regular density,
    header off, month and weekday labels on, peak ring on, legend on (the mock leaves it out, but
    story 8 needs it). Support tickets: square cells, header off with the card title as a text box,
    labels on, legend off. Web sessions: capsule cells at the dense preset, header off with the card
    title as a text box, labels on, legend off.
  - The four KPI cards are one new small Deneb spec with a chart mode per card. Total: an area
    sparkline of weekly totals with its line drawn. Mean per day: a bullet of the mean against the
    mean daily target, on a track that runs to the best day. Peak day: a 100% bar of how many days
    fall in each colour step, in the calendar's ramp. Active days: one column per month of active
    days. Every mini chart follows the same filters as its card.
  - Sales by month is a small Deneb spec in fiscal order (J A S O N D J F M A M J), with no axis or
    values, heights from the data, and highlight support so it can show a calendar's selected share.
  - Top days is a small Deneb spec: five rows, a date label, a pill track, a bar scaled to the best
    day and a compact value.
  - The rail uses native visuals: a page navigator, a between-dates slicer, and fiscal year and
    channel slicers. The region filter is a native slicer styled as a pill.
- **Interactions.** Every pair is written explicitly in each page's visual interactions, because
  Power BI's default toward a visual that supports highlighting, as every Deneb visual does, is
  usually highlight. Each calendar filters the KPI cards, Top days and the title. Each calendar
  highlights Sales by month and the other calendars, so the month chart keeps all twelve columns and
  no calendar empties another. The KPI cards, Sales by month and Top days send no selections. The
  rail slicers and the region pill filter every visual. The same rules apply on By region and
  Targets to the visuals those pages hold.
- **Theme and per-visual formatting.** BI Nexus colours and fonts, applied as the report theme.
  Deneb visuals take no colour overrides; colours reach them through the theme. Per-visual container
  formatting is allowed and expected: corner radius, border on or off, shadow on or off, title off,
  padding. BI Nexus gives every visual a border, a navy shadow and a visible title by default, so
  every visual turns the default title off, and only the main sales calendar keeps a shadow, as in
  the mock. The page navigator, rail slicers and region pill are styled per visual, because BI Nexus
  has no page navigator style and styles slicers with a bold header and a blue outline. Any colour
  set on a single visual is a BI Nexus theme colour or one of the fixed neutral greys, never a
  Lumeric colour. If the same overrides repeat across many visuals, they move into a report-local
  copy of the theme.

## Testing Decisions

### What a good test is

A good test drives the thing from the outside and checks what a viewer or the Power BI host would
see. For example: "dragging from 7 July to 20 August selects exactly the rows dated 7 July to 20
August inclusive, and no other row" (45 rows when every date has a row; the prototype's sample
matched 36 because it leaves some blank days out), "a right click sends nothing", "an empty day is
drawn in the empty colour, not the lowest step", "FY26 draws 1 July 2025 in its first column". It
does not assert on signal names, transform order or other internals, so the spec can be refactored
freely.

### Seams (two)

One seam cannot cover this work. Power BI Desktop cannot drive clicks and drags inside a Deneb
visual, and a headless browser cannot see the model, the page interactions or the layout. So there
are two seams, each at the highest point its deliverable allows. The library's offline checker and
the deneb-pbir parse check are gates the template must also pass (see Prior art), not further seams,
so no third harness is built.

1. **The template seam: the spec as a black box in a headless browser.** Input: dataset rows shaped
   the way Deneb delivers them (local-midnight dates, row identities, selected flags and highlight
   values), a container size, a theme and option values. Fixtures are synthetic rows covering the
   edge cases, plus rows exported from the working report's model by a calendar's own query, so the
   template is also tested on the shape the report delivers: every date present, some values blank.
   The first is `report-sales-fy26` (#5): the sales Calendar's query as pbir builds it from the
   visual, with the page's date filter swapped for FY26, run in Desktop (`npm run export-fixture`
   in `report/desktop`; `--check` proves a second export is identical).
   Output: the rendered scene (which cells exist, where, in what colour, which labels) and the
   recorded host calls. Each apply call is checked the way Deneb handles it: rejected unless the
   event is a browser event and the limit is 1 to 2,500 (0 falls back to the format pane's limit),
   then its expression evaluated in a separate
   headless Vega view over the dataset seeded with top-level signal values only, so an expression
   that reads a group-level signal or a derived field fails here as it would in Power BI. The limit
   check adds the rows already selected when shift is held. The harness runs in more than one time
   zone. Almost every template behaviour is tested here: geometry, colour steps, empty and
   filtered-out days, the peak ring, leap years, week start, windows, selection gestures, small
   multiples, inbound highlight and tooltip content.
2. **The report seam: the PBIP and its model in Power BI Desktop.** Schema validation of the report
   files comes first. Then the canvas is reloaded and every page is captured with the all-pages
   screenshot option, because a single page path has been seen to capture only the first page. A
   reload re-reads pages and visuals only: a theme change needs the file closed and reopened, and
   data, including the date table's Power Query, needs a data refresh in Desktop. Screenshots are
   compared with the mock and the layout decisions above. Schema validation does not catch a
   malformed measure-driven text run, so the title is checked on screen. DAX tie-out queries evaluate
   the report's own measures (total, mean per day, peak day, active days) and the Top days rows
   under a test's filters, and compare them with independent queries over the fact tables, always
   after a data refresh in Desktop. The suite holds a fixed set of filters that every measure is
   checked under, and later tickets reuse: whole FY26, whole FY24 (366 days), 7 July to 20 August
   2025 (45 days), FY26 with the Retail channel, and FY26 with the EMEA region (#5). Before Desktop
   applies the model, its TMDL is round-tripped offline (`report/validate-model.ps1`); where the TOM
   assembly predates DAX user-defined functions, it validates a copy without `functions.tmdl`, the
   documented workaround, and Desktop is the referee for the functions. There are
   no human click-through checklists (Tim's decision, 2026-09-26). Clicks and drags inside a Deneb
   visual are proven at the template seam, whose apply evaluator copies Deneb's source, and
   replayed in Desktop too: the report canvas's WebView2 accepts remote debugging when Desktop is
   started with a localhost debugging port in its own environment for the run only (#2 proved it
   on Desktop 26.08 with Deneb 2.0.0.0). Every later ticket replays its Desktop gestures that way,
   through the driver in `report/desktop` (the recipe is in `report/README.md`), and checks their
   effect on every other visual by reading the canvas, by screenshot and by DAX. The same
   connection reads a Calendar's dataset from its Vega view and opens Deneb's editor and debug
   view, so temporary debug text marks and filters set on disk are not needed. They remain the
   fallback should a Desktop or WebView2 update close that route.

### Prior art

- The prototype's headless-browser harness. It stubs the Deneb expression functions, renders in the
  BI Nexus theme, and replays a drag, a click, a right click and a background click. It checks each
  recorded filter with hand-written stand-ins for the date functions rather than Vega's own
  evaluator. The template seam grows from it and replaces that check with Deneb-style headless
  evaluation.
- The Deneb template library's offline checker. For each template it checks strict JSON under the
  size cap with no em or en dashes, a Vega or Vega-Lite version 6 schema, metadata valid against
  Deneb's version 1 template schema, placeholders declared, used and never read with dot access, no
  2.0 container signal names, and that the spec compiles and runs headless over its sample data with
  Deneb's functions stubbed (theme colours from a theme file, formats approximated). It does not
  validate against the Vega JSON schema and its cross-filter stubs do nothing, so it never exercises
  selection. The finished template must pass it.
- The deneb-pbir skill's renderer and spec tool. The renderer is a parse and render check under
  Deneb 2.0's Vega 6.4; its 1.9 option only rejects 2.0 container names, so a Vega feature newer
  than 1.9's Vega 6.2 still passes, and its cross-filter functions do nothing. The spec tool adds
  the build stamp audit and embeds the spec into a visual.
- The pbir CLI: report validation, Desktop reload and all-pages screenshots (the pbi-verify-loop
  skill), and DAX queries against the open model for tie-out.

## Out of Scope

- Lumeric's formatting "Studio": the custom format pane, first-run setup wizard, suggestions, change
  history and preset locking. Deneb has a fixed format pane, so options live as named settings in
  the spec and are documented in its README.
- Lumeric's named presets and palettes. The template offers theme shades or a custom list.
- Automatic dark mode, Windows high-contrast detection, and a manual dark mode setting. Deneb cannot
  read either, and a manual setting would need a second set of the fixed greys.
- A dark variant of the report.
- Keyboard navigation between cells and per-cell screen-reader labels. Possible later on Deneb 2.0,
  but not in this spec.
- The Sora display font and letter-spaced labels.
- The site's build-in animation and a playback scrubber.
- A contrast-ratio readout, and Lumeric's accessibility checks card.
- The longest-streak overlay, an IBCS mode, and week or month granularity: the template draws days
  only.
- Choosing the aggregation inside the visual. Sum, average and the rest belong in the measure.
- Recreating the Lumeric marketing pages, catalogue shelf or the "ten pages" explorer.
- Copying anything from Lumeric's code, logo, copy or palette.
- Publishing the template to the public library before the courtesy note has gone out.

## Further Notes

- The prototype reproduces the calendar card at the top of Lumeric's Calendar Heatmap page and has
  been re-rendered in BI Nexus. The gating Desktop questions were answered on 2026-09-26 by #2,
  without a human, by replaying gestures in Desktop through remote debugging (`npm run probe` in
  `report/desktop`; its screenshots and every reading are in `checklists/probe/screenshots/`). None
  is left unchecked and none forced a fallback, so Deneb's source at 1.9.1.0 and 2.0.0.0 was not
  needed for any answer. Each answer sits in the section it decides:
  - How the date column arrives: a Date at local midnight in the viewer's time zone, read in the
    machine's own zone, Sydney ("Dates and time zones"; the Calendar's Vega view and Deneb's debug
    view). Other zones are proved in the harness only, and Windows' time zone is never changed.
  - Blank dates with the helper: they arrive as rows, one per day in the filter ("Every day is
    drawn"; the Vega view, the debug view and DAX).
  - The range expression: Deneb accepts it, and a drag filters the page to exactly its days
    ("Selection"; gestures replayed in Desktop, checked by the canvas and DAX).
  - Shift-click and shift-drag over a Selection: each identity toggles, `multiSelectMerge:
    'toggle'` ("Adding to a selection"; gestures replayed in Desktop).
  - The title: the text box follows a Selection, so it stays a text box ("Title"; gestures
    replayed in Desktop).
  - The selected flags: they come back `on` and `off` after a Selection and `neutral` after a clear
    ("Selection"; the Vega view and the debug view).
  - The Deneb build: 2.0.0.0 on Vega 6.4.0 ("Deneb versions"; the build stamp after a save).
  - The highlight companion: `Sales__highlight` is delivered ("Inbound highlighting"; the Vega view
    and the debug view's columns).
  - The legacy container names: a save after the editor was opened keeps them ("Deneb versions";
    the saved file).
- The mock contradicts itself in places: 364 cells against "365 days", a "quantile" label on
  equal-interval steps, evenly spaced month labels, rising month bars against a "best month" of
  October, and a peak cell drawn wider than its column. Where it does, this spec follows what reads
  correctly, not the mock.
- The feasibility study in the reference folder holds the full inventory of the visual and the
  mock (with the mock's colours, sizes and element boxes), Deneb capability notes with sources, the
  feature matrix and the verifiers' findings. Its paths point into the project's reference and
  prototype folders. The clean crops of the mock (light and dark) in the local captures are the
  layout reference for the page screenshots.
- Estimate from the feasibility study: about 7 to 9 working sessions for the template plus the
  working three-page report.
- **Terms.** Template: the Deneb calendar spec. Report: the working Daily Sales PBIP. Calendar: one
  instance of the template on a page. Window: the days a calendar draws. Empty day: a day in the
  window whose value is blank. Filtered-out day: a day an inbound filter removed. Peak day: the day
  with the highest value in the window. Ramp: the ordered colours; steps: its equal-interval bands.
  Density: the gap between cells. Selection: the days a calendar sends out as a cross-filter.
  Cross-highlight: dimming driven by another visual's selection. Mean per day: the total over the
  calendar days in the current date filter, in the report and the template alike. The mock: the "Daily Sales · FY26" report on the Lumeric
  site.
