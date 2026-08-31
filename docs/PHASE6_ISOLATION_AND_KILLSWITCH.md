# Phase 6 direct database isolation and the outbound kill switch

The canonical Phase 6 record now passes `direct-database-tenant-isolation` and keeps `kill-switch-under-five-minutes` at `fail`. This note records what was built, what was actually executed, and the boundary between the local database proof and the still-unprovisioned account service. The separate Canadian managed-service activation blocker remains open.

## What the code now does

### Direct database tenant isolation

[`db/postgres/0001-account-tenant-isolation.sql`](../db/postgres/0001-account-tenant-isolation.sql) creates the `witness_tree` schema, the three account tables, and a `witness_tree_app` role that is `NOSUPERUSER NOBYPASSRLS` and holds no password. Row level security is both `ENABLE`d and `FORCE`d on all three tables, because `ENABLE` alone still lets the table owner read every row and the migration runner is usually the table owner. Each table carries one policy with a `USING` clause and a matching `WITH CHECK` clause against `witness_tree.current_account_id()`, which resolves an unset or blank `witness_tree.account_id` setting to `NULL`. A session that forgets to set a tenant therefore reads nothing rather than everything.

[`scripts/check-postgres-tenant-isolation.mjs`](../scripts/check-postgres-tenant-isolation.mjs) applies that file, seeds two fictional accounts, grants the application role a random single-run password, and then opens a **second connection as that role**, not `SET ROLE` from an admin session. It runs seventeen probes covering cross-tenant reads of saved areas, geometry, alert history and account rows; unfiltered reads; an unset tenant; a blank tenant; cross-tenant update, delete, insert and owner reassignment; an attempt to disable row level security; an attempt to grant itself `BYPASSRLS`; and finally that the victim's own rows survived every attempt. It is fail-closed: with no reachable Postgres it prints `NOT EXECUTED` and exits 75, and it never reports a pass it did not observe.

[`scripts/run-postgres-tenant-isolation-drill.sh`](../scripts/run-postgres-tenant-isolation-drill.sh) (`npm run drill:postgres-tenant-isolation`) starts a throwaway `postgres:17-alpine` container, runs the harness against it, and removes the container on exit. It touches no data root and no cloud resource.

The two new npm scripts are named `drill:`, not `check:`. `scripts/check-data-root-bound-checks.mjs` sweeps every `check:` script when the data root is detached and requires each one to pass or to be inventoried as data-root bound. A drill that needs a provisioned container is neither, so giving it a `check:` name would have made that reconciliation fail for a reason unrelated to the data root.

### The outbound kill switch

[`lib/alerts/outbound.ts`](../lib/alerts/outbound.ts) adds the outbound path that Phase 6 previously did not have: an alert queue, an `AlertSender` interface whose `deliversOutbound` flag is an honest declaration of whether it can reach a person, and `drainQueue`, which reads the kill switch **immediately before every individual send**. That placement is the point of the file. The evaluator in `lib/alerts/triggers.ts` already refuses to build payloads while a kill-switch flag is set, but an evaluator-side check cannot stop work that has already been queued, which is precisely the situation a kill switch exists for.

A refused alert is recorded as `refused` with its reason and is never silently dropped. `drainQueue` also refuses any sender whose `deliversOutbound` is true while the activation gate is incomplete, and the kill switch takes precedence over that gate when both would refuse. The only sender in the repository is a recording sender that delivers nothing.

`createPolledKillSwitch` models the realistic case: the operator's flag lives elsewhere and is read at most once per poll interval, so sends already inside the current interval still go out. `measureKillSwitchStop` engages the switch part way through a real drain and reports the observed elapsed time from that engagement to **the last alert that still went out**, along with `sentAfterEngagement`, the count of sends that leaked past it. It separately reports `queueDrainAfterEngagementMs`, the time to the last refusal, which is when the drain finished walking what remained. Only the first is the stop, and only the first is what `underFiveMinutes` reads. Nothing in that path compares a constant to five minutes.

## What was actually executed

Everything in this section was run on 2026-08-26 on macOS arm64 in the worktree at `wt/p6-isolation`, and the output is copied verbatim. Nothing here is simulated.

