# Phase 3 built-browser audit

**Boundary:** example, unapproved and nonproduction. This evidence does not approve content, data, release or deployment.

`npm run audit:phase3-browser` starts the already-built application and a clean local Chrome/Chromium profile. It audits paired English/French place and coordinate-location pages plus paired methods, data, glossary, corrections and search pages: 14 routes across seven templates. CI runs the same gate after the production build.

The declared simulated-4G profile is unchanged: 150 ms latency, 1.6 Mbit/s download and 750 kbit/s upload, with cache disabled and no CPU throttling. A real Largest Contentful Paint observer must report strictly below 2,000 ms. Each English/French place route is measured twice with a cold browser cache; every other route is measured once. The committed bounded observation in [`data/phase3-browser-audit-summary.json`](../data/phase3-browser-audit-summary.json) records the exact Chrome and axe versions, every run and the slowest result. This is local laboratory evidence, not field performance.

Each route must also pass WCAG 2.0 A/AA, 2.1 A/AA and 2.2 AA axe rules with zero violations; expose named banner, navigation, main and content-info structure; and identify both document and content language. The first Tab must reveal the skip link and Enter must focus `main`. From that target the audit visits every focusable control exactly once in DOM order, permits at most the browser's single non-control wrap transition, and verifies the cycle returns to its first expected stop. Forced-colours checks require readable main content, links distinguished from their surrounding text, and cue elements with visible geometry, visible labels, visible shapes/bars and explicit semantic variants. Every place and location route exercises multiple evidence-shape variants and multiple evidence/confidence cue instances. True 320 CSS-pixel layout must have zero page-level horizontal overflow; wide navigation and tables may scroll only inside their expected bounded regions. Each generated/search/content `main` remains an explicit programmatic skip target.

The version 3 evidence validator binds every row to its exact template, locale and route; exact document/content language; Chrome, protocol and axe metadata; non-null LCP element; complete focus and landmark counts; cue variants; local-scroll count; summary; and unchanged exclusions. Negative tests reject drift in each field. Evidence is written only after the complete runtime result passes this validator.

The gate deliberately excludes screen-reader output, human visual review, human forced-colours and CVD review, field performance and user-specific browser extensions. Those require separate human/browser evidence and are not inferred from axe or the Chrome protocol.

## Large map chunk

The remaining build warning is the isolated MapLibre client chunk: approximately 976 kB minified before compression. It is already dynamically loaded only by the explore map, and the existing client-graph gate measures the MapLibre/PMTiles path at about 273 kB gzip, below its 400 kB limit. Removing the warning cleanly would require replacing or materially rebuilding the map library; raising the warning threshold would only hide it. This batch therefore records the warning without claiming a reduction.

This correction batch changes only the demonstrated browser criteria above. It does not claim rubric credit, content approval, usability-checkpoint completion, real-data maturity, release readiness or deployment.
