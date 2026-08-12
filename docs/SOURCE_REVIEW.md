# Source review

This is a process definition and a pure decision contract. It performs no retrieval, hashing, storage write, ingestion, or publication, and it does not assert that any source is currently up to date. No source review has been run against a live publisher change. Nothing here promotes a source to immutable object storage, connects it to product records, or grants production eligibility; every decision this process returns carries `productionEligible: false` and `immutableObjectStorage: false`.

"Accepted", in this document, means only what the staging evidence in [`docs/SOURCE_VERIFICATION.md`](SOURCE_VERIFICATION.md) and [`data/staged-acquisitions.json`](../data/staged-acquisitions.json) already records: admission to verified local staging, and for Québec transformation design only.

| Artifact | Path |
| --- | --- |
| Decision logic and types | `lib/source-review/` |
| Accepted baselines and recorded reviews | `data/source-review-register.json` |
| Register gate (CI, `verify` job) | `scripts/check-source-review.mjs` → `npm run check:source-review` |
| Decision tests | `tests/source-review-contract.test.ts`, `tests/source-review-register.test.mjs` |

## What starts a review

A review compares one accepted source identity with a later observation of that same identity. Any of the following starts one:

- **Update** — the publisher issues new content at the same source identity under a new asserted version.
- **Correction** — the content changed while the publisher still asserts the same version. Anything derived from the previously accepted bytes is in question, and a correction case is opened under [`docs/CORRECTIONS_WORKFLOW.md`](CORRECTIONS_WORKFLOW.md).
- **Licence change** — the licence identifier, licence version, licence URL, or required attribution wording differs from what was accepted.
- **Reprocessing** — recorded on every change decision, because derived work must be recomputed and re-recorded before it can be relied on again.

A review is also started by a scheduled re-check. A re-check that finds no comparable evidence is still a review, and it does not end in "no change".

## Who decides

- The **named source owner** recorded for the source runs the review and records it. `reviewedBy` is required; an unattributed review is not a review.
- **Licence, redistribution terms, and required attribution wording** are re-reviewed by legal review before any reuse. That gate is external and is tracked in [`docs/EXTERNAL_GATES.md`](EXTERNAL_GATES.md); this process cannot close it.
- **Re-acceptance** is not the reviewer's to grant. A withdrawn or suspended source returns to accepted only after every re-acceptance requirement the decision listed has been met and re-recorded through the staging and transformation-admission contracts.

## What evidence a review must carry

Both sides of every comparison must be present before that comparison counts. A missing side is never silently treated as equal, so evidence is either `observed` with a value or `unavailable` with a stated reason in English and French.

- Source identity, the acceptance time, and the observation time. An observation cannot precede the acceptance it is reviewed against, and a review cannot precede the observation it reads.
- The accepted SHA-256 and byte length, and the observed SHA-256 and byte length. An identical SHA-256 cannot accompany a different byte length; that input is rejected as self-contradictory rather than decided.
- The asserted source version on both sides. Without it, an update cannot be separated from a correction, and the review says so instead of guessing.
- Entity tag and last-modified values, used only as weaker content evidence when no comparable checksum exists.
- Licence identifier, licence version, licence URL (HTTPS), and required attribution wording on both sides.
- The list of previously accepted facts, each stating whether it depends on the source bytes, the source identity, or the licence terms. That dependency is what decides which facts a change invalidates.
- A confidence level with its rule and bilingual reason, and every reason in `{en, fr}`.

Malformed or self-contradictory input throws. Insufficient evidence does not throw: it returns a decision that states the gap.

## What states a source can be in

Every review returns exactly one outcome, and each outcome fixes the acceptance state.

| Outcome | Acceptance | When |
| --- | --- | --- |
| `no-change-observed` | `retained` | The observed checksum matches the accepted checksum **and** every licence field compared as equal. This is the only outcome that keeps a prior acceptance, and it records no events. |
| `change-observed` | `withdrawn` | Content or licence terms differ. Records at least one event, always including `reprocessing-needed`, lists the invalidated facts, and lists the re-acceptance requirements. |
| `evidence-insufficient` | `suspended` | Comparable evidence is missing on at least one required side. Records no events, and returns the unanswered question as `Unknown` with a reason. Absence of evidence is not evidence that the source is unchanged. |

Two rules are enforced by the type system as well as by the tests, so weakening either one fails the build rather than the review: a `change-observed` decision can never carry a retained acceptance, and an `evidence-insufficient` decision can never resolve to "no change".

## Registered baselines

`data/source-review-register.json` holds the accepted baselines a future review would compare against, and an empty `reviews` list. Each baseline is checked against its staged acquisition record, so a baseline cannot state a checksum, byte length, acceptance time, or attribution that the staging evidence does not carry. Where a baseline lacks evidence it says so:

- **Québec historic detailed wildfire** — checksum and licence baseline recorded; no publisher version identifier is recorded, so an update cannot be distinguished from a correction and `updateVersusCorrection` stays `undetermined`.
- **Alberta AVI Crown** — checksum baseline recorded; attribution and licence wording remain pending review, so there is no licence baseline to compare against and a later review without further evidence is registered as `evidence-insufficient`.

Neither source has been ingested, promoted to immutable object storage, or connected to product records.
