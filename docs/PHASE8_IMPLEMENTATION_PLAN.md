# Phase 8 implementation plan: six launch-readiness gates under ChatGPT Sites hosting

> Execution update, 2026-08-28: the CDN/tile section of this planning record has now been implemented for the admitted province-level technical-preview layer. The immutable PMTiles archive is delivered from a private Canadian AWS origin through CloudFront, and its exact live range/readback evidence is recorded in `data/phase8-public-delivery-evidence.json`. Statements below that describe tiles or a CDN as absent are retained as the pre-execution rationale, not the current state.

This is a plan. It implements nothing, records no evidence, and changes no
file under `data/`. Every statement about current state cites a file in this
repository that was read to write it.

It covers exactly six of the sixteen Phase 8 exit criteria in
[`data/phase8-launch-readiness-exit-status.json`](../data/phase8-launch-readiness-exit-status.json):
`load-testing`, `raw-archive-reproducibility`, `bulk-downloads`,
`observability`, `backups`, and `cdn-tile-validation`. It does not cover
`operations-handbook`, which is owned elsewhere, and it does not cover the
five gates whose blockers are people rather than infrastructure.

No human review, audit, or sign-off is assumed to have happened. Where a step
needs an owner decision, the step says so and stops there.

## The hosting constraint

The site is to be deployed entirely on ChatGPT Sites. That single decision
determines which of these six gates can close and which cannot.

What the repository shows about hosting today:

- [`.openai/hosting.json`](../.openai/hosting.json) carries a hosting project
  ID and sets both `d1` and `r2` to `null`. The host holds no database and no
  object store for this project.
- [`worker/index.ts`](../worker/index.ts) is still a Cloudflare Worker entry
  point, and `package.json` still depends on `wrangler` and
  `@cloudflare/vite-plugin`. The build is `vinext build`. The runtime target
  named in the code and the hosting record named in `.openai` do not agree.
- [`docs/PLAN_GAP_MATRIX.md`](PLAN_GAP_MATRIX.md) line 5 describes a deployed
  site, and calls it a technical preview using illustrative data.

Three layers matter for these six gates, and the hosting choice splits them:

| Layer | Where it can live | Consequence |
| --- | --- | --- |
| Pages, routes, HTML, JavaScript bundles | ChatGPT Sites | No origin controls, no logs, no cache configuration, no capacity levers |
| Tiles and bulk artifacts | AWS `ca-central-1` object storage behind a CDN | Fully under project control |
| Raw archive and its recovery copy | AWS `ca-central-1` object storage, already provisioned | Fully under project control, and independent of the site |

Three of the six gates (`raw-archive-reproducibility`, `backups`, and the
archive half of `observability`) never touch the web tier at all. They are
unaffected by the hosting choice and were never blocked by it. Two
(`bulk-downloads`, `cdn-tile-validation`) can be satisfied for the delivery
tier by moving that tier to AWS, at the cost of a cross-origin dependency the
host may not permit. One (`load-testing`) cannot be satisfied as written while
the site tier is hosted by a third party, and this plan says so rather than
proposing a substitute.

### Step 0, before anything else: a recorded capability probe

Nothing below should be built on an assumption about what ChatGPT Sites can
do. The repository contains no record of the host's capabilities, and this
plan does not invent one. The first executable step is a probe whose result is
written down, including the questions that came back unanswered.

Probe, against the deployed site, from outside:

1. Does a response carry a cache header, an ETag, or an age header, and are
   any of them configurable from this repository?
2. Does the host honour HTTP range requests (`Range: bytes=0-16383`) on a
   large static asset, and does it answer `206`? PMTiles is unusable without
   this.
3. What is the largest static asset the host will serve, and is there a
   published limit?
4. Is there a Content-Security-Policy on served pages, and does its
   `connect-src` permit `fetch` and `XMLHttpRequest` to an arbitrary HTTPS
   origin such as a CloudFront distribution?
5. Are request logs, request counts, error rates, or an uptime signal exposed
   to the project in any form?
6. Is there a documented availability target or status page?
7. Do the host's terms permit a synthetic load test against the deployed site?

Record the answers in `data/site-hosting-capability-probe.json` with the probe
instant in UTC, the exact request made, the observed response headers, and an
explicit `unknown` for every question the probe could not answer. An
unanswered question is Unknown, never absent and never satisfied, on the same
rule as [`docs/DATA_ROOT_BOUND_CHECKS.md`](DATA_ROOT_BOUND_CHECKS.md).

Question 4 is the load-bearing one. If the host's CSP blocks cross-origin
fetches, then tiles and bulk downloads cannot be served from AWS to a page on
ChatGPT Sites at all, and `cdn-tile-validation` has no achievable form under
this hosting choice. Do not start the tile work before that answer exists.

## How a Phase 8 gate actually flips

[`scripts/check-phase8-launch-readiness-exit-status.mjs`](../scripts/check-phase8-launch-readiness-exit-status.mjs)
constrains any change to the status record, and every proposal below has to
survive it:

- Every criterion needs at least one evidence entry whose `path` resolves
  inside the repository and whose `sha256` matches the file's real bytes. An
  evidence file that lives only on the SSD or only in S3 cannot be cited.
- `completedCriteria`, `totalCriteria`, and `percentage` are recomputed from
  the pass count, and `localImplementationStatus` and `phaseComplete` are
  derived. They cannot be edited independently.
