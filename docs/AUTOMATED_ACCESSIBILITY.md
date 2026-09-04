# Automated accessibility observations

```sh
npm ci
npm run build
npx playwright install chromium
npm run test:playwright
```

The local production build is scanned on `/en`, `/fr`, `/en/explore`,
`/fr/explorer`, `/en/compare`, and `/fr/comparer`, in light and dark themes at
375, 768 and 1280 pixels. The scan waits for hydration, the actual theme control
and fonts. Every axe rule tagged WCAG A/AA through 2.2 is enabled, and any
violation fails the test. No rule, element, impact level or route is excluded.

Each run creates a new timestamped directory under ignored `outputs/playwright/`,
preserving earlier failed observations. The Playwright report contains a JSON
observation and rendered screenshot for each scan, along with the exact axe
engine version, timestamp, viewport, incomplete findings and explicit non-claims.
CI preserves the output even when tests fail. Browser errors or missing results
are failures, not accessibility passes. The test server is local; no deployment
is performed by this suite.

Automated checks cannot establish conformance. Incomplete findings require
human assessment, and an independent audit, assistive-technology review and
professional bilingual review remain outstanding. Phase 8's external audit
criterion and its 8 of 16 completed count remain unchanged. The existing static
contract gate remains required alongside this rendered check.

The implementation uses Playwright's
[documented axe integration](https://playwright.dev/docs/accessibility-testing).

## Implementation observation, 2026-09-04

The first local run passed 16 cases and failed 20. After making the evidence
directory unique per run, the final configuration passed 17 and failed 19.
Explore reports `aria-hidden-focus` while the hidden MapLibre canvas is loading;
whether that transient state is still present at scan time changes one result.
Compare reports `scrollable-region-focusable` on its table containers at 375 and
768 pixels in both locales and themes. These are failures, not excluded findings.
The table correction belongs to the responsive group held for the widening's U1
notice. The map loading state belongs with the separately reviewed fallback work.
The new gate is implemented, but it is not green and this task is not complete.

`npm run build`, `npx tsc --noEmit`, `npm run lint`, the existing static
`check:accessibility`, `check:bilingual` and `check:budgets` gates passed.
`npm run test:suite` passed 1,542 assertions with four skipped subtests and the
existing 28 excluded files; that portable result does not claim a full SSD run.
