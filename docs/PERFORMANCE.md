# Performance gates

After `next build`, CI runs three source-policy gates and one artifact-size gate.

- Claim templates reject prohibited attribution, wildfire prediction, and comparative superlative terms.
- TSX files under `app/` and `components/` reject raw hexadecimal colours. CSS token declarations remain the colour source.
- The artifact check reads Next.js build and client-reference manifests under `.next`, attributes emitted chunks to their routes, and follows lazy chunk references. Every emitted JavaScript chunk must be attributable. Framework-only chunks are excluded; chunks shared with application modules count in full. Explore-only chunks count against the 400 KB Explore limit; all other application chunks count against the shared limit. Raw and gzip totals are reported.
- On 2026-10-02 the owner approved increasing the shared gzip limit from 100 KB to 128 KB for the Vercel migration. This supersedes the 100 KB artifact threshold in the original plan; the 400 KB Explore limit and other release gates are unchanged.
- On 2026-10-28 the owner wrote "The bundle limit can be raised as necessary." The Compare riding typeahead took the measured shared total to 133,352 gzip bytes, so the shared limit is now 136 KiB (139,264 bytes), the measured figure rounded up to the next 4 KiB with headroom. The 400 KB Explore limit and other release gates are unchanged.

The gate never skips a missing, malformed, or unattributable manifest. A zero-byte Explore measurement is valid only when no Explore client artifact exists and the route remains server-only; the gate checks that source explicitly. The current Explore client island has a non-zero measured budget. These gates model gzip-compressed artifact bytes, but do not measure live network conditions, LCP, accessibility tooling, or manual accessibility review; those require separate browser and human checks.

## Explore first paint, 2026-10-28

Measured locally under `next start` at 1280×812 in Chromium (medians of 7 runs; "slow 4G" adds 4× CPU throttling). Not a measurement of the deployed Site.

| Profile | Legend shown | First tile request | Map ready |
| --- | --- | --- | --- |
| Unthrottled | 795 → 42 ms | 169 → 127 ms | 795 → 871 ms (noise) |
| 150 ms RTT, 20 Mbps | 2133 → 346 ms | 1176 → 1046 ms | 2133 → 2179 ms |
| Slow 4G | 7781–10226 → 662 ms | 5876 → 3442 ms | 7781–10226 → 7767 ms |

- The legend is now drawn while the map loads, so it arrives in the server's HTML. The map box no longer jumps down 328 px when the map becomes ready (23 px now). FCP, LCP and CLS are unchanged (CLS was already below 0.05, because the shift was below the fold).
- The page names the tile origin in a preconnect hint, and the archives the first view reads are opened on the PMTiles protocol while MapLibre loads, so the archive headers no longer wait for MapLibre.
- Time to a drawn map is unchanged within noise. On slow links it is gated by the MapLibre chunk (about 281 KB gzip), then the worker's shared module. Prefetching the worker at hydration and serving `public/maplibre/6.9.0/` with an immutable cache are the next candidates; neither is done.
- Vercel Web Analytics now renders only when `VERCEL` is set. Before, every page served by `next start` (local checks, CI smoke tests) requested `/_vercel/insights/script.js`, which only Vercel serves: a 404 and a refused script. `tests/browser/explore-requests.spec.ts` fails on any failed Explore request.