- All six `externalBlockers` must stay `blocked`. The checker rejects any
  other value. A criterion may pass while a blocker naming the same subject
  remains blocked, and for `bulk-downloads` and `cdn-tile-validation` that is
  exactly what would happen: `admitted-production-data-and-delivery` covers
  "bulk artifacts, CDN/tile deployment, and live validation" and cannot be
  cleared by engineering. Whoever flips those two criteria has to explain that
  coexistence, and it is an owner call, not a checksum edit.
- `nonProductionBoundary` must still match `/technical preview|illustrative
  data/i`. Its current text enumerates "bulk download, CDN, or tile
  validation" among the things not claimed, so flipping either of those two
  criteria requires rewriting that sentence while keeping the preview
  language intact.

Every new evidence file below is paired with a repository-only checker, with
no cloud client and no write path, on the pattern of
[`scripts/check-immutable-restore-drill.mjs`](../scripts/check-immutable-restore-drill.mjs)
and
[`scripts/check-archive-operations-readiness.mjs`](../scripts/check-archive-operations-readiness.mjs).
Each new checker gets an `npm run check:` script and a line in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

---

## 1. `load-testing`

**What the gate says.** "Artifact budgets do not measure a deployed service or
establish the required 50× load-test result."

**What the plan demands.** [`docs/CONTROLLING_IMPLEMENTATION_PLAN.md`](CONTROLLING_IMPLEMENTATION_PLAN.md)
line 1599: "Load test at 50 times normal traffic, which is the news cycle
case." Line 1617, as a Phase 8 exit criterion: "The load test holds with the
CDN in place." Line 1773 repeats it as a launch test.

**Current state.** [`scripts/check-budgets.mjs`](../scripts/check-budgets.mjs)
reads `dist/client/.vite/manifest.json`, gzips each reachable artifact, and
compares the totals against `SHARED_LIMIT` (100 KB) and `EXPLORE_LIMIT`
(400 KB). It never opens a socket. [`docs/PERFORMANCE.md`](PERFORMANCE.md)
already says so in its own words: the gates "do not measure live network
conditions, LCP, accessibility tooling, or manual accessibility review". The
gate's reason is accurate.

**A second problem the gate does not mention.** There is no baseline. A grep
across `app`, `lib`, `components`, and `package.json` finds no analytics, no
error reporting, and no request counter of any kind; the only hit for
"analytics" is a sentence in
[`components/governance/GovernancePage.tsx`](../components/governance/GovernancePage.tsx)
promising that saved areas will not be joined to analytics identifiers. "Fifty
times normal traffic" is a multiplication whose left operand does not exist.
Any figure produced today would be an assumption dressed as a measurement.
Fixing that is a prerequisite, and it belongs to `observability` below.

**Achievable on ChatGPT Sites.** Nothing that satisfies this criterion.

**Not achievable, and why.** A load test is a capacity experiment on a system
you can change. Firing 50 times an assumed baseline at ChatGPT Sites would
measure OpenAI's platform, not this project's. If it held, the result would be
a fact about a third party's spare capacity on the day, revocable without
notice and not reproducible on demand. If it failed, there would be no knob to
turn: no origin, no cache policy, no instance count, no autoscaling
configuration. On top of that, whether such a test is permitted at all is
probe question 7 and is currently unknown, and running an unpermitted load
test against someone else's infrastructure is not an option this plan will
propose.

**The honest options.**

1. Load test only the tier the project owns. Per
   `docs/CONTROLLING_IMPLEMENTATION_PLAN.md` line 641, "Tile pyramids dominate
   egress cost. Serve from a CDN and cache aggressively." The news-cycle spike
   lands mostly on tiles and downloads, and if those move to AWS as sections 3
   and 6 propose, that tier is testable in full. The result is real, but it
   covers the delivery tier only.
2. Record the criterion as constrained by the hosting choice. Leave it `fail`
   and correct its `reason` so it names the constraint instead of implying an
   unfinished task.
3. Defer until the site tier runs on infrastructure the project controls.

**Recommended sequence.** Do 1 and 2 together. Do not flip the gate.

1. Define the baseline explicitly, after `observability` produces a real
   request-rate number for the delivery tier, or, if the site tier remains
   unobservable, declare an assumed baseline in the evidence file with the
   word `assumed` in the field name and the reasoning beside it.
2. Write `scripts/load/delivery-tier-profile.js` describing one realistic
   Explore session: the PMTiles header request, a directory range request, the
   tile range requests for one viewport at the default zoom used by
   [`components/explore/ExploreMapClient.tsx`](../components/explore/ExploreMapClient.tsx)
   (`center: [-96, 56]`, `zoom: 2.6`), and one bulk CSV retrieval.
3. Run it against the CloudFront distribution from section 6 at 1x, 10x, and
   50x the recorded baseline, each for a fixed duration, from outside AWS.
4. Capture, per stage: requested and achieved requests per second, p50/p95/p99
   latency, HTTP status distribution, byte volume, CloudFront cache hit ratio,
   and origin request count.
5. Write `data/load-test-delivery-tier.json`: schema version, tool and version,
   distribution identifier (non-secret), start and end instants in UTC, the
   baseline and whether it was measured or assumed, the request mix, the
   per-stage results, and a mandatory `coverage` object stating that the site
   tier at the ChatGPT Sites host was not measured and cannot be.
