# Dependency audit

CI audits dependencies three times, and the split is deliberate.

The **shipped tree is the blocking surface**. `npm audit --omit=dev
--audit-level=high` runs against production dependencies only, and any high or
critical advisory reaching a package a visitor's browser executes fails the
branch. On 2026-09-01 that tree was 32 packages with zero advisories at every
severity, so the gate starts clean and is a genuine ratchet.

The **whole tree is audited at critical**, so a critical advisory anywhere,
build tooling included, still stops the branch.

The **full report always prints**, non-blocking, so no advisory is ever hidden
from a reader of the log.

This is a scope, not a lowered threshold. Production is held at high, and the
narrower `--omit=dev` command is pinned by a test that also asserts its level is
never reduced below high.

## Why the build toolchain is not a blocking surface

The six residual high advisories are `@cloudflare/vite-plugin` and `wrangler`,
both devDependencies, plus `miniflare`, `sharp`, `undici` and `ws`, which are
transitive under them. None appears in `dependencies`. They run on this runner
and on the owner's machine during development and build; none is served to a
visitor. That is the reason the gate treats them differently, and if any of them
ever moves into `dependencies` the blocking command starts covering it
automatically.

The remaining risk is real for a developer machine and is not dismissed. It is
resolved by the upgrade below, which stays outstanding.

## Unresolved high-severity upgrade recorded 2026-08-31

The available Cloudflare remediation requires upgrading
`@cloudflare/vite-plugin` from 1.37.1 to 1.54.2 and `wrangler` from 4.92.0 to
4.127.1. Their peer requirements also move `@cloudflare/workers-types` from
the v4 line to the v5 line. That combined upgrade was tested and left
unapplied because `npx tsc --noEmit` produced 13 errors in the phase 2
readback scripts and `tests/site-metadata.test.ts`. The errors include
incompatible `Buffer` constructor signatures and missing
`NonSharedBuffer.readUInt32BE` typing.

This is not an audit exception or suppression. The high-severity CI gate
remains active and therefore fails until the Cloudflare type migration can be
made without breaking the required typecheck.

With the compatible upgrades applied, the locked tree reports 10 package-level
findings: 6 high and 4 moderate. The six high entries are the connected
Cloudflare development-tooling chain (`@cloudflare/vite-plugin`, `wrangler`,
`miniflare`, `sharp`, `undici`, and `ws`).

## Known moderate exception recorded 2026-08-31

After applying the available non-breaking fixes, `npm audit` reports four
moderate findings in one development-only chain:

`drizzle-kit` -> `@esbuild-kit/esm-loader` ->
`@esbuild-kit/core-utils` -> `esbuild`

The installed direct dependency is `drizzle-kit` 0.31.10. npm classifies its
only automated remediation as a breaking change that would replace it with
0.18.1. That database-tooling change requires separate migration validation
and is outside this non-major dependency remediation. This moderate exception
does not lower the high-severity CI threshold or hide any audit output.
