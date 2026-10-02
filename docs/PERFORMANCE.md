# Performance gates

After `next build`, CI runs three source-policy gates and one artifact-size gate.

- Claim templates reject prohibited attribution, wildfire prediction, and comparative superlative terms.
- TSX files under `app/` and `components/` reject raw hexadecimal colours. CSS token declarations remain the colour source.
- The artifact check reads Next.js build and client-reference manifests under `.next`, attributes emitted chunks to their routes, and follows lazy chunk references. Every emitted JavaScript chunk must be attributable. Framework-only chunks are excluded; chunks shared with application modules count in full. Explore-only chunks count against the 400 KB Explore limit; all other application chunks count against the shared limit. Raw and gzip totals are reported.
- On 2026-10-02 the owner approved increasing the shared gzip limit from 100 KB to 128 KB for the Vercel migration. This supersedes the 100 KB artifact threshold in the original plan; the 400 KB Explore limit and other release gates are unchanged.

The gate never skips a missing, malformed, or unattributable manifest. A zero-byte Explore measurement is valid only when no Explore client artifact exists and the route remains server-only; the gate checks that source explicitly. The current Explore client island has a non-zero measured budget. These gates model gzip-compressed artifact bytes, but do not measure live network conditions, LCP, accessibility tooling, or manual accessibility review; those require separate browser and human checks.