6. Write `scripts/check-load-test-delivery-tier.mjs`: repository-only, pins the
   schema, requires every stage to carry all its fields, requires
   `coverage.siteTierMeasured` to be `false`, and refuses a `passed` status if
   any stage reports a 5xx or if the achieved rate fell short of the requested
   rate. It must reject a record that claims whole-site coverage.

**Evidence produced.** `data/load-test-delivery-tier.json`, validated by
`npm run check:load-test-delivery-tier`.

**What would have to be true for the gate to flip.** A single measured test at
50 times a recorded, non-assumed baseline covering the whole request path a
visitor actually makes, page included, against infrastructure the project can
change. Under ChatGPT Sites hosting that is unreachable. The gate flips when
the site tier moves, and not before. Until then the correct action is to
sharpen the `reason` text, not the status.

---

## 2. `raw-archive-reproducibility`

> **This gate is closed. This section is history, not work.** On 2026-08-27 the
> gate was closed by the cheaper federal electoral route, not by the Phase 2
> route described below. Nothing here needs doing. It is kept because it
> records why the expensive route was considered and set aside.

> **Read `docs/RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md` before acting on this
> section.** That document was written in parallel with this one, and neither
> author saw the other's work. It evaluates four reproduction candidates and
> recommends a different and much cheaper one: the federal electoral
> GeoPackage, 10.3 MB to download, one archived input, and a transform already
> proven byte-deterministic. It considers the Phase 2 province aggregate and
> rejects it explicitly.
>
> The route below promotes a new object into the archive and re-runs the
> admitted Phase 2 chain: roughly 60 GB restored, a new S3 promotion, and an
> owner retention decision. Both routes are internally sound, but they are not
> equivalent in cost or in reversibility. Compliance-mode Object Lock cannot be
> undone by anyone, including the account root, so a promotion made to satisfy
> this gate is permanent even if it later proves to have been unnecessary.
>
> Treat the cheaper route as the default and this one as the fallback.


**What the gate says.** "A read-only, version-pinned restoration of three
immutable raw snapshots recorded byte length, SHA-256, ZIP integrity, and
temporary-copy removal, but no complete admitted output has been reproduced
from the archive."

**What the plan demands.** `docs/CONTROLLING_IMPLEMENTATION_PLAN.md` line 1771:
"A random published figure is recomputed from the raw archive and the recorded
method version, and matches."

**Current state.** [`docs/IMMUTABLE_RESTORE_DRILL.md`](IMMUTABLE_RESTORE_DRILL.md)
and `data/immutable-restore-drill.json` record a version-pinned read-back of
three payloads. `scripts/check-immutable-restore-drill.mjs` asserts exactly
three entries, matching keys and version IDs, matching staged byte length and
SHA-256, `zipIntegrity: "passed"`, and `temporaryCopyRemoved: true`. It proves
readback. The gate's characterisation is correct.

**This criterion has nothing to do with hosting.** It runs on the SSD data root
and against S3. ChatGPT Sites does not enter it.

**What is already in place, and what is missing.** Two candidate chains exist,
and one of them is nearly complete:

- The Québec lossless copy. `docs/QC_WILDFIRE_TRANSFORMATION.md` describes
  `scripts/transform-quebec-wildfire.py`, which hashes the raw archive before
  doing any work and refuses unless it matches the staged checksum, and
  `data/transformation-runs/qc-historic-wildfire-v1-2026-08-12.json` records
  the run. Its raw input is one of the three locked payloads. But it is a
  lossless layer copy with no owner admission behind it, so reproducing it
  would not be "a complete admitted output".
- The Phase 2 Version 2.1 batch. `data/phase2-admission-record-2026-08-26.json`
  records an owner decision of `approve` for
  `phase2-v21-21-raster-and-2020-2022-province-aggregate-admission-v1`, binding
  21 rasters with their sidecars and the 13-row province aggregate. The
  aggregate itself is small and checksum-bound:
  `data/phase2-v21-province-zonal-pilot-evidence.json` records
  `province-2020-2022.json` at 3,131 bytes with SHA-256
  `ff1589029f30800021b52d9aa736b9aa9e122df70e3070d19a68f7aa45d9a16d`, produced
  by `scripts/phase2_zonal_aggregate.py` at a pinned worker SHA-256. Its raw
  inputs are the 39 VLCE2 annual payloads, and
  `data/vlce2-remote-promotion-evidence.json` records all 39 payload keys,
  version IDs, byte lengths, CRC64NVME values, and `COMPLIANCE` retention in
  the Canadian bucket.

So the admitted output has archived inputs. The one gap is the boundary file:
`data/boundary-editions.json` binds
`statcan-2021-provinces-territories-cbf` by checksum
(`lpr_000b21a_e.zip`, 133,730,024 bytes, SHA-256 `d28bbb15…`) but records no S3
key and no version ID. It is not in the immutable archive, so today the chain
cannot be closed from the archive alone.

**Sequence.**

1. Promote the boundary file into the archive under the existing contract in
   [`docs/IMMUTABLE_STORAGE_CONTRACT.md`](IMMUTABLE_STORAGE_CONTRACT.md). At
   133 MB it is a single PUT, so it can carry a full-object SHA-256 and does
   not need the composite path. Retention duration remains an owner decision,
   as `docs/IMMUTABLE_STORAGE_PROVISIONING.md` states; do not choose one.
