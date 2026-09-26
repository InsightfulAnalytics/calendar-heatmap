# Calendar Heatmap

A Vega calendar heatmap template for Deneb, and a working three-page Power BI report built on it in
the BI Nexus theme. The design follows the Calendar Heatmap by
[Lumeric Visuals](https://lumericvisuals.com/visuals/calendar-heatmap). Nothing is copied from their
code, logo, copy or palette.

**Start with [SPEC.md](SPEC.md).** It holds the problem, the user stories, the decisions and how the
work is tested.

![Prototype in the BI Nexus theme](prototype/render-bi-nexus.png)

## Layout

| Folder | What |
|---|---|
| `template/calendar-heatmap/` | The Template: the Deneb calendar spec in the Deneb template library's shape (`calendar-heatmap.json`, `sample-data.csv`, `render.json` and a README draft), restructured from the prototype by #6 |
| `prototype/` | The first Vega spec, its synthetic data and the headless render and interaction harness. See its README |
| `harness/` | The template seam: the spec as a black box in headless Edge, under Vega 6.2 and 6.4 and in three time zones, with Deneb's own apply rules. Its `npm test` also runs the library's offline checker and the deneb-pbir parse check on the Template. See its README |
| `report/` | The Daily Sales PBIP, its report seam loop (`seam.ps1`: validate, apply, refresh in Desktop, screenshots, DAX tie-out) and the Desktop driver (`desktop/`: gestures replayed in Desktop through remote debugging, and the #2 probe). See its README |
| `checklists/` | The probe checklist written by T01 for a human, retired on 2026-09-26: #2 runs its steps through remote debugging (`report/desktop`), and its screenshots and `probe.json` in `checklists/probe/screenshots/` are the evidence for the SPEC's recorded answers |
| `evidence/` | Desktop evidence per ticket: `05-sales-model/` holds the #5 card check's screenshots and `cards.json`, and the seam loop's all-pages screenshot; `06-template-skeleton/` the #6 Calendar check (`calendar.json` and its screenshot), the card check rerun on the Template and the seam screenshot |
| `theme/` | The BI Nexus report theme |
| `reference/feasibility.json` | The feasibility study: an inventory of the Lumeric visual and report mock, Deneb capabilities, the feature matrix and the verifier findings |
| `reference/lumeric-site/` | Local only, not committed: captures of the Lumeric site used as the design reference |

Learnings and notes live in the Vault, under
`Vault\Projects\Calendar Heatmap\`.

## Status

- 2026-09-25 to 26: feasibility, prototype, the template seam harness (#3), the probe Report (#1),
  the Desktop probe (#2), the sales model (#5) and the Template skeleton (#6).
- 2026-09-26: close-out on a lean scope (Tim: expedite; library extras deferred, time zones left to
  each viewer since the Service runs in UTC). The Report has its frame and all five pages: Daily
  overview (KPI strip, the sales, support tickets and web sessions Calendars, Sales by month, Top
  days), By region (one Calendar per region on a shared scale), Targets (target mode), and the
  hidden Day summary tooltip and Day detail drill-through. The Template gained cell shape, header
  and legend switches, a shared scale field, target mode and inbound highlight dimming. Proof: the
  harness (476 checks), the seam's DAX tie-out, and `npm run accept` in `report/desktop`, which
  replays one drag, a hover and a drill through in Desktop (15 checks, `evidence/27-acceptance/`).
- Deferred to the backlog (closed as not planned, reopen if wanted): rolling and multi-year
  Windows, week start, in-spec small multiples, the selection-limit handling, Deneb 1.9 scratch
  checks and PDF export, markers and value labels, the in-Calendar KPI strip and month totals.
- Open, Tim's: the courtesy note to Lumeric (#4), then republishing and the library PR (#29).
- The finished template goes to the public [Deneb template library](https://github.com/InsightfulAnalytics/Deneb)
  once a courtesy note has gone to Lumeric Visuals.
