# Static-map status and retry

The fallback status now tells readers that a static map is shown, the figures
below are unaffected, and they can retry the interactive map. English and French
carry the same meaning for errors and timeouts. If both map sources fail, the
copy does not claim a static map is visible. The existing retry control is reused.
The hidden MapLibre container is inert during loading and retry so its injected
canvas cannot receive keyboard focus while hidden from assistive technology.

```sh
npm run build
npm run test:playwright -- tests/browser/fallback.spec.ts
npm run test:playwright
```

The fault-injection tests run in both locales, light and dark themes, and at
375, 768 and 1280 pixels. They abort or delay tile requests, serve the exact
published static-map bytes only after verifying the pinned SHA-256, and also
exercise failure of both sources. They verify the status, static map, keyboard
retry, a new network attempt, unchanged table figures and coverage language,
and refusal of keyboard focus by the hidden canvas. These are local tests,
not a deployed-map observation, outage evidence or new admission.

## Verification and blockers, 2026-09-04

All 36 fallback cases passed. The combined Playwright run passed 64/72 and failed
eight Compare accessibility cases at 375 and 768 pixels. Explore's earlier
`aria-hidden-focus` findings are cleared. The Compare table focus corrections
remain held with group 2 until the owner says U1 has landed.

Rendered screenshots confirm the new copy and focus ring in both themes. At
375 and 768, the existing Explore horizontal overflow still clips portions of
the message and map. This is the known U1/layout prerequisite, not a passed
responsive assessment; no CSS was changed by this group.

The production build and typecheck passed, as did targeted ESLint. Of the 122
CI npm checks, 120 passed and two failed: `check:deployed-map-render` and
`check:phase8-launch-readiness-exit-status`. Both reject the changed map-client
checksum. The portable suite passed 1,539 assertions, failed three deployed/Phase
8 evidence assertions, and retained four skipped subtests and 28 excluded files.
No checker, historical observation or owner-admitted checksum was edited.

The stored Phase 8 count is still 8/16, but its gate is explicitly failed for
this branch until the other workstream's E4 evidence path can validate the new
client. This group is therefore a draft and cannot be reported complete or
merged on the strength of the local browser tests. It depends on the assurance
branch's Playwright setup. The six province-series files, their admission claims,
observability claims, periods, quantities and data bases remain unchanged.