2. Restore, read-only and version-pinned, exactly as the existing drill did:
   the 39 VLCE2 payload versions plus the boundary payload version, by key and
   `VersionId`, never by a current-version alias. This is roughly 60 GB and
   needs the SSD data root and an owner-run MFA role session.
3. Verify each restored payload against its recorded byte length and its
   recorded CRC64NVME or SHA-256 before any transform runs.
4. Re-run the raster pipeline (`scripts/run-phase2-v21-raster-first.mjs`) and
   then `scripts/phase2_zonal_aggregate.py` at the pinned worker SHA-256, into
   a fresh output directory, from the restored bytes only.
5. Compare every produced artifact against `artifactBindings` in
   `data/phase2-admission-record-2026-08-26.json`, byte length and SHA-256,
   and compare the aggregate against `ff1589…`.
6. Remove the temporary restore copies and record their removal, as the
   existing drill does.

**Known hazard to handle in step 4.** `docs/CHECK_DEFECT_AUDIT_2026-08-26.md`
records `run-phase2-v21-raster-first.mjs:70` as an unfixed "existence means
refuse" defect, with two `.failed-*` sibling directories as evidence of the
operational cost. A reproduction run writes to a new directory, so plan the
output path accordingly and expect the runner to refuse a re-run in place.

**Evidence produced.** `data/raw-archive-reproduction.json`: schema version,
the admitted record it reproduces and that record's SHA-256, every restored
payload key and version ID, the tool and worker versions, the produced
artifact byte lengths and SHA-256 values, a per-artifact match verdict, and
temporary-copy removal. Paired with
`scripts/check-raw-archive-reproduction.mjs`, repository-only, which fails
unless every artifact in the admitted binding list has a matching reproduced
artifact, unless every input is version-pinned, and unless temporary copies
were removed. A partial reproduction must be representable and must not pass.

**What would have to be true for the gate to flip.** Every artifact in the
admitted Phase 2 binding list reproduced byte-identically from version-pinned
archived inputs, with no unarchived input anywhere in the chain. If any output
differs, the gate stays `fail` and the difference is the finding. Note that
bit-identical GeoTIFF output depends on GDAL version and creation options; if
the reproduction is not byte-identical for a benign reason, that is a real
result to record, not a threshold to relax.

---

## 3. `bulk-downloads`

**What the gate says.** "Only immutable illustrative-download contracts exist;
no real CSV or GeoPackage binary has been retrieved or published."

**Current state as of 2026-08-28.** A first immutable four-province 2020-2022
CSV and GeoPackage pair is public behind the approved CloudFront delivery host,
with exact owner-local public readback. That first receipt does not satisfy this
section's requirement for retrieval independently of the producing machine.
A corrected v2 release adds the required bilingual plain-language modification
notice and an explicit bounded owner decision superseding the earlier
no-release scope only for its exact artifacts. It is public, and GitHub Actions
run 33183420113 independently retrieved and hashed all three objects on a Linux
runner. The committed receipt and repository validator close this bounded gate.

`lib/downloads/generate.ts` retains the fixture host and adds only the exact
approved CloudFront host. `tests/downloads.test.ts` keeps rejecting every other
host. The production release contract is `lib/downloads/releases.ts`, while
the exact public manifest and publication receipts carry the durable evidence.

**Achievable on ChatGPT Sites.** Serving a small artifact as a static file is
plausible, but nothing in the repository establishes a size limit, a range
request behaviour, or a byte-integrity guarantee for the host, and
`.openai/hosting.json` shows `r2: null`, so there is no object store attached
to the site. Publishing a multi-hundred-megabyte GeoPackage through the site
host is not something this plan will assume is possible.

**Not achievable, and why.** A bulk download needs a stable, versioned,
checksum-addressable URL that survives site redeploys, supports resumable
transfer, and can be retained beside its predecessor forever, for the same
reproducibility reason `docs/CONTROLLING_IMPLEMENTATION_PLAN.md` line 623
gives for tiles. A site host with no object store and no documented retention
of individual assets cannot promise that.

**The honest option: move the artifacts, keep the page.** Bulk artifacts live
in AWS `ca-central-1` object storage behind the same CloudFront distribution
as the tiles. The site on ChatGPT Sites renders the downloads page, the
citation, the licence, the checksum, and the link. The bytes come from AWS.
This is a change of location, not a workaround: the artifact is genuinely
published, retrievable, and checksum-verifiable by anyone.

Its one dependency is probe question 4. A plain link out to another origin is
not blocked by a CSP, so the download itself survives even a strict host
policy; only an in-page `fetch` would be affected. State that dependency in
the evidence file.

**Sequence.**

1. Produce the first real artifact from admitted data only. The 13-row
   province aggregate is the sole admitted numeric output today
   (`data/phase2-admission-record-2026-08-26.json`), so the first CSV is that
   aggregate and nothing more. Do not widen the scope to unadmitted figures.
2. Generate it with `generateCsv` in `lib/downloads/generate.ts` so the
   Unknown handling stays the tested one. Note the locale parameter: the
   Unknown reason is emitted in one locale per file, so publish an English and
   a French artifact rather than one bilingual file.