### The isolation drill: executed, 17/17 probes held

Docker was available through colima, so the drill ran for real against PostgreSQL 17.11 (`postgres:17-alpine`) in a throwaway container.

```
held: app-role-is-not-privileged (The probing role is neither a superuser nor a BYPASSRLS role); observed "f"
held: row-security-is-forced (All three account tables have row level security enabled and forced); observed "3"
held: saved-area-cross-tenant-read (Account A reading account B's saved areas returns nothing); observed "0"
held: saved-area-unfiltered-read (An unfiltered select as account A returns only account A's saved areas); observed "area-a"
held: saved-area-geometry-not-readable (Account A cannot read the geometry of account B's saved area by primary key); observed "0"
held: alert-history-cross-tenant-read (Account A reading account B's alert history returns nothing); observed "0"
held: account-cross-tenant-read (Account A cannot read account B's account row); observed "0"
held: no-tenant-set-reads-nothing (A session that never sets a tenant reads no rows at all); observed "0"
held: blank-tenant-reads-nothing (A blank tenant setting reads no rows rather than every row); observed "0"
held: saved-area-cross-tenant-update (Account A updating account B's saved area changes no rows); observed "0"
held: saved-area-cross-tenant-delete (Account A deleting account B's saved area removes no rows); observed "0"
held: saved-area-cross-tenant-insert (...); observed "ERROR:  new row violates row-level security policy for table \"saved_area\""
held: saved-area-cross-tenant-reassign (...); observed "ERROR:  new row violates row-level security policy for table \"saved_area\""
held: policy-cannot-be-disabled (...); observed "ERROR:  must be owner of table saved_area"
held: escalation-refused (...); observed "ERROR:  permission denied to alter role"
held: victim-rows-survive (...); observed "area-b:Illustrative only"
held: victim-history-survives (...); observed "history-b"
Direct database tenant isolation: 17/17 probes held.
```

### The negative control: the probes can fail

A drill that has only ever been seen green is not yet evidence, because a probe that cannot fail proves nothing. The same seventeen probes were therefore replayed against the same schema with row level security turned back off, which is exactly the application-filter-only world Phase 6 was in before this change. Fourteen of the seventeen failed:

```
FAILED: saved-area-unfiltered-read; observed "area-a,area-b" expected "area-a"
FAILED: no-tenant-set-reads-nothing; observed "2" expected "0"
FAILED: saved-area-cross-tenant-insert; observed "" expected a refusal
FAILED: victim-rows-survive; observed "area-a:Illustrative only,planted:null" expected "area-b:Illustrative only"
FAILED: victim-history-survives; observed "history-a,history-b" expected "history-b"
Negative control: 14/17 probes failed with row level security disabled.
```

The three that still held are the ownership and superuser checks, which do not depend on row level security and correctly continued to hold.

That control found a real defect in the harness as it was written. The original `victim-rows-survive` probe counted account B's rows, and with isolation removed the count was still one: the attacker had deleted account B's area, reassigned its own area onto account B, and planted a third row. A count cannot tell that apart from an intact victim. Both victim probes now name the surviving row by identity, and both fail in the control, as the output above shows. The scratchpad script used for the control is not part of the repository; it imports the shipped probes rather than restating them.

### The kill-switch rehearsal: executed, 188.087 ms measured

`npm run drill:kill-switch-stop` ran with its defaults: 2000 queued alerts, a 250 ms poll interval, a 1 ms send cost, engaging after 500 sends.

```
"measurement": {
  "queued": 2000,
  "sentBeforeEngagement": 500,
  "sentAfterEngagement": 165,
  "refusedByKillSwitch": 1335,
  "pollIntervalMs": 250,
  "engagedAtMs": 705.514417,
  "firstRefusalAtMs": 893.106458,
  "lastRefusalAtMs": 893.601625,
  "lastSendAfterEngagementAtMs": 893.087625,
  "stopLatencyMs": 188.08720800000003,
  "underFiveMinutes": true
},
"independentlyObserved": false,
"deliversToRecipients": false
```

The measured stop latency was **188.087 ms**, and **165 alerts still went out after the operator engaged the switch** before the next poll observed it. That leak is the honest shape of the mechanism and is reported rather than hidden.

