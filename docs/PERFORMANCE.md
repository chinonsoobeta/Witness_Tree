# Performance gates

After `vinext build`, CI runs three source-policy gates and one artifact-size gate.

- Claim templates reject prohibited attribution, wildfire prediction, and comparative superlative terms.
- TSX files under `app/` and `components/` reject raw hexadecimal colours. CSS token declarations remain the colour source.
- The artifact check reads `dist/client/.vite/manifest.json` and requires every reachable manifest artifact. It measures gzip-compressed JavaScript transfer bytes for the complete reachable non-framework application/bootstrap graph as shared/no-map, including the entry chunk even if its filename is `index`. Entries explicitly identified as framework chunks by manifest metadata are excluded. The transitive dependency graph rooted at the named Explore client island is measured against the separate 400 KB Explore limit; static entry dependencies stay in the 100 KB shared limit. This keeps dynamically imported MapLibre and PMTiles in the route budget instead of misclassifying them as shared code. Raw byte totals are reported alongside gzip totals for transparency, but the limits apply to gzip transfer bytes.

The gate never skips a missing, malformed, or unattributable manifest. A zero-byte Explore measurement is valid only when no Explore client artifact exists and the route remains server-only; the gate checks that source explicitly. The current Explore client island has a non-zero measured budget.

`npm run measure:phase3-static` is a reproducible post-build local diagnostic for representative static English and French place, coordinate-location, methods, data/source-ledger, glossary and corrections routes. It warms each route, verifies a complete no-JavaScript HTML response, measures local render/serialization time and raw/gzip HTML bytes, and reports a transfer-time envelope using a declared 150 ms round trip and 1.6 Mbps downstream. The gzip ceiling is a deterministic gate; local timing is reported but is not gated because host load varies.

The simulated-4G value is arithmetic, not a network emulation or field result. Without an installed rendering browser this repository cannot measure LCP, paint, layout stability, keyboard behaviour in a browser, assistive-technology output, CVD perception, or manual accessibility quality. The harness reports LCP as unavailable and the Phase 3 validation record keeps these browser/human checks open.