3. Create a separate public-read delivery bucket in `ca-central-1`. Do not
   publish from `witness-tree-raw-archive-ca-central-1`: that bucket reads
   "Block all public access: On" in `docs/IMMUTABLE_STORAGE_PROVISIONING.md`
   and holds compliance-locked raw sources. Keep raw and published bytes
   apart.
4. Key artifacts by release ID and content hash so a later release never
   overwrites an earlier one, matching the rule in
   [`docs/RELEASES.md`](RELEASES.md): "Never replace an artifact under an
   existing release ID."
5. Relax the host fence in `lib/downloads/generate.ts` from a hard-coded
   `example.local` to an allowlist that still contains `example.local` for
   fixtures and adds exactly one approved delivery host. Extend
   `tests/downloads.test.ts` so an unapproved host is still rejected. This is
   the only production-code change in this plan, and it must not become "any
   HTTPS URL".
6. Retrieve the published artifact from outside AWS, over the public URL, and
   hash the retrieved bytes.
7. Validate the release manifest with `node scripts/verify-release.mjs` against
   the retrieved file.

**Evidence produced.** `data/bulk-download-publication.json`: schema version,
release ID, per-artifact ID, kind, content type, licence ID, byte length,
SHA-256, public URL, the retrieval instant in UTC, the retrieved byte length
and SHA-256, and the admitted record the content came from with its checksum.
Paired with `scripts/check-phase8-bulk-download-publication.mjs`, repository-only,
which fails unless the published and retrieved digests are equal, unless the
artifact's source binds to an admitted record, unless the URL host is on the
approved allowlist, and unless both locales are present.

**Recorded closure.** The v2 CSV and GeoPackage are derived from the exact
bounded aggregate and display-geometry inputs named in the manifest, published
at content-addressed CloudFront URLs, and retrieved and hashed independently by
a GitHub-hosted Linux runner. The separate owner decision supersedes the earlier
no-release scope only for these exact artifacts and does not complete Phase 2.

---

## 4. `observability`

**What the gate says.** "No deployed monitoring, alerting, log-retention,
dashboard, or operational review evidence is recorded."

**Read its evidence pointer.** The criterion cites
[`docs/IMMUTABLE_STORAGE_PROVISIONING.md`](IMMUTABLE_STORAGE_PROVISIONING.md),
not a web-tier document. That file's mapping table says, for Encryption and
audit: "Server access logging reads Disabled, no CloudTrail data events are
configured for this bucket, and no retention or deletion-attempt log review
process exists." So the greater part of this gate is about the archive, and
the archive is entirely under project control. The hosting choice constrains
one third of this criterion, not all of it.

**Current state on the web tier.** No analytics, no error reporting, no uptime
check anywhere in `app`, `lib`, `components`, or `package.json`. The one piece
of running automation is
[`.github/workflows/wildfire-refresh.yml`](../.github/workflows/wildfire-refresh.yml),
a scheduled job with `contents: write` that refreshes `public/wildfire`,
retries once after 900 seconds, and exits non-zero if both attempts fail. A
GitHub Actions failure notification is currently the project's only alerting
of any kind.

**Achievable, in three parts.**

*Archive side, fully achievable, no hosting dependency.* Enable S3 server
access logging and CloudTrail data events for
`witness-tree-raw-archive-ca-central-1`, with a log destination bucket in
`ca-central-1` and an explicit retention period. Then populate the
`access-logging` control in
[`data/archive-operations-readiness.json`](../data/archive-operations-readiness.json),
whose `requiredEvidence` already lists exactly what is needed: a logging
configuration reference, a Canadian log destination and retention reference,
and a named log-review procedure with a review record. Evidence objects need
`kind`, `capturedAt` as a UTC instant, a non-secret `reference`, and
`reviewerRole`, per `scripts/check-archive-operations-readiness.mjs`. No
account ID, credential, or signed URL goes into Git.

*Delivery side, achievable once sections 3 and 6 exist.* CloudFront standard
logs to a `ca-central-1` bucket, CloudWatch alarms on 5xx rate and on origin
error rate, and a dashboard covering request rate, cache hit ratio, and error
rate. This is also what finally produces a real traffic baseline for section 1.

*Site side, not achievable.* No logs, no error rate, no request count, and no
alerting hook are known to be available from ChatGPT Sites, and probe question
5 exists precisely because the repository cannot answer it. What can be done
from outside is a synthetic uptime check: a scheduled job that fetches a small
set of public routes, asserts status and a content marker, and records the
result. That is a genuine availability signal, and it is not a substitute for
host-side monitoring. Say both things.

**Sequence.**

1. Run the step 0 probe and record questions 5 and 6.
2. Enable archive-side logging and CloudTrail data events; capture the console
   read-back the way `docs/IMMUTABLE_STORAGE_PROVISIONING.md` captured the
   provisioning tables, as observed values rather than form inputs.
3. Write the log-review procedure, run the first review, and record it.
4. Add the `access-logging` evidence objects to
   `data/archive-operations-readiness.json` and set that control to
   `evidenced`. Note the blocker in the next paragraph before doing so.
5. Add a synthetic uptime workflow beside the existing wildfire refresh, with
   no write permission, recording each run's result.
6. After section 6, add CloudFront logging, alarms, and the dashboard.

