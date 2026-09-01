# Archive recovery copy record

`data/archive-recovery-copy.json` is the evidence record for the Phase 8 `backups` gate. It records
a Canadian recovery copy of the raw archive: where the copy lives, which primary object versions it
covers, how the objects that already existed were covered, what retention the copy carries, and the
result of restoring from it.

**The file does not exist yet, and it must not be written by hand.** It is the output of an AWS run
performed by the lead engineer, following the sequence in section 5 of
[PHASE8_IMPLEMENTATION_PLAN.md](PHASE8_IMPLEMENTATION_PLAN.md). `npm run
check:archive-recovery-copy` fails today, and that failure is correct: no recovery copy has been
made. A plausible-looking record assembled from invented bucket names and version identifiers would
be worse than no record, because it would flip a gate on a copy that does not exist.

`scripts/check-archive-recovery-copy.mjs` is repository-only. It makes no AWS call and has no write
path. It reads the record and cross-checks it against
[`data/immutable-promotions.json`](../data/immutable-promotions.json) and
[`data/vlce2-remote-promotion-evidence.json`](../data/vlce2-remote-promotion-evidence.json), which
together record the 84 primary object versions this project relies on: three promoted payloads and
their manifests, plus 39 VLCE2 payloads and their sidecars. 42 of those 84 are under compliance-mode
Object Lock; the manifests and sidecars are deliberately unlocked.

## Before anything is enabled

Three consequences belong in front of the archive owner, and two of them are recorded in this file:

- Replicating an object under compliance-mode Object Lock replicates the lock. The copy's retention
  is equally irrevocable, by anyone including the account root. This doubles an irreversible storage
  commitment. It is not a reversible backup, and the record has to say so in its own words.
- An S3 replication rule applies only to objects written after the rule was created. The existing
  payloads are covered only if S3 Batch Replication is run as a separate, deliberate action.
- The superseded flat-key object versions recorded in `data/immutable-promotions.json` replicate too
  unless the rule filters them out. The decision goes in the record either way.

The region decision itself is recorded in the `recoveryCopy` and `replication` decision fields of
[`data/archive-operations-readiness.json`](../data/archive-operations-readiness.json), not here.

## Record shape

Every field below is required unless the text says otherwise. A field that is absent, null, or set
to a placeholder such as `"unknown"` is a failure. Counts in particular are never coerced to zero: a
zero written where nobody looked reads as "nothing failed", which is a different claim from "nothing
was observed".

### Top level

| Field | Value |
| --- | --- |
| `schemaVersion` | `"witness-tree/archive-recovery-copy/1"` |
| `status` | `"recovery-copy-verified"` when every admitted primary object version is covered, `"partial-coverage"` otherwise. Nothing else is accepted. |
| `productionEligible` | `false`. A recovery copy is a storage fact and admits nothing into production. |
| `notice` | Plain-language statement of what the record does and does not claim. |
| `observedAt` | Whole-second UTC instant, `YYYY-MM-DDTHH:MM:SSZ`. |

### `primary` and `destination`

`primary` records `bucket`, `region`, and `countryCode` for the bucket being copied. `destination`
records the same three for the copy, plus `versioning` (`"Enabled"`), `objectLockEnabled` (`true`),
and `regionEvidenceReference`, a non-secret note of the call that established the region, in the
style used by `data/immutable-promotions.json`.

Only `ca-central-1` and `ca-west-1` are accepted, `countryCode` must be `CA`, and the destination
bucket must differ from the primary bucket. Any other region is rejected outright:
[ARCHIVE_OPERATIONS_READINESS.md](ARCHIVE_OPERATIONS_READINESS.md) requires every destination to be
documented as Canadian before replication is enabled. `ca-west-1` is Canadian but is not yet an
approved region, so a `ca-west-1` destination also needs `destination.regionApproval` naming the
owner decision that approved it.

### `replicationRule`

`id`, `status` (`"Enabled"`), and `scope` describe the rule. `appliesToExistingObjects` must be
`false`: that is how S3 behaves, and a record claiming otherwise is asserting something false about
the service rather than describing it. `supersededFlatKeyVersionsExcluded` is a boolean recording
what the rule actually does with the superseded flat-key versions, and
`supersededFlatKeyDecision` is the prose decision behind it.

### `batchReplication`

`performed` must be `true`, with a `jobId`, `status: "Complete"`, a UTC `completedAt`, and observed
`objectsReplicated` and `objectsFailed` counts. `objectsReplicated` must be greater than zero and
`objectsFailed` must be zero. Without a completed Batch Replication job the objects that already
existed are not covered, whatever the live rule says.

### `objectLock`

`destinationRetentionMode` must be `"COMPLIANCE"`, with a `destinationRetainUntilDate` in
`YYYY-MM-DDTHH:MM:SSZ` or the `+00:00` form AWS returns. `replicatedFromPrimary` and `irreversible`
must both be `true`, and `irreversibilityAcknowledgement` must state plainly that the replicated
retention cannot be shortened or removed. The wording is the engineer's, but the acknowledgement is
not optional: it is the point at which the doubling of an irrevocable commitment is written down.

### `objects`

One entry per destination object version, each with `primaryKey`, `primaryVersionId`,
`destinationKey`, `destinationVersionId`, `byteLength`, `replicationStatus` (`"REPLICA"`),
`coveredBy` (`"live-replication"` or `"batch-replication"`), `checksumCrc64nvmeBase64` where the
primary record carries one, and `retention`.

