# Codex implementation prompt, 2026-09-04

Paste everything below the line into Codex. It is written to be self-contained.

---

You are implementing a twenty-task improvement plan for **Witness Tree**, a bilingual
(EN/FR) React 19 application on `vinext` (Vite 8 / Cloudflare Workers), deployed to a ChatGPT
Site at https://www.witnesstree.ca.

Repository: https://github.com/chinonsoobeta/Witness_Tree.git
Base branch: `wt/premises-wave6` at commit `c83f430`, which already contains the province
series and its gate. Branch from that commit or later; anything earlier is missing the six
files this prompt tells you to read.
The full plan, with the evidence behind every task, is at
`docs/IMPROVEMENT_PLAN_2026-09-04.md`. **Read it before writing any code.** This prompt is the
execution contract; that document is the specification.

## What this project is

Witness Tree publishes measured Canadian forest loss derived from NRCan VLCE2 rasters against
Statistics Canada 2021 boundaries. Its entire credibility rests on never overstating what the
data supports. The codebase encodes this as an **evidence-gate architecture**: `data/*.json`
records hold claims, fail-closed `scripts/check-*.mjs` gates verify them, and `tests/*.test.*`
pin behaviour. CI's required job is `verify`. Branch protection is on `main`.

Treat the gates as the point of the project, not as obstacles.

## Absolute rules

Violating any of these is a defect even if every test passes.

1. **Never invent evidence.** Do not record human review, external audit, source rights,
   approval, retention, ingestion, or recovery that did not actually happen.
2. **Never weaken, narrow, disable, or delete a checker to make CI green.** If a gate fails, fix
   the cause or report the failure. Do not add exclusions to make a checker pass.
3. **Never turn Unknown into zero.** Partial coverage stays labelled partial.
4. **Unavailable is not passed.** A check that cannot run without the external SSD must report a
   distinct `unavailable` status, never success.
5. **Never use `--admin` to bypass branch protection.** Never overwrite an immutable release.
6. **Never rebind an owner-admitted checksum** or rewrite historical run-output evidence.
   Engineering-derived checksums may be refreshed only after confirming the bound criterion's
   stated reason still holds and the gate count is unchanged; audit every downstream status
   record afterwards.
7. **Never write to, move, or delete anything under `/Volumes/Extended_SSD/Witness_Tree-data`.**
   It is the only copy of the project data. Read-only access only.
8. **Never commit credentials**, Site source credentials, or bypass tokens.
9. **No U+2014 em dash anywhere**, in code, comments, documentation, or UI copy. En dash is
   correct for numeric ranges (1984–2022) and for missing-value table cells.
10. **Do not deploy.** Merging to main does not update the live Site; deploys are ChatGPT Sites
    control-plane only and are the owner's action. Do not attempt one.

## Scope boundaries you must respect

Several tasks add automation that resembles a Phase 8 exit criterion. Adding the automation does
**not** satisfy the criterion, because the criterion requires a real external event.

`data/phase8-launch-readiness-exit-status.json` currently records 8 of 16 criteria complete
(50 percent). **Leave that count at 8 of 16.** Specifically:

- E7 adds axe-core coverage. This does **not** close `external-accessibility-audit`.
- E9 adds CodeQL, `npm audit`, gitleaks and a threat model. This does **not** close
  `security-review`.
- E10 adds an integrity manifest. A manifest is detection, not backup. This does **not** close
  `backups`.
- E1 adds uptime alerting configuration. This does **not** close `observability`, and you must
  **not** flip `siteTier.monitored`, `claims.syntheticRunObserved`, or `claims.hostTierMonitored`
  in `data/observability-deployment.json`. Those record observed host-tier facts.

If you believe a criterion genuinely should move, stop and say so in your report. Do not move it.

## A hard constraint on anything you touch in Explore

A separate widening workstream is in flight. It has already committed a province series covering
1984–2022, and it owns the tasks listed as moved below. You must not duplicate that work, and you
must not break the constraint it enforces.

Two artifacts describe this forest and **they do not share a denominator**:

- The **annual series** measures each interval against **its own from-year forest mask**, which
  moves as forest regrows. British Columbia alone has **38 distinct denominators**.
- The **cumulative figure** is a per-cell **union** measured against the **fixed 1984 mask**.

Summing BC's 38 intervals gives **14,920,559.37 ha**. The cumulative union is **10,823,352.93 ha**.
The gap is **4,097,206.44 ha**, from two separate causes: overlapping cells counted once rather
than once per interval, and the moving denominator admitting forest that regrew after 1984.

**Never present the interval rows as components that sum to the cumulative figure. Never show a
percentage without its basis.** `scripts/check-phase2-province-series.mjs` enforces this and will
fail if the bases collapse, if the stated difference stops matching its own figures, if either
cause goes unstated, or if a union ever exceeds its sum. Do not weaken that gate to get past it.

