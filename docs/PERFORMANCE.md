# Performance gates

After `vinext build`, CI runs three source-policy gates and one artifact-size gate.

- Claim templates reject prohibited attribution, wildfire prediction, and comparative superlative terms.
- TSX files under `app/` and `components/` reject raw hexadecimal colours. CSS token declarations remain the colour source.
- The artifact check reads `dist/client/.vite/manifest.json` and requires every reachable manifest artifact. It measures gzip-compressed JavaScript transfer bytes for the complete reachable non-framework application/bootstrap graph as shared/no-map, including the entry chunk even if its filename is `index`. Entries explicitly identified as framework chunks by manifest metadata are excluded. Chunks whose manifest key, name, or source contains Explore are measured against the separate 400 KB Explore limit; all other non-framework chunks use the 100 KB shared limit. Raw byte totals are reported alongside gzip totals for transparency, but the limits apply to gzip transfer bytes.

The gate never skips a missing, malformed, or unattributable manifest. A zero-byte Explore measurement is valid only while `app/en/explore/page.tsx` remains server-only (no `'use client'` directive); the gate checks that source explicitly. These gates model gzip-compressed artifact bytes, but do not measure live network conditions, LCP, accessibility tooling, or manual accessibility review; those require separate browser and human checks.