Each entry must map to an admitted primary object version by key and version identifier. An entry
that maps to nothing, or two entries claiming the same primary version, are both rejected. The byte
length and provider checksum must equal the primary's, because a replica is byte identical to its
source. `retention` carries the mode and retain-until date when the mapped primary is locked, and
must be `null` when it is not, so an unlocked sidecar is not written up as though it were locked.

### `coverage`

`admittedPrimaryObjectCount` must equal the number of admitted primary object versions the checker
computes from the two source records. `replicatedObjectCount` must equal the length of `objects`.
`uncoveredPrimaryObjects` is an array of `key@versionId` strings and must list exactly the admitted
primary versions this record does not cover; an absent array is not an empty one. `complete` must
equal the computed comparison. A record covering everything must say `recovery-copy-verified`, and a
record leaving anything uncovered must say `partial-coverage`; neither may overstate or understate.

### `recoveryExercise`

`performed` must be `true` and `status` must be `"passed"`, with whole-second UTC `startedAt` and
`completedAt`. `restoredFrom` names the `bucket`, `key`, and `versionId` actually restored, and must
be a destination object version listed in `objects`, in the destination bucket. Restoring from the
primary proves nothing about the copy.

`expected` and `observed` each carry a `byteLength` and a lowercase hexadecimal `sha256`.
`byteLengthMatches` and `sha256Matches` must equal the computed comparisons, and both must be true:
the recovered bytes are verified by checksum, not asserted to be correct.

`primaryRetentionBefore` and `primaryRetentionAfter` each carry `key`, `versionId`, `mode`, and
`retainUntilDate`, read back from the primary object version the restored copy was made from.
`primaryRetentionUnchanged` must equal the computed comparison of the two and must be true. This is
what the `recovery-and-replication` control asks for: a recovery exercise record that preserves
primary-object retention. `temporaryCopyRemoved` must be `true`.

## Credentials

The record is scanned, key and value alike, for credential-shaped material. Access key identifiers,
STS session tokens, shared-credentials key names, session-token headers, MFA device serials, MFA and
TOTP codes, and bare six-digit one-time codes are rejected wherever they appear, and so are fields
named after any of them in camelCase, snake_case, or kebab-case. None of this material has any place
in a committed evidence record, and a record carrying it fails rather than being quietly redacted.

## Read-only runner

[`scripts/run-archive-recovery-copy.mjs`](../scripts/run-archive-recovery-copy.mjs) produces this
record only after the archive owner has approved and completed the AWS mutation. It does not create
a bucket, enable a rule, start a Batch Replication job, change retention, delete an S3 object, or
amend either owner decision. Its AWS transport permits only these read operations:

- `get-bucket-location`, `get-bucket-versioning`, `get-object-lock-configuration`, and
  `get-bucket-replication`;
- `describe-job` for the named Batch Replication job;
- exact-key `list-object-versions`, exact-version `head-object`, and exact-version
  `get-object-retention`; and
- exact-version `get-object` into a private temporary directory for byte comparison and the restore
  exercise.

The temporary restore is removed before a passing record is assembled. The runner first requires
the `recoveryCopy` and `replication` decisions in `data/archive-operations-readiness.json` to be
`approved` and `approved-canadian`. Those decisions are currently unapproved, so a live invocation
stops before its first AWS call. That is the intended present behavior.

The runner enumerates the same 84 primary object versions as the checker. It verifies the primary
version, completed source replication status, destination `REPLICA` version, byte length, provider
checksum where recorded, and retention for each. The three manifests without a recorded provider
checksum are compared by exact-version SHA-256 instead. Missing or truncated version observations,
no matching replica, and more than one byte-identical matching replica all fail closed. The runner
does not emit a partial record.

After accounting for all objects, it restores the smallest locked payload from the destination,
checks its byte length and SHA-256 against `data/staged-acquisitions.json` or
`data/vlce2-promotion-preparation.json`, and reads the exact primary version's retention before and
afterwards. It then passes the assembled record through `validateArchiveRecoveryCopy` before it can
be written.

The owner supplies a private, uncommitted input file with this shape:

```json
{
  "schemaVersion": "witness-tree/archive-recovery-copy-run-input/1",
  "awsAccountId": "111122223333",
  "replicationRuleId": "owner-selected-rule-id",
  "batchReplicationJobId": "owner-completed-job-id",
  "supersededFlatKeyVersionsExcluded": false,
  "supersededFlatKeyDecision": "Owner decision recorded before enabling the rule.",
  "irreversibilityAcknowledgement": "The replicated COMPLIANCE retention is irreversible and cannot be shortened or removed before its retain-until date."
}
```

The superseded-key boolean is checked against the observed rule prefix; it is not accepted on trust.
Only an all-objects or key-prefix rule can be accounted for from these repository records. A tag or
compound filter is rejected because the runner cannot establish coverage without unrecorded object
tag state.

Use absolute paths. The output path must not already exist and is written with mode `0600`:

```sh
npm run run:archive-recovery-copy -- \
  --input /absolute/private/archive-recovery-copy-run-input.json \
  --write /absolute/private/archive-recovery-copy.json
```

Only after reviewing that generated file should the owner deliberately place it at
`data/archive-recovery-copy.json`. This remediation unit does not run the copy operation and does not
create that canonical evidence file.

## Running the check

```
npm run check:archive-recovery-copy
```

The checker runs first, and while `data/archive-recovery-copy.json` is absent it fails and stops
there, so the paired tests are not reached by this script today. Run them directly in the meantime:

```
node --test tests/archive-recovery-copy.test.mjs
```

`scripts/run-ci-tests.mjs` discovers every `tests/*.test.mjs` file, so CI runs them either way. They
build valid and defective fixtures in a temporary directory and never read the evidence file, so
they keep meaning something before the AWS run happens as well as after it.
