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

- 2026-09-25: feasibility study done and prototype rendered. Click, drag, right click and clear have
  been replayed in a headless browser only, not yet in Power BI Desktop.
- 2026-09-25: wave 1 built. The template seam harness (T03) and the probe Report (T01) pass their
  acceptance checks. The courtesy note to Lumeric Visuals is drafted in the Vault, not yet sent. Next:
  Tim runs the probe checklist in `checklists/probe/` (T02).
- 2026-09-26: the probe (#2) answered every gating Desktop question without a human, replaying
  gestures in Desktop through WebView2 remote debugging. The answers are in the SPEC; later tickets
  replay their Desktop gestures the same way.
- 2026-09-26: the sales model (#5) has its channel and region dimensions and every sales KPI measure
  (Total, Mean per day, Peak day, Active days, Top days), tied out by DAX under a fixed set of
  filters, with native cards on Daily overview and the sales Calendar's FY26 rows exported as a
  harness fixture.
- 2026-09-26: the Template skeleton (#6) is in `template/calendar-heatmap/`: calendar or fiscal-year
  Windows on the right weekday in any time zone, whatever shape the date arrives in, Empty and
  Filtered-out days, and the library checker as a standing gate. The Report's sales Calendar is the
  Template, drawing FY26 under an FY26 page filter.
- The finished template goes to the public [Deneb template library](https://github.com/InsightfulAnalytics/Deneb)
  once a courtesy note has gone to Lumeric Visuals.