The committed files are `data/phase2-province-series-readback.json`,
`data/phase2-province-series.json`, `scripts/build-phase2-province-series-readback.mjs`,
`scripts/build-phase2-province-series.mjs`, `scripts/check-phase2-province-series.mjs` and
`tests/phase2-province-series.test.mjs`. They landed in `c83f430`. Read them before touching
Explore. **Do not edit them.**

The province figures are `admitted: false, released: false, productionEligible: false`. Do not
publish them and do not change those claims.

## Your scope: fourteen tasks

Implement these from `docs/IMPROVEMENT_PLAN_2026-09-04.md`:

**Engineering (8):** E1 uptime alerting and cadence. E2 uptime script discoverability and
`--help`. E3 route payload reduction and budget gate. E5 data-root `unavailable` status and
coverage gate. E7 axe-core accessibility gate. E8 load-test harness. E9 threat model and security
scanning. E10 read-only data-root integrity manifest.

**User interface (6):** U2 four-column `dl` collapse. U3 scroll-contained table. U4 sub-12px text.
U7 legend and layer-list wrap. U8 province bar overflow. U9 fallback status message.

### Not yours: six tasks owned by the widening workstream

**U1** (mobile horizontal overflow on Explore), **U5** (cumulative headline), **U6** (period
single-source), **U10** (date-range formatter), **E6** (`totals.hectares` rename, already done in
the readback layer) and **E4** (deployed-map-render gate circularity). Do not implement these and
do not revert them if you encounter them.

### What the widening has and has not landed

As of this prompt the widening workstream has landed **only its data chain**, in `c83f430`: the
province series, its readback, its gate and its tests. It has **not** landed U1, U5, U6, U10 or
any other Explore user-interface change, and there is no branch carrying them yet.

That has two consequences for your sequencing.

- **Do not wait for U1 to start.** Groups 1, 3, 4, 5 and 6 below touch files the widening is not
  editing. Begin with group 1.
- **Do not begin group 2 (U2, U3, U4, U7, U8) until you are told U1 has landed.** That group edits
  `app/globals.css`, and the widening's U1 fix changes the same Explore rules: it adds a `viewBox`
  and `max-width: 100%` to the fallback SVG and `min-width: 0` to the grid and flex items in the
  Explore chain. Starting group 2 first guarantees a conflict in exactly those rules. If you reach
  group 2 before that notice arrives, move to a later group and say so in your report rather than
  guessing at the fix yourself.

E3's byte ceilings must also be measured **after** the widening lands, or you will lock in a
number the widening immediately breaks.

### Start with E1

`.github/workflows/synthetic-uptime.yml` runs `cron: "0 */6 * * *"` and has **no alerting step of
any kind**. On 2026-09-04 the Site was fully down for 34 minutes (07:44 to 08:18:01 PDT,
dispatch-layer 404 on every route) and nothing fired. Detection comes before optimization.

## Definition of done, per task

1. The defect is fixed at its root cause, not masked.
2. A test or a fail-closed check pins the fix so it cannot regress. For UI tasks that means a
   Playwright assertion; for U1 through U4, U7 and U8 that means viewport assertions at 375, 768
   and 1280.
3. Existing gates still pass without being modified.
4. EN and FR copy stay in sync for any user-visible string.
5. Both light and dark themes are verified for any visual change.

## Verification before you report

Run the repository's own gates: `npm run verify` (or the documented equivalent), the full test
suite, the Playwright suite, and a production build. Verify UI changes in a **rendered browser**
at 375, 768 and 1280 in both themes. Rendered-browser verification is required because this
project has a documented history of layout defects that only a rendered browser finds; U1 itself
is one.

Do not report a task complete on the strength of code presence. Report it complete on the
strength of a passing gate.

## Sequencing

1. E1, E2.
2. U2, U3, U4, U7, U8 as one responsive pass, after rebasing onto the widening's U1 fix.
3. E5, then E3 once the widening has landed.
4. E7, E9, E10, each respecting its Phase 8 boundary.
5. U9.
6. E8 last. Its default target is local or preview. Running it against the production origin
   needs owner authorization at the time of the run; do not run it against production.

Use one branch per group, opening a pull request per group against `wt/premises-wave6`.

## Your final report must state

- Per task: what changed, which gate or test proves it, and the command that runs that proof.
- Every gate you ran, with its actual result. Do not summarize a failure as a pass.
- Anything you could not complete, with the exact blocker. A recorded blocker is a good outcome;
  a silently skipped task is not.
- Confirmation that the Phase 8 completed count is still 8 of 16 and that
  `data/observability-deployment.json` claims are unchanged.
- Confirmation that nothing under the SSD data root was written, moved, or deleted.
- Confirmation that you did not edit the six committed province-series files, and that
  `npm run check:phase2-province-series` still passes.

If a task cannot be done without violating a rule above, **stop and report it**. Do not find a
way around the rule.
