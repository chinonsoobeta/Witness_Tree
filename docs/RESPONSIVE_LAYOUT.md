# Responsive Explore and comparison controls

This group implements U2, U3, U4, U7 and U8 after the published U1 fix at
`7f03c140be646b598b8e2175f239e30a0e854775`. It includes the assurance and fallback
branches so the real rendered controls can be checked with their existing
Playwright setup. Completed widening is still outstanding; E3's payload ceilings
are not measured by this change.

## Behavior

| Task | Change | Rendered proof |
| --- | --- | --- |
| U2 | The annual definition list uses `repeat(auto-fit, minmax(min(100%, 12rem), 1fr))`, with shrinkable children. | The list fits at all three widths and also in a temporarily constrained 10rem container. |
| U3 | Explore and comparison tables have named, focusable scroll regions and a visible focus outline. Existing table semantics and values remain intact. | Tab reaches every region; the outline is visible; ArrowRight scrolls each overflowing region without widening the document. |
| U4 | Shared small-text tokens use 14px, or 12px for compact labels. The Explore chart uses HTML labels beside proportional bars so SVG scaling cannot shrink its text. | Visible text across the six routes and their table variants renders at least 12px, accounting for the actual screen transform of SVG text. |
| U7 | Layer and legend lists wrap inside a shrinkable panel. Mobile controls use a full-width legend row, and the map has room for all four enabled overlays. | All six layer items fit without horizontal overflow or overlap with the province strip in both locales. |
| U8 | The province strip wraps into two columns on phones, with four keyboard-reachable buttons of at least 44px height. | Four successive Tab stops reach the four buttons; their rectangles remain inside the strip, with two rows at 375px. |

The chart keeps the existing rows, order, values, locale formatter and scale.
Its proportional bars are decorative; the names and values remain ordinary
readable text. The change does not widen the published period or change any
annual or cumulative quantity, denominator, coverage label or admission claim.

## Reproduce the checks

```sh
npm run build
CI=1 npm run test:playwright
node --import tsx --test tests/explore.test.tsx tests/comparison.test.tsx
node --test tests/phase7-indigenous-explore-comparison-exit-status.test.mjs tests/rendered-html.test.mjs
npm run check:phase7-indigenous-explore-comparison-exit-status
npx tsc --noEmit
npm run lint
```

The browser suite covers 375, 768 and 1280 pixels in light and dark themes and
both languages. Its 108 cases comprise 60 accessibility/layout cases, 36 fallback
and keyboard-retry cases, and 12 cases enabling every boundary overlay. No axe
rules, routes, test retries or existing test exclusions were changed. Each run
retains its results, viewport screenshots and layout measurements under a new
`outputs/playwright/` directory.

On 2026-09-04 the full browser run passed all 108 cases, with zero failures,
skips or retries. The Explore/comparison unit run passed 28 tests. Typecheck,
production build, six rendered-HTML tests and both Phase 7 tests passed. Saved
map, chart, definition-list and table-focus renders were visually reviewed
across all three widths and both themes, including French mobile labels.

The first focused map-layout run passed eight cases and failed four at 375px:
enabling all overlays made the legend overlap the province strip. Increasing
the mobile map's minimum height and stretching the two button rows fixed the
measured overlap. That failed observation is preserved separately from the
108-case passing run.

## Evidence bindings and remaining blockers

The first complete sweep ran all 122 CI npm check commands: 119 passed and three
failed. The Phase 7 failure was stale engineering source bindings. The permitted
refresh changes only 15 SHA-256 occurrences for five files; every criterion's
title, reason, status, count and blocker remains identical, at 14/16. The
unchanged Phase 7 checker and its two tests then passed.

| Affected Phase 7 criteria | Why the stated reason still holds |
| --- | --- |
| No Indigenous ranking, normalisation forced, ranking scope, neutral headers | Ranking types, sorting and bilingual copy are unchanged; the existing comparison tests and typecheck pass. |
| Explore modes/overlays, tabular equivalence, native time control | Modes, overlay sources, range controls and route parameters are unchanged. Existing Explore tests pass, and rendered tests exercise all overlays and chart/table alternatives. |
| Comparison row context, insufficient coverage separated | Only the table container's keyboard semantics change. Both locales retain the same values, denominators, coverage groups and caveats; the existing comparison tests pass. |

All 272 data records were searched for references to the old/new Phase 7 record
digest and the refreshed sources. No downstream record binds Phase 7. Phase 8
also binds `tests/explore.test.tsx`, but its criterion describes a historical
deployed-map observation, so that record was not refreshed.

Two existing evidence gates therefore remain failed:
`check:deployed-map-render` and `check:phase8-launch-readiness-exit-status`.
The new map client has not been deployed or observed at the live Site; E4 is
owned by the widening workstream. The first unfiltered full unit run passed
1,717 tests, failed five binding assertions and retained four existing skips.
Two failures came from the subsequently corrected Phase 7 engineering bindings;
the other three come from the unchanged deployed/Phase 8 evidence.

Lint also reports four `jsx-a11y/no-noninteractive-tabindex` errors on the
`tabIndex={0}` required by U3. The browser suite confirms these named regions
are keyboard-scrollable and pass axe. Existing components contain exceptions
for this pattern, but the execution prompt forbids adding checker exclusions.
This change adds no exception, changes no lint rule and does not disguise the
tab stops. The lint conflict remains a blocker for the draft PR.

The inherited assurance branch also has unresolved JS/TS CodeQL and historical
gitleaks findings. Passing local browser tests does not make the required CI
job green or close an external accessibility/security criterion.

Phase 8 remains byte-identical at 8/16. Observability claims and all six
province-series files are unchanged; `check:phase2-province-series` passed.
No source checker, historical observation, owner-admitted checksum, production
artifact or file under the SSD data root was changed. Full source-reading
suites run with an explicit filesystem rule denying all writes under the SSD
data root. This change performs no deployment.
