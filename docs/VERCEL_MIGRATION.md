# Vercel migration

This branch migrates the application tree recorded for Sites version 48,
GitHub commit `d9432b8e36be3f48a922d194618ff9840a5640a9`, to Next.js on Vercel.
It does not include later application changes on `main` or change data admission
and release records.

## Runtime

Run `npm ci`, `npm run build`, and `npm run start`. Vercel uses the Next.js
framework preset with the default build and output settings.

The five API routes reuse the existing handlers in `worker/`. The Next.js proxy
sets page feature flags from server configuration and overwrites caller-supplied
flags. The security headers formerly applied by the Worker now come from
`next.config.ts`.

Copy the existing non-secret `COARSE_GRID_BASE` setting to the Vercel project:

```
https://d3g1406o0uekin.cloudfront.net/releases/phase6-coarse-grid-v1/0d58b35643f7f8033d2d9e1651c34b065cf4168a947c35987beb32cf1393be8c/tiles/
```

The existing Sites environment has no district-index or address-provider
configuration. Those features remain unavailable. No database or new storage
is provisioned. The external tile and download origins remain in use.

## Validation and cutover

Before switching the domain, verify `/en`, `/fr`, both Explore routes, methods,
harvest and fire pages, search suggestions, district spans, and drawing.
Inspect the map in both languages and both themes. Preserve the previous Sites
deployment until Vercel and the custom domain work.

Do not interpret this hosting change as closure of formal release or launch gates.