**A structural defect that has to be resolved first.**
`scripts/check-archive-operations-readiness.mjs` permits
`archive.resourceState` to be only `"empty-non-production"` or
`"configured-no-objects"`, and permits `status: "ready"` only when the state is
`"configured-no-objects"`. The bucket now holds three locked payloads plus 39
VLCE2 payloads and their sidecars, per `data/immutable-promotions.json` and
`data/vlce2-remote-promotion-evidence.json`. The record therefore cannot ever
reach `ready` without asserting something false about the bucket. The schema
needs a truthful third state before this control can be completed. That is a
repair, not a relaxation, and it should be made deliberately rather than
discovered mid-flip.

**Evidence produced.** Amended `data/archive-operations-readiness.json` for the
archive half, plus `data/observability-deployment.json` for the delivery and
synthetic halves: what is monitored, where logs land, their region and
retention, which alarms exist and their thresholds, who receives them, the
dashboard reference, the first operational review record, and an explicit
`unobserved` section naming the site tier and why. Paired with
`scripts/check-observability-deployment.mjs`, repository-only, which fails
unless every log destination is recorded as Canadian, unless every alarm has a
threshold and a recipient role, unless at least one dated review record
exists, and unless the `unobserved` section is present and non-empty while the
site tier is externally hosted.

**What would have to be true for the gate to flip.** Deployed monitoring with
recorded alerting, retained logs in Canada, a dashboard, and at least one
completed operational review, covering the layers that exist. Under ChatGPT
Sites hosting the site tier stays unobserved, so the honest outcome is a flip
that is scoped in its `reason`, or no flip at all. Flipping this to `pass`
with a bare "observability is complete" reason would overstate it. Recommend
flipping only after the archive and delivery halves are both evidenced, and
writing the site-tier gap into the `reason` text itself.

---

## 5. `backups`

**What the gate says.** The current status records bounded recovery readbacks
for some objects, but no approved complete Canadian recovery copy for every
relied-on object and no current complete durability and recovery record.

**Current state.** Partial recovery evidence exists for a bounded subset of
objects. It does not prove that every relied-on raw object, manifest, and
derived artifact has a current recovery counterpart. No complete approved
recovery design and reconciliation record closes that gap.

**Hosting is irrelevant here.** This is object storage, start to finish.

**Achievable, entirely.** Two shapes, and the difference matters:

1. Same-region replication to a second bucket in `ca-central-1`. Protects
   against bucket deletion, prefix loss, and lifecycle mistakes. Does not
   protect against region loss. Stays inside the already-approved region, so
   it needs no new region decision.
2. Cross-region replication to `ca-west-1` (Calgary). Still Canadian, so it
   does not cross the border, and it does protect against region loss. It
   requires an owner decision, because only `ca-central-1` is currently
   approved and `docs/ARCHIVE_OPERATIONS_READINESS.md` requires that "a future
   recovery design must document every destination as Canadian before
   replication is enabled."

**Consequences to put in front of the owner before anything is enabled.**

- Replicating an object under compliance-mode Object Lock replicates the lock.
  The copy's retention through 2033-08-12 would be equally irrevocable, by
  anyone including the account root. This doubles an irreversible storage
  commitment; it is not a reversible backup.
- S3 replication applies to objects written after the rule is created. The
  existing payloads need S3 Batch Replication to be covered, as a separate
  deliberate action.
- The superseded flat-key object versions recorded in
  `data/immutable-promotions.json` would replicate too unless the rule filters
  them out. Decide that before enabling, not after.

**Sequence.**

1. Put the two shapes, their costs, and the three consequences above to the
   owner as a decision, and record the answer in the `recoveryCopy` and
   `replication` decision fields of `data/archive-operations-readiness.json`.
   `replication.state` has exactly one approving value in the checker:
   `approved-canadian`.
2. Create the destination bucket with versioning and Object Lock enabled, in
   the approved Canadian region.
3. Enable the replication rule, then run Batch Replication for existing
   objects.
4. Read back destination object versions, byte lengths, checksums, and
   retention state, the same way `data/vlce2-remote-promotion-evidence.json`
   read back the primary.
5. Run a recovery exercise: restore one payload from the destination copy by
   version ID, verify byte length and SHA-256 against the staged record, and
   confirm the primary object's retention is unchanged afterwards. The
   `recovery-and-replication` control requires exactly this: "Recovery
   exercise record that preserves primary-object retention."
6. Populate that control's evidence and set it to `evidenced`, subject to the
   `resourceState` repair noted in section 4.

**Evidence produced.** Amended `data/archive-operations-readiness.json`, plus
`data/archive-recovery-copy.json` recording destination bucket and region,
replication rule scope, per-object destination version IDs and checksums,
Batch Replication completion, and the recovery-exercise result including the
primary-retention read-back afterwards. Paired with
`scripts/check-archive-recovery-copy.mjs`, repository-only, which fails unless
every destination is recorded as Canadian, unless every replicated payload
maps to a primary payload in `data/immutable-promotions.json` or
`data/vlce2-remote-promotion-evidence.json`, and unless the recovery exercise
records a post-exercise primary retention read-back.

**What would have to be true for the gate to flip.** A Canadian recovery copy
that exists, covers the objects the project actually relies on, and has been
restored from at least once with the primary retention verified intact
afterwards. Every part of that is available today without any external party
and without any hosting dependency. Of the six, this is the one with the
clearest path from `fail` to `pass`.

---

## 6. `cdn-tile-validation`