#### The metric that number was computed with was wrong, and was corrected on 2026-08-30

The run above is left exactly as it was recorded. What has changed is what `stopLatencyMs` means.

It was timed to the **last refusal**, which is the moment the drain finished walking the rest of the queue, not the moment sending stopped. Those two are only close when the queue is short. Holding the switch's behaviour fixed at a 250 ms poll and engagement after 500 sends, and multiplying the queue by ten, the old figure went from 184 ms to 349 ms while the switch did exactly the same thing. The number named stop latency has to answer how long alerts kept reaching people, and that question is not sensitive to how much was queued behind them.

`stopLatencyMs` is now timed to the last send that went out after engagement, and `underFiveMinutes` reads it. The old quantity is still reported, under the name `queueDrainAfterEngagementMs`, because an operator watching the process does see it.

The 2026-08-26 run above happens to be unaffected in substance: its `lastSendAfterEngagementAtMs` and `lastRefusalAtMs` are 0.5 ms apart, so under the corrected metric its stop latency is **187.573 ms** rather than 188.087 ms. The defect was latent at that queue size rather than absent, which is why it is pinned by a test rather than only fixed.

A fresh run on 2026-08-30 with the same defaults, output copied verbatim:

```
"measurement": {
  "queued": 2000,
  "sentBeforeEngagement": 500,
  "sentAfterEngagement": 148,
  "refusedByKillSwitch": 1352,
  "pollIntervalMs": 250,
  "engagedAtMs": 650.879666,
  "firstRefusalAtMs": 823.56375,
  "lastRefusalAtMs": 825.949208,
  "lastSendAfterEngagementAtMs": 823.508833,
  "stopLatencyMs": 172.62916699999994,
  "queueDrainAfterEngagementMs": 175.06954199999996,
  "underFiveMinutes": true
},
"independentlyObserved": false,
"deliversToRecipients": false
```

None of this moves the gate. The criterion asks for an operable kill switch stopping real outbound alerts, timed by someone who did not build it. There is still no sender that reaches a person, and this process still timed itself.

### Typecheck, lint and tests

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed, exit 0 |
| `npm run lint` | passed, exit 0, no warnings |
| `tests/alert-outbound-kill-switch.test.ts` | 9 tests, 9 passed |
| `tests/postgres-tenant-isolation-harness.test.mjs` | 7 tests, 7 passed |
| `tests/account-activation-gate.test.ts`, `tests/account-policy.test.ts`, `tests/alert-engine.test.ts` | 9 tests, 9 passed |
| `tests/data-root-bound-checks.test.mjs` and `scripts/check-data-root-bound-checks.mjs` | 16 tests passed; static validation reports 20 of 159 check scripts data-root bound, unchanged |
| `npm run check:phase6-account-alert-exit-status` | passed, reports 4/5 (80%) |

The full `npm run test:unit` suite was deliberately not run: it sweeps files that read the real data root, and a long real-data transform was running there.

Two of the kill-switch tests failed when first executed, and the failure was real rather than incidental. Both called `measureKillSwitchStop` against the wall clock with a zero-cost sender, so the entire drain completed inside a single poll interval, the switch was never observed, and the measurement correctly refused to report a duration it had not seen. Whether they passed depended on how fast the machine was. They now inject a stepping clock, so the arithmetic and the accounting are deterministic, and the wall-clock number comes from the rehearsal script instead. Ten consecutive runs passed.

## Distance remaining to each criterion

### `direct-database-tenant-isolation`

The criterion reads: one account cannot read another account's saved areas, proven by a test that attempts it directly against the database. It now passes on the direct, falsifiable PostgreSQL evidence below. Hosting remains a separate activation blocker.

- *No direct database isolation test exists.* This is now false. A test exists, it attempts cross-tenant reads and writes directly against a real PostgreSQL server as an unprivileged role over a separate connection, it was executed, all seventeen probes held, and it demonstrably fails when isolation is removed.
- *No row-level-security policy exists.* This is now false. The policies exist, are forced, and were verified in a live server.
- *No managed Canadian database exists.* This remains true and is untouched by anything above. The drill ran in a throwaway container on a developer laptop.

