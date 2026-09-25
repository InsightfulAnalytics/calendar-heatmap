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
| `prototype/` | The first Vega spec, its synthetic data and the headless render and interaction harness. See its README |
| `theme/` | The BI Nexus report theme |
| `reference/feasibility.json` | The feasibility study: an inventory of the Lumeric visual and report mock, Deneb capabilities, the feature matrix and the verifier findings |
| `reference/lumeric-site/` | Local only, not committed: captures of the Lumeric site used as the design reference |

The template and the PBIP arrive as the spec is built.

## Status

- 2026-09-25: feasibility study done and prototype rendered. Click, drag, right click and clear have
  been replayed in a headless browser only, not yet in Power BI Desktop.
- The finished template goes to the public [Deneb template library](https://github.com/InsightfulAnalytics/Deneb)
  once a courtesy note has gone to Lumeric Visuals.
