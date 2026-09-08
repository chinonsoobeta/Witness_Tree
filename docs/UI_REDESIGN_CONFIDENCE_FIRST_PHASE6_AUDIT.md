# Confidence-first Phase 6 visual audit

Audited on 2026-09-08 from the Phase 5 merge, `b6a14286819017a04d47edabe1a41b47030ca953`.
Phase 5 is live as Sites version 30, sourced from `5ad4b2163022820f2942b758f1bf5eb16e054620`.
This Phase 6 change is a local and branch verification, not a deployment.

## Findings and fixes

Explore's implicit grid column adopted the minimum width of its embedded table. At a 375 px viewport the document became 1000 px wide. An explicit `minmax(0, 1fr)` column keeps the map section within the page while preserving the table's own horizontal scroll. The 980 px table now scrolls inside a 335 px container.

Once the map loaded at that width, its scale, legend and action buttons competed for a single row. At the existing 760 px breakpoint, the legend now occupies its own full row, with scale and actions below. The legend retains keyboard focus and horizontal scrolling. No map rendering, source, measurement or interaction code changed.

The Releases prose includes an unbroken release identifier. In French at 375 px it widened the document to 637 px. Governance paragraphs now permit wrapping inside long strings. The identifier and citation text are unchanged.

Some initial measurements immediately after resizing reported overflow on other French pages. Fresh mobile loads and settled resize measurements did not reproduce those reports; no speculative fixes were made to those pages.

## Visual review

Chromium rendered 25 route/scenario combinations in English light, English dark, French light and French dark: 100 desktop states at 1280 px. The French states were also captured at 375 px. Screenshots were inspected as four-state contact sheets, with full-size mobile close-ups for the risky panels. The gate is bilingual, so its locale captures show the same page.

| Surface | Scenarios inspected |
|---|---|
| Gate and landing | Bilingual gate; coverage statement; province figures and hatched unknown bars |
| Place and location | Illustrative province record; annual chart and table; identity, headline and provenance; location events |
| Explore | Map loading and loaded states; coverage disclosure; province list, table and chart; scrollable map legend and table |
| Search | Place results; no-match result; federal district search entry |
| Draw | Form and coverage statement; submitted measurement failure with no fabricated result |
| Compare | Side-by-side cards and table; ranked table including missing coverage |
| Wildfire | Warning, product feed status and official agency directory |
| Data and Methods | Provenance rail; download actions; confidence-rules table |
| Governance | Corrections, Engagement, Decisions, Privacy, Terms, Releases and Glossary |
| Account | Service status and expanded future-capabilities disclosure |

The dark-theme unknown hatching, evidence shapes and card text remained visible. French comparison coverage labels fit beneath their headings. The wildfire warning symbol remains aligned with the top of its wrapped heading. Long release strings wrap without removing characters.

The local drawn-area request returned the existing measurement failure, so this audit does not claim a successful live grid measurement. The map was separately inspected after its loaded layer panel appeared; loading screenshots alone were not treated as proof of a rendered map.

## Verification and evidence boundaries

The required sequential 119-step loop was green before editing and after the final fixes. The full suite reports 1516 passes, zero failures and four existing skips. No checker, assertion, CI step, dependency, published figure or source-register entry changed.

The changed stylesheet is not a checksum-bound input in the exit-status records. No checksum rebinding or data edit was required; criterion statuses and gate counts remain unchanged. The two map source files bound by the deployed-map observation are unchanged.

Temporary browser scripts, screenshots and logs are under `/tmp/wt-confidence-phase6-*` and `/tmp/p6-*` on the execution machine. They are local review artifacts, not deployment evidence. The committed change contains the stylesheet fixes and this audit only.
