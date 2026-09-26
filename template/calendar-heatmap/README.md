# Calendar Heatmap

A year of daily values in one view: week columns by weekday rows, each day coloured in one of five
steps of the report theme's first colour. Days with no value are drawn in a neutral grey, never as
zero, the peak day is ringed, and a click or a drag across the days cross-filters the page to that
date range.

Draft: the Template is being built ticket by ticket in the Calendar Heatmap project. Each section
below says what is in place so far; later tickets fill the rest.

## Fields

| Name | Kind | Type | Description |
|---|---|---|---|
| Date | column | dateTime | The day: a date column, such as the date table's date. One row per day. |
| Sales | measure | numeric | The day's value: a non-negative measure, such as total sales. |

Map any date column and any measure: the names above are only the placeholders' names. Both are
read by bracket access, so a field name with spaces works.

The date may arrive as a date, a date-time at midnight, an epoch number or ISO text
(`2025-07-01`). Each resolves to the same calendar day in every time zone. A date-time that falls
exactly on UTC midnight is read as that UTC date; any other time is read as the local date.

## Settings

Every setting is a signal at the top of the spec, from `titleText` to `maxAspect`. Change the value
in place. The signals after `maxAspect` are the spec's own working and need no editing.

| Setting | Default | What it changes |
|---|---|---|
| `titleText` | the value field's name | The header title. |
| `subtitleText` | `by ` and the date field's name | The header subtitle. |
| `windowMode` | `calendar` | `calendar` draws the calendar year holding the latest date; `fiscal` draws the fiscal year holding it. |
| `fiscalStartMonth` | `7` | The fiscal year's first month, 1 to 12 (7 is July). Used when `windowMode` is `fiscal`. |
| `everyDateHasRow` | `false` | Off: a day with no row is an empty day. On: the report guarantees a row for every date, so a day with no row was removed by a filter and draws as filtered out. |
| `rampShades` | `[0.8, 0.55, 0.25, -0.1, -0.45]` | The five steps, as shades of theme colour 1 from light to dark. |
| `emptyColor` | `#f1f5f9` | Fill of an empty day (no value). |
| `filteredOutColor` | `#cbd5e1` | Outline of a filtered-out day, which has no fill. |
| `inkColor` | `#0b1e3f` | Title, total and Peak day ring. |
| `mutedColor` | `#475569` | Subtitle, month labels and legend text. |
| `faintColor` | `#94a3b8` | Weekday labels. |
| `frameColor` | `#e2e8f0` | The frame around the grid. |
| `padL`, `padR`, `padT`, `padB` | `24`, `24`, `14`, `12` | Padding inside the visual, in pixels. |
| `gutter` | `40` | Space for the weekday labels, left of the grid. |
| `insetR` | `20` | Space right of the grid. |
| `fpad` | `4` | Space between the frame and the days. |
| `gapRatio` | `0.21` | The gap between days, as a share of a day's width. |
| `maxAspect` | `1.72` | The tallest a day may be, as a multiple of its width. |

## Setup

In Power BI Desktop, add a Deneb visual, put a date column and a measure in its Values well, open
its editor, create a new specification from a template (Import), pick `calendar-heatmap.json` and
map the two fields.

The template's metadata turns tooltips, the context menu, selection and highlight on.

## Limits

- One band: the Window is the one year (calendar, or fiscal) that holds the latest date.
- The measure should be non-negative: values at or below zero fall in the lowest step.

## Compatibility

Runs on Deneb 1.9 and 2.0. It reads the container size through `pbiContainerWidth` and
`pbiContainerHeight`, in the top-level width and height only, which Deneb 2.0 still accepts.

## Export

To be written.

## Credit

Design after Lumeric Visuals ([lumericvisuals.com](https://lumericvisuals.com)). This template is
an independent Deneb reimplementation, with its own spec and invented data.

## Licence

MIT.