**What the gate says.** "No production CDN, admitted tiles, or live
tile-validation evidence is recorded; the source-level artifact budget is not a
substitute."

**What the plan demands.** `docs/CONTROLLING_IMPLEMENTATION_PLAN.md` line 623:
"PMTiles archives on object storage, served by range request." Line 641:
"Serve from a CDN and cache aggressively. Tiles are immutable once a data
version is published, so cache lifetimes can be long."

**Current state.** There are no tiles at all.
[`components/explore/ExploreMapClient.tsx`](../components/explore/ExploreMapClient.tsx)
dynamically imports `maplibre-gl` and `pmtiles`, registers the `pmtiles`
protocol, and then builds its style from a single inline `geojson` source of
fixture events. No `pmtiles://` URL appears anywhere in it. The component
renders the line "Verified PMTiles are not yet published." verbatim, in both
locales. `docs/AUDIT_LOG.md` records that integration as accepted with "no
verified PMTiles archive is claimed". The gate's reason is correct on all
three counts.

**Achievable on ChatGPT Sites.** The map client itself, which already exists.
Possibly static hosting of a tile archive, subject to probe questions 2 and 3.

**Not achievable, and why.** The criterion is not "tiles load". It is CDN and
tile validation: cache behaviour, range-request behaviour, TTLs, compression,
and the log evidence that shows them working under real requests. Those are
configurations, and you cannot validate a configuration you do not own and
cannot read. Nothing in the repository suggests ChatGPT Sites exposes cache
policy or delivery logs, and probe questions 1, 2, and 5 exist because that is
unknown rather than known-absent.

**The honest option.** Tiles and their CDN move to AWS `ca-central-1` object
storage behind CloudFront. The Explore page stays on ChatGPT Sites and points
its PMTiles source at the CloudFront URL. This is a real production CDN, owned
and measurable, and it is the shape the controlling plan describes anyway.

**The condition that can kill it.** PMTiles works by HTTP range request from
the browser, so the page has to reach the tile origin cross-origin. That needs
the bucket and distribution to send CORS headers including
`Access-Control-Expose-Headers`, and it needs the host's CSP to permit
`connect-src` to that origin. If probe question 4 comes back restrictive, real
tiles cannot render on a page hosted by ChatGPT Sites, and the only honest
options left are to move the site tier or to keep Explore on fixtures and
leave this gate `fail`. Do not discover this after building the tile pyramid.

**A prerequisite the gate does not mention.** "Admitted tiles" requires admitted
geometry to tile. Today the admitted set is the 21 V2.1 rasters and the 13-row
province aggregate. That supports a genuinely small first tile set: province
polygons from the admitted boundary edition, attributed with the admitted
2020-2022 aggregate values. It does not support a national event or
place-level tile set, and this plan does not propose fabricating one.

**Sequence.**

1. Run the step 0 probe. Stop here if question 4 is restrictive.
2. Build one PMTiles archive from admitted inputs only: the boundary edition
   `statcan-2021-provinces-territories-cbf` joined to the 13 rows of
   `province-2020-2022.json`. Record the tool and version, the input
   checksums, and the output byte length and SHA-256.
3. Upload it to the delivery bucket from section 3, keyed by release and
   content hash so a later tile version never overwrites this one.
4. Put CloudFront in front, with a long TTL, range requests enabled, CORS
   configured, and standard logging to a `ca-central-1` bucket.
5. Point the Explore client's PMTiles source at that URL, keeping the existing
   failure path that sets `data-state="unavailable"` intact, and keeping the
   "not yet published" string for the case where the archive is absent.
6. Validate live, with a script that: fetches the PMTiles header by range and
   checks for `206`; fetches a directory range; fetches a set of tiles at the
   zoom levels the client uses; decodes one tile and asserts the expected
   province feature and its admitted value; repeats each request to observe a
   cache hit; and records status codes, `Content-Range`, `ETag`, cache status,
   and latency for every request.
7. Confirm cross-origin loading in a real browser against the deployed site,
   and record the result including the observed CSP.

**Evidence produced.** `data/cdn-tile-validation.json`: schema version,
distribution identifier, tile archive key, byte length and SHA-256, the
admitted inputs with their checksums, per-request method, range, status,
`Content-Range`, cache status and latency, the decoded-tile assertion result,
the observed CORS and CSP headers, and the cross-origin browser check. Paired
with `scripts/check-cdn-tile-validation.mjs`, repository-only, which fails
unless every range request recorded `206`, unless at least one repeated
request recorded a cache hit, unless the decoded tile assertion passed, unless
the tile archive binds to an admitted record, and unless the cross-origin
check is present and passed.

**What would have to be true for the gate to flip.** An admitted tile archive
on a CDN the project owns, serving range requests with observed cache hits, and
loading in a real browser on the deployed site. Every part of that is
reachable except the last, which depends on a host CSP nobody in this
repository has yet observed. If the cross-origin check fails, the gate stays
`fail`, and the finding is about the hosting choice rather than about the
tiles.

---

## Summary of the six

