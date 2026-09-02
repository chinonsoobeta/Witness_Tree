# Operations handbook

This is the operating document for Witness Tree. It covers incident response,
escalation, ownership, and production procedures for the system as it is
actually built and actually hosted today.

Read it with two boundaries in mind.

1. **Every procedure here is grounded in a file or command that exists in this
   repository, or is explicitly marked as absent.** Where a normal handbook
   would name a monitor, a dashboard, or a load balancer, this one either names
   the real equivalent or says plainly that there is none and what the operator
   does instead. The absences are collected in
   [Declared gaps](#declared-gaps) and they are not softened anywhere else.
2. **Nothing here converts an external gate into a completed one.** The
   [external gates register](EXTERNAL_GATES.md) remains controlling for legal,
   Indigenous-engagement, translation, accessibility, source-licence, and
   operational approvals. A handbook describes how to operate; it does not
   grant permission to operate.

---

## 1. The system, in the shape an operator has to hold at 3am

There are three separate systems here, and they fail in unrelated ways. Confusing
them is the fastest way to waste an incident.

| System | What it is | Where it runs | Who can break it |
| --- | --- | --- | --- |
| **The public site** | A bilingual read-only Next-style app compiled by `vinext` into a Cloudflare Worker | ChatGPT Sites, project `appgprj_6a7bea9e59988191a9304d4c5a3f379d`, served at `www.witnesstree.ca` | a bad deploy, or the host |
| **The raw archive** | S3 bucket `witness-tree-raw-archive-ca-central-1`, versioned, Object Lock enabled, public access blocked | AWS `ca-central-1` | an owner running a mutating runner |
| **The data root** | `Witness_Tree-data` on a single external drive: every real source and derived byte | one physical disk | disk loss, detachment, or corruption |

The public site holds **no** state. `.openai/hosting.json` declares
`"d1": null` and `"r2": null`, `db/schema.ts` is empty, and
`drizzle/meta/_journal.json` records zero migrations. `getDb()` in
`db/index.ts` throws by design when the `DB` binding is absent, which it is.
There is no database to corrupt, no queue to drain, and no user data at risk
in a site incident. Every figure the site shows is compiled into the bundle
from an illustrative fixture.

The archive and the data root hold everything that would be expensive to lose.
They are touched only by an owner sitting at a terminal. Nothing touches them
on a schedule.

### What runs without a human

Exactly one thing: `.github/workflows/wildfire-refresh.yml`. It is a scheduled
GitHub Actions job with `contents: write`, and it commits to the default
branch. Section 6.3 covers it. Do not repeat the older claim that this project
has no scheduler and no CI job with write credentials; that claim is wrong and
this job is the counterexample.

`.github/workflows/ci.yml` runs on every push and pull request. It deploys
nothing and has no cloud credentials. It declares no `permissions:` block, so
its token scope is whatever the repository or organisation default is. That
default is a GitHub setting and cannot be read from this tree, so do not assume
it is read-only without checking it in the repository settings.

---

## 2. Ownership

Ownership here means: the role that is accountable for a decision, and the role
that is expected to act during an incident. The repository records exactly one
accountable individual, and this handbook does not invent a second.

### 2.1 The named accountable owner

`Chinonso Obeta` is recorded as the accountable owner and reviewer in the
repository's own evidence records, including
[`data/immutable-promotions.json`](../data/immutable-promotions.json)
(`reviewer`), the Phase 0 and Phase 1 approvals cited in
[EXTERNAL_GATES.md](EXTERNAL_GATES.md), and the federal-electoral and NTEMS
execution authorizations under `data/`. Every role below currently resolves to
that same person. **There is no second responder.** See
[Declared gaps](#declared-gaps), item G1.

### 2.2 Role to system map

| Role | Owns | Concretely responsible for |
| --- | --- | --- |
| **Site owner** | The ChatGPT Sites project and the public site | Deploy, rollback, deciding whether the site stays up during an incident, all public wording on the site |
| **Archive operator** | S3 `witness-tree-raw-archive-ca-central-1` and the thirteen shell runners | Running any promotion, retention, readback, or recovery; holding the MFA device; preserving private diagnostics |
| **Data custodian** | The `Witness_Tree-data` drive | Physical custody, attachment, and any future second copy; the integrity of every checksum-bound byte |
| **Release approver** | `data/*-exit-status.json`, release manifests, and every gate record | Whether a criterion may flip, whether a release manifest may publish, whether an admission is real |
| **Corrections recipient** | Public correction cases | The named accountable recipient required by [CORRECTIONS_WORKFLOW.md](CORRECTIONS_WORKFLOW.md) for any production case |
| **Security responder** | Identity and credential boundaries | Any exit code `77`, any credential exposure, any suspected archive tampering |

### 2.3 Dataset ownership

| Dataset | Custody today | Owning role |
| --- | --- | --- |
| `qc-historic-wildfire-detailed` (`feux_prov_gpkg.zip`) | Promoted, version-pinned in the raw archive | Archive operator |
| `alberta-avi-crown` (`albertavegetationinventorycrown.zip`) | Promoted, version-pinned in the raw archive | Archive operator |
| `nrcan-forest-canopy-cover-2022` | Promoted, version-pinned in the raw archive | Archive operator |
| Every other source in [`data/source-ledger.json`](../data/source-ledger.json) | Illustrative `example.local` entries with placeholder hashes | Release approver |
| All derived bytes under `Witness_Tree-data` | Single copy on one drive | Data custodian |
| Wildfire feed data | No cleared feed is configured; the site renders `ILLUSTRATIVE_WILDFIRE_FEED` from `lib/wildfire/fixtures.ts` | Site owner |
| Account and alert data | None exists. The account service is inactive by construction (section 6.5) | Site owner |

The three promoted payloads are the only real bytes in cloud custody. Their
exact keys and `VersionId` values are in
[`data/immutable-promotions.json`](../data/immutable-promotions.json). Any
incident touching them is treated as S1 (section 3.2).

---

## 3. Incident response

### 3.1 Detection

This is the part where a normal handbook lists monitors. **There are none.**

- No uptime monitor, no synthetic probe, no alerting integration.
- No error tracking. There is no Sentry, OpenTelemetry, Datadog, or analytics
  client anywhere in `app/`, `lib/`, or `components/`.
- No health or status endpoint. The route inventory is pages only: `app/`
  contains no `route.ts` at all. There is nothing to curl that returns a
  machine-readable health answer.
- No log retention that this project controls. The Worker runs on the host's
  infrastructure; the repository holds no logging configuration and no log
  sink. Whether the host retains request logs, and for how long, is not
  established here.

So detection is manual and it has exactly three real sources.

| Source | What it tells you | How often it is checked |
| --- | --- | --- |
| Loading the public site in a browser | Whether the site serves at all, in both locales | Only when a person looks |
| The GitHub Actions run list for `ci.yml` and `wildfire-refresh.yml` | Whether the branch gate is green and whether the scheduled job failed | Only when a person looks |
| A report from a person | Everything else, including a wrong published figure | Whenever it happens |

**The operator's first move on any suspected site incident is to fetch the two
locale roots and compare.** These are the only probes that exist:

```sh
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' \
  https://www.witnesstree.ca/en
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' \
  https://www.witnesstree.ca/fr
```

A non-2xx from both, with the same shape, points at the host or the deploy. A
non-2xx from one locale only points at the application, because each locale has
its own root layout and its own route tree.

There is no equivalent of "check the load balancer". The host owns routing,
TLS, caching, and edge behaviour, and exposes none of it to this project.
Section 5 is what the operator does instead.

### 3.2 Severity classification

Severity here is driven by what this project can actually harm: a person's
belief about forest change, a nation's geography, or an irreplaceable byte. It
is not driven by traffic.

| Severity | Definition | Examples | Target first action |
| --- | --- | --- | --- |
| **S1** | An irreplaceable byte is at risk, or the site is asserting something false that a person could act on | The data-root drive is failing or lost; an archive object is missing, overwritten, or fails its recorded checksum; the site publishes a wrong figure as a `Figure` rather than `Unknown`; a wildfire route shows stale data as current; Indigenous geography is misrepresented; a credential or MFA code has been exposed | Immediately, and before any other work |
| **S2** | The public site is down or materially wrong, with no data-integrity or safety consequence | Both locales return 5xx; a deploy shipped a broken route; a locale is unreachable; the host is degraded | Within the same working session |
| **S3** | A control that should protect the system is not working | A runner refuses when it should proceed, or proceeds when it should refuse; the branch gate is red on `main`; a check that used to pass now fails for a reason other than the detached drive | Same day |
| **S4** | Correctness or hygiene issue with no live impact | A documentation record disagrees with the code; a scheduled job fails in its known, expected way | Next working session |

Two classification rules that override the table:

- **Any exit code `77` from any runner is S1**, not S3. Code `77` means the
  assumed role was not the approved role, was outside the approved account, or
  the role response was incomplete. That is an identity-boundary failure and it
  is treated as a security finding, never as a configuration nuisance. The same
  applies to code `69` when the cause is a wrong MFA serial.
- **Unavailable is not failed.** If a check could not read its inputs, its
  result is Unknown. That is not an incident at all. It is the documented state
  described in [DATA_ROOT_BOUND_CHECKS.md](DATA_ROOT_BOUND_CHECKS.md), and
  collapsing it into "evidence contradicted" would manufacture a defect. Confirm
  which one you have before opening anything.

### 3.3 Triage

Work these in order. Stop at the first one that answers.

1. **Is anything irreplaceable at risk?** Data root, archive object, or
   credential. If yes, it is S1: go to section 3.4 and stop touching things.
2. **Did a mutating runner stop?** If yes, do not retry. Read the refusal
   message, then go to section 7. The message says what did *not* happen and
   that is the only reliable account of where the run stopped.
3. **Is the site serving?** Run the two curls in section 3.1. If both fail,
   go to section 5.
4. **Did something change?** `git log --oneline -20 origin/main` and the
   Actions run list. A site defect almost always corresponds to a commit,
   because there is no other way for the deployed artifact to change.
5. **Is it a reported figure, not an outage?** Then it is a correction, not an
   incident response: follow [CORRECTIONS_WORKFLOW.md](CORRECTIONS_WORKFLOW.md).
   Note that the workflow is policy and fixtures only. It does not submit
   cases, send email, or provide a public intake route, so a correction report
   currently arrives by whatever channel the reporter found and is tracked by
   hand.

### 3.4 The S1 first five minutes

For a data-integrity or credential S1, in this order:

1. **Stop every runner.** Do not start a new one, do not retry a failed one,
   and do not clear a refusal by deleting the thing it refused over.
2. **Preserve the diagnostic.** Private diagnostics are written mode-600 to an
   owner-owned directory. Leave them there. Do not commit them.
3. **Do not delete a partial checkpoint.** It is the only record of what a past
   run produced. `run-wildfire-derived-recovery.sh` enforces this and refuses
   with "Partial recovery evidence requires owner review before any retry; no
   TOTP or AWS call was made". Treat the rule as binding whether or not the
   runner you used enforces it.
4. **If a credential or TOTP may have been exposed**, treat the assumed role as
   compromised. Rotation is an AWS console action by the archive operator and
   is outside this repository. Nothing in `scripts/` rotates a credential.
5. **Write down the time, the exact command, the exact exit code, and the exact
   message.** Do not paraphrase the message.

### 3.5 Communication

| Audience | Channel that exists | Channel that does not exist |
| --- | --- | --- |
| The public | The site itself, and the `/en/corrections` and `/fr/corrections` routes | There is no status page, no banner mechanism driven by an operator, and no mailing list. A public message requires a code change and a deploy |
| A correction reporter | Whatever channel they used to reach the owner | There is no intake form and no monitored address in this repository |
| The owner | See [Declared gaps](#declared-gaps), item G2: no contact route is recorded | |
| The host | See section 5 | |

Because the only way to tell the public anything is to deploy, **a public
communication is itself a production change** and follows section 6.1. Budget
for that: the operator cannot post a notice in thirty seconds.

Three rules on anything written during an incident:

1. **Never record an MFA TOTP value or a temporary credential.** Not in a
   diagnostic, not in a commit, not in an issue, not in a message.
2. **Keep exact version IDs, checksums, and retention boundaries private.**
   Commit only approved redacted evidence, as
   [ARCHIVE_OPERATIONS_READINESS.md](ARCHIVE_OPERATIONS_READINESS.md) requires.
   No account IDs, credentials, signed URLs, personal data, or raw source bytes
   in Git.
3. **Never describe an unperformed action as performed.** If a step was not
   run, the record says it was not run.

---

## 4. Escalation

### 4.1 The honest state

**The on-call rota is not staffed.** Phase 8 `on-call-rota` is `fail` for
exactly this reason, and this handbook does not change that. There is one
accountable owner, no secondary, no handover, and no approved coverage window.
Outside the hours that person happens to be awake and looking, nothing is
detected and nothing is escalated. Plan around that rather than around the
table below.

### 4.2 Escalation paths

| Situation | Escalates to | Trigger | Timeout before escalating further |
| --- | --- | --- | --- |
| S1 data integrity or credential exposure | Security responder, then Release approver | Immediately on classification | None. There is no waiting step |
| S2 site outage attributable to this project | Site owner | Immediately | 30 minutes without a root cause: consider a rollback (section 6.2) rather than continued diagnosis |
| S2 site outage attributable to the host | Site owner, then the host | 15 minutes of confirmed failure with no repository change to explain it | Section 5.3 |
| S3 control failure | Archive operator, then Release approver | Same day | 1 working day unresolved: raise to S2 handling, because a broken control is a silent S1 waiting to happen |
| A gate criterion is claimed to have changed | Release approver, always | Before any edit under `data/` | No automatic escalation. A gate flip needs a decision, not a timer |
| A correction case | Corrections recipient | Per class in [CORRECTIONS_WORKFLOW.md](CORRECTIONS_WORKFLOW.md): critical 1 business day to acknowledge, Indigenous-geography 1, material 3, minor 5 | The acknowledge/resolve targets in that document |

Every row above currently resolves to the same person. The rows describe the
decision that has to be made, and who has to make it, so that the structure
survives a second responder being added. They do not describe a paging chain,
because there is none.

### 4.3 The route

**No contact route is recorded in this repository, deliberately.** Contact
details are personal data and this project does not put personal data in Git.

The route must exist in a private operator card held outside version control,
containing: the owner's primary and secondary channels, the AWS account alias
and support tier, who may open a support case, and what may be disclosed in
one. Until that card exists, the timeouts in section 4.2 are policy without a
mechanism, and this handbook says so rather than implying otherwise. See
[Declared gaps](#declared-gaps), item G2.

---

## 5. Operating on ChatGPT Sites

The site is hosted entirely on ChatGPT Sites. That is the whole hosting story:
there is no self-managed cloud, no VPS, no Kubernetes, no CDN this project
configures, and no infrastructure-as-code. This section is what that means when
something is wrong.

### 5.1 What the host owns, and what the operator therefore cannot do

| Normal operational lever | Here |
| --- | --- |
| Check the load balancer | **No equivalent.** Routing and edge behaviour are the host's. Fetch the two locale roots (section 3.1); that is the entire external view |
| Read application logs | **No equivalent this project controls.** No log sink is configured. Whether the host retains request logs, and whether the operator can read them, is unverified (gap G3) |
| Scale up, add a replica, restart a process | **No equivalent.** There is no instance to restart |
| Fail over to another region | **No equivalent.** There is one host and one project |
| Put up a maintenance page | **No equivalent.** A notice requires a code change and a deploy (section 3.5) |
| Purge the CDN | **No equivalent.** Cache behaviour is the host's. The only reliable way to change what is served is to deploy a new build |
| Roll back with one command | **No repository equivalent.** See section 6.2 |
| Set an environment secret at the edge | **Not used.** The app needs none. `.env*` is gitignored and the build reads only `.openai/hosting.json` |

### 5.2 What the operator can still establish locally

These are real, they run offline, and they are the substitute for observability
during a site incident. None of them touch the data root.

```sh
npm ci
npx tsc --noEmit
npm run lint
node scripts/check-bilingual.mjs
npm run build          # produces dist/, the same artifact the host serves
npm run check:budgets  # shared and Explore gzip budgets against dist
npm run check:accessibility
npm test               # build plus rendered-route smoke test
```

If `npm run build` succeeds and the rendered-route smoke test passes locally on
the exact commit that is deployed, the fault is not in the application code
path those tests cover. That is the strongest statement available without host
telemetry, and it is genuinely useful: it separates "we shipped a broken build"
from "the host is degraded".

### 5.3 When the host itself is degraded

There is no failover and there is no second origin. The procedure is short
because the options are few.

1. **Confirm it is the host.** Both locales fail identically, and the deployed
   commit builds and smoke-tests clean locally (section 5.2). A single-locale
   failure is almost never the host, because the locales are separate route
   trees in the same Worker.
2. **Check for a repository cause first anyway.** `git log --oneline -20
   origin/main`. If the last commit is a deploy candidate, prefer section 6.2
   over blaming the host.
3. **Do not redeploy repeatedly.** A redeploy against a degraded host does not
   fix the host and destroys the evidence that the previous artifact was fine.
   One deploy of a known-good commit is a legitimate attempt. A loop is not.
4. **Escalate to the host.** The support route, entitlement, and expected
   response are not established for this project (gap G4). Recording them is an
   owner action.
5. **Wait, and say so.** With no failover, the honest operator position during a
   host outage is that the site is unavailable and the project cannot restore
   it. Do not construct a workaround that serves stale or partial content from
   somewhere else. Nothing in this project is important enough in the next hour
   to justify publishing an unverified figure.
6. **Nothing is lost.** The site is stateless. The archive and the data root are
   untouched by a host outage. A host incident is an availability incident only,
   which is why it is S2 and not S1.

---

## 6. Production procedures

### 6.1 Deploy

**What a deploy is here.** A deploy is the ChatGPT Sites control plane building
this project and replacing what the Worker serves. The build is
`vinext build` under Vite, with `@cloudflare/vite-plugin` and the local
`build/sites-vite-plugin.ts` plugin, which copies `.openai/hosting.json` and
the `drizzle/` directory into `dist/.openai/` after the bundle closes. The
served entry point is `worker/index.ts`.

**What a deploy is not.** It is not a command in this repository. There is no
deploy script in `package.json`, no deploy workflow in `.github/workflows/`,
and no hosting credential anywhere in the tree. The deploy is initiated through
the ChatGPT Sites control plane, outside version control. The exact steps and
who may perform them are not established by this repository (gap G5).

**Pre-deploy checklist.** Run every command in section 5.2 and require all of
them green on the exact commit being deployed. In addition:

- `git status --short` must be clean. Deploying from a dirty tree means the
  deployed artifact does not correspond to any commit, and rollback (section
  6.2) then has nothing to return to.
- CI must be green on that commit. `ci.yml` runs the type check, lint,
  bilingual parity, the full contract-check suite, the build, and the claim,
  style, brand, persistent-identifier, and budget gates.
- The claim boundary must still hold. `npm run check:claims` exists precisely
  so that a change cannot quietly turn an illustrative fixture into an implied
  production figure.

**Post-deploy verification.** Fetch both locale roots (section 3.1) and confirm
2xx. Then open one content route in each locale and confirm the page renders
with its locale token, which is what `check-bilingual.mjs` asserts at build
time. There is no automated post-deploy check, because there is no deploy
pipeline to attach one to.

**Change window.** None is defined, and with a single operator and no rota one
would be theatre. The operative rule is simpler: do not deploy when you are not
in a position to roll back within the hour.

### 6.2 Rollback

**What a rollback is here.** Deploying an earlier commit. There is no version
history to select in this repository, no blue/green, and no traffic shifting.
The unit of rollback is a Git commit, and the mechanism is another deploy.

```sh
# Identify the last commit known to build and smoke-test clean.
git log --oneline -20 origin/main

# Verify that commit locally before deploying it. Do not deploy a commit
# you have not just built.
git switch --detach <good-sha>
npm ci && npm run build && npm test
```

Then deploy that commit through the same control plane path as section 6.1.

Three rules:

- **Roll back by deploying an earlier commit, not by reverting on `main`
  under pressure.** A revert is a new commit with a new risk. Deploying a
  commit that was already proven good is the lower-risk move. Land the revert
  afterwards, calmly.
- **Never roll back to a commit you have not built locally in the last few
  minutes.** "It worked last week" is not evidence that it builds against the
  current lockfile.
- **Rollback does not undo data.** The site is stateless, so a rollback is
  always safe for the site. It has no effect whatever on the archive or the
  data root, and it must never be attempted as a remedy for an archive
  problem. For that, see section 7.

Whether the host itself offers a one-click revert to a previous deployment is
not established here (gap G5). If it does, it is still subject to the rule
above: know which commit you are returning to.

### 6.3 Data refresh

There are two completely different things called a refresh. Do not confuse
them.

**A. The scheduled wildfire refresh.** `.github/workflows/wildfire-refresh.yml`.

- Cron fires at eight UTC hours (`0 0,4,5,12,13,19,20,23 * * *`).
- `scripts/wildfire/dst-gate.mjs` then permits the run only at Vancouver local
  hours 05, 12, 16, and 21, so exactly four runs execute per day across both
  DST offsets and the extra cron entries are discarded.
- `scripts/wildfire/refresh.mjs` currently **always refuses**:
  `configuredSources()` throws `No cleared live-wildfire feed is configured;
  refusing remote refresh.` unless `WILDFIRE_FIXTURE` is set. The
  `WILDFIRE_SOURCE_URLS` variable the workflow passes is not read by that
  function. A URL alone is not a cleared feed.
- The workflow retries once after 900 seconds and then exits 1.

The 100 most recent scheduled runs were inspected on 2026-08-31 and are
recorded in
[`data/wildfire-refresh-run-history-2026-08-31.json`](../data/wildfire-refresh-run-history-2026-08-31.json).
The snapshot contains 56 successful DST-gated no-ops and 44 failed attempted
refreshes; it contains no successful real refresh. A successful workflow run is
not evidence of a refresh when the gate skipped the refresh step. The observed
attempted-refresh failures include a direct push rejected by protected `main`,
so the workflow conclusion alone is not a feed-health signal.

An attempted refresh that fails while no cleared feed is configured is S4, not
an incident. It becomes S3 the day a cleared feed is configured and it still
fails, and it becomes S2 if it ever *succeeds* while no feed has actually been
cleared, because that would mean a source is being fetched without rights.

`scripts/wildfire/snapshot-store.mjs` defines the state machine if a refresh
ever does run: immutable per-source snapshots written with `wx` so a snapshot
can never be overwritten, `current.json` written atomically through a temp file
and rename, per-source status of `healthy` / `retrying` / `degraded`, a 15
minute retry interval, and a 24 hour staleness threshold. It refuses to publish
an empty refresh and refuses to publish one in which every source failed, so a
failed round cannot restamp last-good data and make stale data look current.

One thing to know before spending an incident on this: **a successful refresh
would not currently change the site.** `app/en/wildfire/page.tsx` and
`app/fr/incendies/page.tsx` render `ILLUSTRATIVE_WILDFIRE_FEED`, compiled in
from `lib/wildfire/fixtures.ts`. The refresh writes to `public/wildfire`, which
no route reads. Wiring them together is a code change gated on cleared feeds,
not an operational step.

**B. An archive promotion or retention run.** This is not a refresh in any
routine sense. It is a deliberate, owner-invoked, MFA-bearing mutation of the
raw archive, and it is section 7.

### 6.4 Restore

**What has actually been demonstrated.** On 2026-08-14, a read-only restore
drill read back all three promoted payloads using their exact S3 key and
`VersionId`, verified byte count and SHA-256 against the staged record,
verified ZIP integrity with `unzip -tqq`, and confirmed the temporary copy was
removed. No mutable key or current-version alias was used. The non-secret
result is [`data/immutable-restore-drill.json`](../data/immutable-restore-drill.json)
and the narrative is [IMMUTABLE_RESTORE_DRILL.md](IMMUTABLE_RESTORE_DRILL.md).

Re-verify the recorded drill at any time, offline, with no AWS client and no
write path:

```sh
npm run check:immutable-restore-drill
```

The gate fails if any payload lacks its exact promoted `VersionId` or key, does
not match the staged byte length and SHA-256, lacks a passed archive test, or
claims a retained temporary copy.

**Restore procedure for a suspected archive-object problem.**

1. Classify as S1 and stop all runners (section 3.4).
2. Read the exact `payloadKey`, `manifestKey`, and `payloadVersionId` from
   [`data/immutable-promotions.json`](../data/immutable-promotions.json).
   **Use the version-pinned key. Never resolve the current version alias.**
   Object Lock is enabled and versioning is enabled on the bucket, so the
   pinned version is the thing that matters and the current alias can lie about
   what was intended.
3. Read back with `run-wildfire-derived-readback.sh --preflight` first, then
   `--readback`, for the derived objects it covers; for the three raw payloads,
   repeat the drill method recorded in the restore-drill document.
4. Compare byte length and SHA-256 to the staged record. A mismatch is a
   finding, not a file to rebind. Do not update a checksum to make a check
   pass.
5. If an object is genuinely absent, this is a recovery, not a restore: go to
   section 7 and read the specific recovery runner's header before invoking it.

**What restore cannot do.** Bounded recovery replicas exist for some archived
objects, but they do not form a complete second copy of every raw input,
manifest, derived artifact, and data-root dependency. **The external data root
still has no verified complete second copy.** Phase 8 `backups` is `fail` for
precisely this reason and
[ARCHIVE_OPERATIONS_READINESS.md](ARCHIVE_OPERATIONS_READINESS.md) records the
Canadian recovery-copy decision as incomplete. If that drive dies, any derived
data absent from recovery storage must be re-acquired or re-transformed from
the raw archive and original publishers. Nothing in this repository substitutes
for a complete recovery reconciliation and tested restore path.

Note also that the restore drill proves readback, not reproducibility. Those
are separate claims, and the second one is now evidenced separately: Phase 8
`raw-archive-reproducibility` passed on 2026-08-27, when the admitted federal
electoral output was regenerated from its raw archived inputs and matched the
admitted SHA-256 exactly. See [`data/raw-archive-reproduction-drill.json`](../data/raw-archive-reproduction-drill.json).
That closes the depth gate for one chain. It says nothing about the other
chains, and it does not close Phase 1 `raw-file-archive-recovery`, whose
requirement is universal across every raw file in the ledger.

### 6.5 Kill switch

Be precise about what exists, because the words "kill switch" appear in this
codebase and they do not mean what an operator would assume.

**What exists.** `AccountStore.killSwitchEnabled` is a boolean field on an
in-memory record (`lib/accounts/types.ts`). `maySend()` in
`lib/accounts/policy.ts` returns `false` when it is set, and `evaluateAlerts()`
in `lib/alerts/triggers.ts` returns no alerts and evaluates no payloads when it
is set. Both behaviours are covered by tests.

**What does not exist.** There is no persisted store to hold that flag, no
route or admin surface that sets it, and no deployed sender for it to stop.
There is therefore **no operational kill switch that an operator can throw.**
Nothing is currently sending, so there is currently nothing to kill.

**Why nothing is sending.** `lib/accounts/activation-gate.ts` defaults closed.
`ACCOUNT_SERVICE_STATUS` is computed with no approval record, so all ten
activation requirements are missing and `requireAccountActivation()` throws at
every future account-mutation or alert-delivery boundary. One of those ten
requirements is `killSwitchRehearsalUnderFiveMinutes`, and another is
`namedIncidentOwnerAndRunbook`. The service cannot be activated until an
independently observed, timed kill-switch rehearsal exists. A unit test cannot
establish an operational time bound, and Phase 6 records that criterion as
open.

**The only real emergency stop available today** is to take the site down or
change what it says, and both are deploys (sections 6.1 and 6.2). If the
emergency is a false published figure, the fastest honest action is to deploy a
commit that renders the affected value as `Unknown` rather than as a `Figure`,
which is the behaviour the codebase already enforces everywhere else. An
`Unknown` is a reasoned nonnumeric state and never `0`.

**Before the account service is ever activated**, a real kill switch must be
built: a persisted flag, a way for a single operator to set it without a
deploy, and a rehearsal that is independently timed under five minutes. Until
then this section describes an absence, not a control (gap G6).

---

## 7. Mutating the archive: runners, refusals, and interrupted runs

Everything in this section concerns the raw archive and the data root. None of
it affects the public site.

### 7.1 The operating model

No scheduler, no daemon, and no CI job has AWS write credentials. Every
mutating operation is a shell runner that an owner invokes interactively, that
prompts for a fresh MFA TOTP, and that directly assumes a narrowly scoped role
in the approved account in `ca-central-1` for 43200 seconds.
`scripts/check-archive-direct-mfa-runners.mjs` enforces that design across
every archive, promotion, readback, recovery, and QC runner: no legacy
`sts get-session-token`, no chaining an assumed session into another role, and
a direct MFA assume-role from the configured operator profile.

The operational failure mode is therefore not "something ran and broke". It is
"an owner started a run and it stopped".

### 7.2 The runners

Thirteen shell runners perform mutating or credential-bearing work. **All
thirteen accept `--preflight`, and preflight comes first.**

| Runner | Modes |
| --- | --- |
| `run-alberta-plvi-approved-promotion.sh` | `--preflight` `--run` |
| `run-current-wildfire-approved-promotion.sh` | `--preflight` `--run` |
| `run-nbac-approved-promotion.sh` | `--preflight` `--run` |
| `run-phase1-approved-promotion.sh` | `--preflight` `--run` `--run-federal` `--resume` `--validate-resume-state` |
| `run-phase1-archive-owner-exercise.sh` | `--preflight` `--run` `--recover` |
| `run-phase1-canopy-completion-recovery.sh` | `--preflight` `--recover-canopy` |
| `run-phase8-bulk-download-publication.sh` | `--preflight` `--run` |
| `run-qc-approved-multipart-promotion.sh` | `--preflight` `--run` |
| `run-qc-fourth-inventory-approved-promotion.sh` | `--preflight` `--run` `--resume-batch-two` |
| `run-wildfire-derived-manifest-retention.sh` | `--preflight` `--run` |
| `run-wildfire-derived-readback.sh` | `--preflight` `--readback` |
| `run-wildfire-derived-recovery.sh` | `--preflight` `--dry-run` `--recover` |
| `run-wildfire-derived-recovery-owner.sh` | `--preflight` `--dry-run` `--recover` |

Preflight validates each runner's applicable approval, private state, IAM
attestation, and local artifact checksums before prompting for a TOTP or making
a storage call. As of 2026-08-31, all thirteen AWS-bearing runners have a
direct runner-level preflight test. Each test invokes the real shell runner
with a mutation-trapping fake `aws` executable and asserts that the executable
is not reached. The coverage includes both successful local-only preflights and
fail-closed local-precondition paths; the latter also assert the intended
refusal status where the runner owns that status.

### 7.3 The refusal contract

The checked inventory in
[`data/exit-code-taxonomy.json`](../data/exit-code-taxonomy.json) binds the
intentional exit sites in all twenty-three `scripts/run-*.sh` operator runners.
It covers literal shell exits, explicit and default `fail` calls, forwarded
status exits, and inline Node predicates. It is deliberately not a claim that
every child process status is in this taxonomy: an unwrapped command stopped by
`errexit` or `pipefail` can surface its native status, and its own diagnostic
must be read.

| Code | What it means | What the operator does |
| --- | --- | --- |
| `0` | Successful completion or approved no-op | Continue only with the stated next procedure |
| `1` | Generic unclassified batch or precondition failure | Read the command diagnostic; do not infer an operator refusal category |
| `64` | Invalid invocation or operator input | Fix the invocation. Nothing happened. Do not widen a path to make it fit |
| `65` | Local approval, artifact, state, or checksum precondition failed | Repair the local input. Nothing remote happened. A failed checksum is a real finding, not a file to rebind |
| `69` | Local execution environment or MFA configuration is unusable | Repair the workstation. A wrong MFA serial is S1, not a configuration nuisance |
| `70` | Controlled remote operation, readback, or integrity stage failed | Stop. Read the message for what was *not* attempted. Do not retry blind; see 7.4 |
| `73` | Recovery or ownership state is ambiguous and requires audit | Do not attempt a write. Preserve the diagnostic and request a version-specific audit |
| `75` | Execution cannot safely proceed or continue | Preserve state. If resumable, use the exact resume command; otherwise obtain the required readiness or environment correction |
| `77` | Identity or authorization boundary is not established | S1. Stop, treat as a security finding, do not re-run |

The invariant worth internalising: **a refusal tells you what did not happen.**
Messages end with clauses like "no TOTP or AWS call was made", "no recovery
write was attempted", "no overwrite or delete was attempted", "state was
preserved unchanged". Code `70` refusals more often name the failing stage
instead. Either way the message, and not a guess, is what establishes where the
run stopped.

Every runner that establishes or owns an AWS session traps `EXIT` and clears
its exported AWS session credentials. Each runner's cleanup also clears the
private variables and temporary paths that it owns. The three Phase 2 batch
runners never establish such a session; the local-only
`run-wildfire-derived-approved-promotion.sh` has no authorized AWS path; and
`run-wildfire-derived-recovery-owner.sh` delegates session ownership to its
child recovery runner. A crashed session-owning shell does not leave its
exported session credentials in the environment.

### 7.4 Interrupted runs

Two distinct continuations. They are not interchangeable.

**Resume** applies when a run stopped with private resume state intact, the
normal outcome of an expired session (code `75`). The refusal prints the exact
resume invocation. `run-phase1-approved-promotion.sh` additionally offers
`--validate-resume-state`, which inspects the saved state without continuing.
Validate first when there is any doubt about what the state holds.

**Recovery** applies when the remote state is known to be partial: some
approved objects exist and some do not. `run-phase1-archive-owner-exercise.sh`,
`run-phase1-canopy-completion-recovery.sh`, and the two
`run-wildfire-derived-recovery*.sh` runners exist for this.
`run-wildfire-derived-recovery.sh` states its boundary in its header and is the
tightest of the four: it reuses an existing payload version, creates only
missing objects, never overwrites an existing key, never deletes, never
completes a foreign multipart upload, and never writes a legal hold. **Read
each other recovery runner's header before invoking it** rather than assuming
the same boundary.

Only the two `run-wildfire-derived-recovery*.sh` runners provide `--dry-run`
between preflight and `--recover`. Where it exists, use it.

**A partial checkpoint requires owner review before any retry.** As audited on
2026-08-31, all three recovery runners with a local checkpoint or evidence
interface refuse it before an AWS call: `run-phase1-canopy-completion-recovery.sh`
requires the exact complete 155-part private state,
`run-wildfire-derived-recovery.sh` refuses its partial checkpoint, and
`run-wildfire-derived-recovery-owner.sh` refuses any preexisting evidence,
including partial evidence, before root/default capture. The fourth recovery
runner, `run-phase1-archive-owner-exercise.sh --recover-latest`, has no local
checkpoint interface: it locates the newest remote legal-hold exercise version
and is not applicable to this count. The count was derived by reading all four
recovery runners and their direct runner-level refusal tests. Do not delete a
checkpoint to clear a refusal. The checkpoint is the record of what a past run
produced, and deleting it destroys the only account of where the remote state
actually stands.

### 7.5 The data root during operations

Twenty check scripts read real bytes under `Witness_Tree-data` and verify
them against bound checksums. While the drive is detached, those twenty
cannot be evaluated and no evidence derived from them may be recorded as
satisfied. They still exit non-zero and no gate is relaxed; the record only
makes the reason legible. The inventory is
[`data/data-root-bound-checks.json`](../data/data-root-bound-checks.json) and
the rules are in [DATA_ROOT_BOUND_CHECKS.md](DATA_ROOT_BOUND_CHECKS.md).

Two operational consequences:

- **Do not run a data-root-bound check while a long transform is using the
  drive.** Contention on a single spindle is a real cost and the check will
  tell you nothing you did not already know.
- **Unknown is not zero, absent, or satisfied.** Recording a data-root-bound
  check as passed while the drive is detached is a fabrication, and it is the
  specific fabrication this project is most exposed to.

---

## 8. Declared gaps

These are absences. They are listed so that no reader mistakes this handbook
for a claim that the corresponding control exists. Nothing in sections 1 to 7
contradicts this list.

| ID | Gap | Consequence |
| --- | --- | --- |
| **G1** | **The on-call rota is not staffed.** One accountable owner, no secondary, no handover, no approved coverage window | Outside the hours that person is awake and looking, nothing is detected and nothing is escalated. Phase 8 `on-call-rota` is `fail` and stays `fail` |
| **G2** | **No contact route is recorded.** Deliberately, since contact details are personal data | The escalation timeouts in section 4.2 are policy without a mechanism until a private operator card exists outside Git |
| **G3** | **No monitoring, alerting, dashboard, or log retention.** No uptime probe, no error tracking, no health endpoint, no log sink this project controls. Whether the host retains readable request logs is unverified | Detection is manual. Phase 8 `observability` is `fail` |
| **G4** | **No host support relationship is established.** No recorded support route, entitlement, contact, or expected response time for ChatGPT Sites; no record of who may open a case or what may be disclosed | Section 5.3 escalation to the host has no defined channel |
| **G5** | **The deploy and rollback mechanics of the host are outside this repository.** No deploy script, workflow, or credential exists here; whether the control plane offers a one-click revert is unverified | Sections 6.1 and 6.2 describe the repository half of the procedure completely and the control-plane half by reference only |
| **G6** | **There is no operational kill switch.** The flag exists in pure policy code with no persisted store, no setter, and no deployed sender. No timed rehearsal has been performed | The account service cannot be activated. Phase 6 `killSwitchRehearsalUnderFiveMinutes` and `namedIncidentOwnerAndRunbook` remain open |
| **G9** | **The data root has one copy.** No second copy, no replication, no provider durability evidence | Drive loss loses every derived byte. Phase 8 `backups` is `fail` |
| **G10** | **No incident has ever been rehearsed.** No drill of a site outage, a rollback, a host degradation, or an escalation has been performed or timed | Every timing target in this document is a target, not an observed result |
| **G11** | **No public communication channel exists.** No status page, no operator-driven banner, no monitored intake address; the corrections workflow is policy and fixtures only | Telling the public anything requires a code change and a deploy |

---

## 9. Related records

- [EXTERNAL_GATES.md](EXTERNAL_GATES.md), the controlling register of approvals
  software cannot manufacture
- [PHASE8_LAUNCH_READINESS_EXIT_STATUS.md](PHASE8_LAUNCH_READINESS_EXIT_STATUS.md)
  and [`data/phase8-launch-readiness-exit-status.json`](../data/phase8-launch-readiness-exit-status.json)
- [ARCHIVE_OPERATIONS_READINESS.md](ARCHIVE_OPERATIONS_READINESS.md), the
  archive-control evidence gate
- [IMMUTABLE_RESTORE_DRILL.md](IMMUTABLE_RESTORE_DRILL.md) and
  [IMMUTABLE_STORAGE_CONTRACT.md](IMMUTABLE_STORAGE_CONTRACT.md)
- [DATA_ROOT_BOUND_CHECKS.md](DATA_ROOT_BOUND_CHECKS.md)
- [CORRECTIONS_WORKFLOW.md](CORRECTIONS_WORKFLOW.md)
- [CI.md](CI.md) and [RELEASES.md](RELEASES.md)
- [PLAN_GAP_MATRIX.md](PLAN_GAP_MATRIX.md)