The isolation criterion is met and the hosting requirement is not. Nothing in this work proves Canadian residency, encryption at rest, or that these policies were applied to a deployed database. The migration is checked in; it has been applied to nothing but a container that no longer exists. Those missing facts remain explicit in `canadian-managed-service-and-direct-rls`.

**Activation still needs provisioned infrastructure.** The harness is written to point at any Postgres through `WITNESS_TREE_PG_ADMIN_URL`, so the day a managed Canadian instance exists this is one command.

### `kill-switch-under-five-minutes`

The criterion reads: the kill switch stops all outbound alerts within 5 minutes. Its stated reason had three parts.

- *No outbound queue or sender exists.* This is now false in structure and still true in substance. A queue, a sender interface and a drain loop exist, and the switch is checked at the send rather than only in the evaluator. But the only sender in the repository delivers nothing. There is no configured transport, no verified sending domain, and no recipient. A kill switch measured against a sender that reaches nobody is a measurement of a loop.
- *No independent timed rehearsal has been observed.* This remains entirely true. The process timed itself. No person who did not build this observed it. The number below is self-reported by the code under test, which is the weakest possible form of the evidence this criterion asks for.
- *A unit test cannot establish a five-minute operational bound.* Still true, and the 188.087 ms figure must not be read as one. It is the latency of an in-process loop draining a recording sender on one laptop. A deployed system adds a shared flag store, network round trips, multiple sending workers that must each observe the flag, a provider-side queue that may already hold accepted messages, and retries. None of those are modelled, and the one that matters most is the last: once a real provider has accepted a message, this switch cannot recall it. The correct statement of what was measured is that **this code stopped its own drain 188.087 ms after the flag was set, allowing 165 further sends through in the interval**, and that the bound scales with the poll interval, not with anything proven about five minutes.

**Needs both provisioned infrastructure and an independent human observer.** Neither is substitutable by more code. What the code contributes is that a rehearsal is now possible at all, that the stop point is at the send, and that the harness reports a measured duration and a leak count rather than an assertion.

## Independent re-execution and the gate decision

Everything above was written by the engineer who built it. On 2026-08-26 the same drills were re-run independently, from the same tree, by the integrating engineer, before any of it was committed.

- The isolation drill was re-run: **17 of 17 probes held**, with the same observed values, including `escalation-refused` returning `permission denied to alter role` and `victim-rows-survive` returning `area-b:Illustrative only`.
- The negative control was reproduced independently by commenting out the six `ENABLE`/`FORCE ROW LEVEL SECURITY` statements and re-running: **3 of 17 probes held**. The fourteen failures include `victim-rows-survive` observing `area-a:Illustrative only,planted:null`, which is account B's own area deleted, account A's area reassigned onto B, and a planted row surviving. A probe that merely counted account B's rows would have observed one row and reported this as a pass. The identity-bound form catches it. That is the clearest available demonstration that these probes are not vacuous.
- The kill-switch rehearsal was re-run and measured **186.878 ms**, with 500 sends before engagement, 163 after it, and 1337 refused. The 188.087 ms and 165 sends recorded above are the record of the first run and are left as written. The two runs differ because the figure is a timing of a local loop, not a property of the system. Neither number is a bound, and the gap between them is itself the reason it is not one.
- `npm run typecheck` and `npm run lint` both reported nothing, the two new test files pass 16 of 16, and `npm run check:phase6-account-alert-exit-status` reports 4 of 5.

### Gate outcome

`direct-database-tenant-isolation` is `pass` because the criterion asks for a direct database attempt, and the independently repeated positive and negative-control runs establish that narrow fact. The pass does not activate accounts or imply a deployed database. The Canadian managed-service blocker remains open.

`kill-switch-under-five-minutes` stays `fail`, for the reasons the section above gives. Phase 6 is 4 of 5; the account service remains unavailable and default-closed.

## Boundary

No real personal data was used. The two seeded accounts are fictional, the container was deleted, and no outbound message was sent to anyone. `lib/accounts/activation-gate.ts` is unchanged and still defaults closed, so none of this evidence can activate an account service on its own.
