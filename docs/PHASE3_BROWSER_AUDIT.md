# Phase 3 built-browser audit

**Boundary:** example, unapproved and nonproduction. This evidence does not approve content, data, release or deployment.

`npm run audit:phase3-browser` starts the already-built application and a clean local Chrome/Chromium profile. It audits paired English/French place and coordinate-location pages plus paired methods, data, glossary, corrections and search pages: 14 routes across seven templates. CI runs the same gate after the production build.

The declared simulated-4G profile is 150 ms latency, 1.6 Mbit/s download and 750 kbit/s upload, with cache disabled and no CPU throttling. A real Largest Contentful Paint observer must report at most 2,500 ms on every route. The committed bounded observation in [`data/phase3-browser-audit-summary.json`](../data/phase3-browser-audit-summary.json) used Chrome 151 and axe-core 4.11.4; all 14 routes passed, with a maximum LCP of 2,176 ms. This is local laboratory evidence, not field performance.

Each route must also pass WCAG 2.0 A/AA, 2.1 A/AA and 2.2 AA axe rules with zero violations; expose named banner, navigation, main and content-info structure; identify the localized content language; reveal the skip link on the first Tab; move focus to `main`; retain named controls through a ten-stop keyboard sample; remain available in forced-colors mode; and have zero page-level horizontal overflow at 200% browser scale. The checksum text uncovered by this audit now wraps at narrow widths, and each generated/search/content `main` is an explicit programmatic skip target.

The gate deliberately excludes screen-reader output, human visual review, field performance and user-specific browser extensions. Those require separate human/browser evidence and are not inferred from axe or the Chrome protocol.

## Large map chunk

The remaining build warning is the isolated MapLibre client chunk: approximately 976 kB minified before compression. It is already dynamically loaded only by the explore map, and the existing client-graph gate measures the MapLibre/PMTiles path at about 273 kB gzip, below its 400 kB limit. Removing the warning cleanly would require replacing or materially rebuilding the map library; raising the warning threshold would only hide it. This batch therefore records the warning without claiming a reduction.

The official independent Phase 3 baseline after `525f849` is 57%. This browser batch is conservatively assessed as **+2 points, 57% to 59%**, subject to independent audit: +1 for reproducible real-browser accessibility/performance CI and +1 for bounded checkpoint evidence. It does not repeat the fixture-capped public-surface score.
