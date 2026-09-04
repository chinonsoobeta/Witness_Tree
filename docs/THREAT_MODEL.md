# Threat model

This is a repository engineering assessment of the current technical preview.
It is not an external security review, production sign-off, legal approval or
evidence that an incident was handled. Phase 8 security review remains failed.

## Assets and actors

The assets are the integrity and provenance of measured forest-loss claims,
unpublished/admission-gated artifacts, the sole SSD data copy, deployment
authority, server-only provider credentials, and any reader-supplied location.
Readers, public data publishers, contributors, dependency maintainers, GitHub
automation, the Site owner and the Sites operator have different capabilities.
Public access to a map does not grant authority to change its data or deploy it.

## ChatGPT Sites control plane

Deployment authority crosses from the owner's account and Sites control plane
to a Cloudflare Worker and public assets. Merging a GitHub pull request does not
update the live Site. Deployments are control-plane-only owner actions.
GitHub workflow tokens must never be treated as Site deployment credentials.

The concrete threats are stolen source credentials or bypass tokens, a compromised
owner session, a malicious dependency/build, and a deployment that does not match
the source or immutable release it claims. Source credentials and bypass tokens
must stay out of source, Git remotes, logs, receipts and artifacts. The build
and evidence gates bind the code and published artifacts; observed deployed
revision and map-render receipts remain distinct from local test results.

The Worker keeps provider credentials behind server routes, uses `no-store` for
location-dependent endpoints, restricts browser connection origins, denies
framing, and sends content-type, referrer and transport security headers.
Its CSP currently allows inline script and style for hydration. Those allowances
remain an XSS risk boundary; no claim of strict CSP enforcement is made.
The control plane's account security, deployment approval, secret rotation,
operational logs and incident response still need an independent review.

## Public PMTiles and GeoJSON artifacts

Immutable public delivery URLs cross an untrusted network into the map parser,
worker and browser rendering context. They are public data, not confidential
storage. CORS controls browser reading behavior, not who can download the data.

Threats include substituted or stale artifacts, misleading source attribution,
oversized/decompression-heavy responses, malicious geometry, compromised parser
dependencies, and treating partial coverage as complete. Exact URL and checksum
bindings, range-response checks, file and artifact budgets, source provenance,
coverage grades, worker asset verification and admission gates constrain these
risks. The annual moving-mask measurements and fixed-1984 cumulative union keep
their separate bases; unadmitted province-series data is not production eligible.
No automation here changes source rights, owner admission or immutable releases.

Failure must leave an honest fallback or unknown state, preserving figures and
their limits. Local browser checks do not prove the deployed CDN or map. An
independent assessment should exercise hostile payloads, resource exhaustion,
cache behavior, supply-chain compromise and the live deployment boundary.

## SSD data root

The root `/Volumes/Extended_SSD/Witness_Tree-data` crosses from external publishers
and owner-run acquisition tools into local evidence and transformation jobs.
It is the sole copy. Loss, silent corruption, accidental overwrite, symlink
redirection, interrupted transformations and unauthorized admission are the
concrete risks. Historical receipts and owner-bound checksums are not rewritten
to make verification pass.

Read-only verification, explicit execution authorizations, strict path handling,
checksums, deterministic readbacks and fail-closed evidence gates protect
integrity. The new inventory hashes regular files and link text without following
symlinks or writing source bytes. Its output must be outside all data-root aliases.
Unavailable data is not passed, and a checksum mismatch remains a failure.
The manifest detects differences; it is not a backup, retention policy, atomic
snapshot or successful recovery. The backup and restore position is described in
`docs/DATA_INTEGRITY.md` and remains unresolved for the sole local copy.

## Automated checks and their limits

The required `verify` job depends on CodeQL for JavaScript/TypeScript, Python and
GitHub Actions, and on a checksummed gitleaks 8.30.1 scan of full Git history.
CodeQL findings fail the SARIF gate. Gitleaks uses complete redaction in logs and
its JSON artifact; no matched secret should be printed during triage. No finding
is suppressed by an exclusion or an exit-zero override. Existing production
`npm audit --omit=dev --audit-level=high` and whole-tree critical gates remain.
Development dependency advisories remain visible in the existing full report.

```sh
npm run check:security-scans
npm audit --omit=dev --audit-level=high
gitleaks git --redact=100 --no-banner --exit-code 1 --report-format json --report-path /tmp/gitleaks-review.json --log-opts="--all" .
```

Do not copy matched credentials into an issue or artifact. If an actual secret is
found, notify its owner with the path/rule only and arrange revocation through the
appropriate owner process; do not rewrite history or assume deletion revokes it.
The scanners can detect some defects. They cannot certify the trust boundaries,
establish an external review, or authorize a deployment. Implementation follows
[CodeQL workflow documentation](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options)
and the [gitleaks release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1).

## Implementation verification, 2026-09-04

The configuration and SARIF rejection tests passed with
`npm run check:security-scans` and `node --test tests/ci-check-coverage.test.mjs`.
The production dependency audit passed with zero advisories. The local full-history
gitleaks run exited 1 with 62 findings across 809 commits. All secret fields were
redacted. Of the matching historical lines, 41 contain SHA-256-shaped values,
one is in an AWS-token test fixture, and 20 need further contextual review.
Those shapes do not dismiss a finding or prove credential exposure. No exclusions,
history rewrites or secret values were introduced during triage. The scan remains
failed, and this security-scanning task cannot be reported green.

The required `verify` job runs even when a security prerequisite fails, then
explicitly requires both security results to be successful. This preserves the
other checks' diagnostics and prevents a skipped dependent job from satisfying
the required check. CodeQL execution is verified separately by the pull request
workflow; the static configuration check does not claim CodeQL has run.

The workflow's engineering bindings in the Phase 0 and Phase 3 status records
were refreshed only after `check:persistent-identifiers`, `check:budgets`,
`check:accessibility` and `check:bilingual` passed and their stated reasons were
re-read. Their counts stay 7/8 plus one owner exclusion, and 4/5 respectively.
No downstream data record binds either status record. Phase 8 remains 8/16,
Phase 9 remains 0/4, and `check:data-root-test-currency` still validates the
unchanged receipt for 28 owner-bound tests. Historical and owner-admitted records
were not rebound.

The first GitHub CodeQL execution passed for Python (zero findings). It found
one missing-permissions declaration in the existing `verify` job; the job now
explicitly receives only `contents: read`. JavaScript/TypeScript reported seven
findings: three URL-substring checks in `scripts/check-address-lookup.mts`, the
deployed-origin prefix check in `scripts/check-deployed-map-render.mjs`, one
test helper in `tests/phase1-federal-electoral-output-verification.test.mjs`, and
two test helpers in `tests/shape-measure-ui.test.tsx`. They remain unsuppressed.
The deployed-render gate belongs to E4 in the other workstream, and these
existing checkers and fixtures were not modified as part of adding the scanner.