| Criterion | Verdict under ChatGPT Sites hosting |
| --- | --- |
| `load-testing` | Not achievable as written. The site tier is not the project's to test or to fix. Measure the AWS delivery tier, scope the claim to it, and leave the gate `fail`. |
| `raw-archive-reproducibility` | **Closed on 2026-08-27**, by the cheaper route, hosting-independent as predicted. `docs/RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md` establishes a cheaper route than the one in section 2: a 10.3 MB federal electoral reproduction with no new promotion and no new retention commitment. Prefer it. The route in section 2 needs the StatCan boundary file promoted into the archive, then a version-pinned restore and re-run of the admitted Phase 2 chain. |
| `bulk-downloads` | Closed for the bounded v2 technical-preview release. The exact CSV, GeoPackage, and manifest are public in AWS `ca-central-1` and independently retrieved by a separate GitHub-hosted runner. |
| `observability` | Achievable for the archive and delivery tiers in AWS. Not achievable for the site tier. Any flip must say so in its own reason text. |
| `backups` | Achievable in full, today, with no external party. A Canadian recovery copy plus one recovery exercise closes it. |
| `cdn-tile-validation` | Achievable with tiles and CDN in AWS, conditional on the host permitting a cross-origin range-request fetch. Unknown until probed. |

## Things found while writing this that contradict a current record

These were discovered by reading, and none of them is repaired here.

1. **`archive-operations-readiness` can never reach `ready`.**
   `scripts/check-archive-operations-readiness.mjs` allows
   `archive.resourceState` to be only `"empty-non-production"` or
   `"configured-no-objects"`, and requires the latter for `status: "ready"`.
   The bucket holds objects, per `data/immutable-promotions.json` and
   `data/vlce2-remote-promotion-evidence.json`. The record cannot be completed
   truthfully. `docs/ARCHIVE_OPERATIONS_READINESS.md` still calls it "the
   empty AWS bucket".
2. **`docs/OPERATIONS_HANDBOOK.md` says there is no scheduler.** Line 22 reads
   "There is no scheduler, no daemon, and no CI job with write credentials."
   `.github/workflows/wildfire-refresh.yml` is a cron-scheduled job with
   `permissions: contents: write` that commits and pushes to the repository.
   The handbook's sentence about external storage is defensible; the sentence
   about schedulers is not. That file belonged to another agent when this was
   written, so it was flagged rather than edited. **Closed on 2026-08-26.** The
   handbook that merged names `wildfire-refresh.yml` explicitly as the one
   scheduled job with `contents: write` and tells the reader not to repeat the
   older claim. The remaining sentence in section 7.1 is scoped to *AWS* write
   credentials, which no scheduler holds, and is correct as written.
3. **`docs/EXTERNAL_GATES.md` understates the archive.** Its "Immutable archive
   ownership" row reads "Not complete; no production archive or promoted
   source snapshot is claimed", while
   `docs/IMMUTABLE_STORAGE_PROVISIONING.md` and
   `data/immutable-promotions.json` record three promoted, compliance-locked
   snapshots and `data/vlce2-remote-promotion-evidence.json` records 39 more.
   The gate is still correctly open, but its stated reason is out of date.
4. **The `raw-archive-reproducibility` gate is closed.** **Resolved on
   2026-08-27.** This entry said the gate was closer than its text implied,
   and it was: the cheaper federal electoral route in
   `docs/RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md` was taken instead of the Phase 2
   route described in section 2, and it matched the admitted SHA-256 exactly.
   Section 2 below is retained as history and no longer describes work to do.
   The observation that the admitted Phase 2 output has 39 of its 40 raw inputs
   locked in the Canadian archive still stands, and the single missing input is
   still the StatCan boundary file, which `data/boundary-editions.json` binds by
   checksum but not by object key or version ID. That matters for the Phase 2
   route and for `backups`, not for this gate.
5. **The runtime target is not ambiguous, and this entry was wrong.**
   **Corrected on 2026-08-27.** The original text said `.openai/hosting.json`
   and the Cloudflare Workers surface described two different deployments and
   that one of them must be stale. They are one deployment. `vite.config.ts`
   imports `.openai/hosting.json`, reads `d1` and `r2` out of it, and feeds
   them straight into the `@cloudflare/vite-plugin` binding config whose
   `main` is `worker/index.ts`. The ChatGPT Site runs on a Workers-compatible
   runtime, so `wrangler` and `@cloudflare/vite-plugin` are the live
   toolchain, not leftovers: `vinext` itself declares neither of them, so
   nothing else would supply them. `d1: null` and `r2: null` are not evidence
   of staleness either; they are how the config says no database and no bucket
   are provisioned for this site, and the plugin config turns each null into
   an empty binding array.

   **Do not delete `worker/index.ts`, `wrangler`, or `@cloudflare/vite-plugin`
   on the strength of the entry that used to be here.** Doing so would remove
   the deployment, not clean up after it. No step in this plan is waiting on
   this being settled.
7. **`/_vinext/image` fails open to a 500 when the images binding is absent.**
   `worker/index.ts` calls `env.IMAGES.input(...)` with no guard, and no
   images binding is declared in `vite.config.ts`. No component in this
   application requests that path, so it is reachable only by a direct
   request, and the failure is a 500 rather than a 404. It is recorded here
   rather than repaired because the fix touches live deployment code for a
   route the product does not use, which is a change the owner should choose
   rather than inherit.

6. **"50 times normal traffic" has no left operand.** There is no analytics,
   telemetry, or request counting anywhere in the application. The load-test
   criterion cannot be computed until a baseline is measured, which makes
   `observability` a hard prerequisite for `load-testing` rather than a
   parallel task.
