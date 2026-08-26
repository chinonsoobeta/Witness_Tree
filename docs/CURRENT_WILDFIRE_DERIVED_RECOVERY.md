# BC/Ontario derived-wildfire recovery package

This package is a preparation-only, owner-local recovery path for the observed
Phase 1 state. It does not change the canonical admission gate by itself.

The exact owner authorization text is:

> I authorize one bounded recovery in AWS account `286853118812`, region
> `ca-central-1`, bucket `witness-tree-raw-archive-ca-central-1`, using the
> existing MFA-gated role `WitnessTreeWildfireDerivedPromotionUploader` through
> profile `WitnessTreeArchiveOperator`.
>
> Reuse only the exact preexisting BC 216-feature derived payload version bound
> in the owner-only mode-600 private state file. Do not upload that BC payload a
> second time. Create only its deterministic `manifest.json` at the exact
> approved BC key, then read back its concrete version, bytes, and
> `FULL_OBJECT` CRC64NVME checksum. Upload only the exact Ontario 188-feature
> derived payload and its deterministic `manifest.json` at the exact approved
> keys, using direct conditional `PutObject` with CRC64NVME and reading back
> each concrete version, exact bytes, and `FULL_OBJECT` CRC64NVME checksum.
>
> Apply and read back `COMPLIANCE` retention through
> `2033-08-12T00:00:00Z` only on the existing BC payload version and the new
> Ontario payload version. If either payload already has the exact retention,
> verify it and do not rewrite it. Refuse any wrong retention, missing exact
> version, checksum mismatch, preexisting target key, conditional-write race,
> or failed readback.
>
> Exclude a second BC payload upload, overwrites, bucket or prefix listing,
> multipart listing/upload/completion, deletion, replication, governance
> bypass, legal hold, IAM changes, other keys, source transformation,
> ingestion, release, production inference, and Phase 2. Preserve BC `V10755`
> quarantine and all existing non-production claims. Write the final evidence
> only to the owner-provided mode-600 evidence path; preserve the private state
> unchanged on failure.

The four exact approved object resources are the two payload/manifest pairs
below; no prefix or wildcard is authorized:

```text
derived/bc-wildfire/bc-wildfire-geometry-policy-v1-2026-08-14/2026-08-14T20-31-39Z/8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce/payload/bc-wildfire-216-feature-release.gpkg
derived/bc-wildfire/bc-wildfire-geometry-policy-v1-2026-08-14/2026-08-14T20-31-39Z/8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce/manifest.json
derived/on-fire-disturbance/ontario-in-year-fire-geometry-policy-v1-2026-08-14/2026-08-14T13-49-36Z/5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31/payload/ontario-in-year-fire-perimeters-188-feature-derived.gpkg
derived/on-fire-disturbance/ontario-in-year-fire-geometry-policy-v1-2026-08-14/2026-08-14T13-49-36Z/5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31/manifest.json
```

The owner must create the approval and applied-IAM inputs locally. The private
recovery state is different: only the configured `default` profile for the
approved account root may generate it, immediately before the owner run. That
read-only generator makes exactly two BC payload heads (latest and concrete
version) and three exact target heads. It accepts only provider `404`/`NotFound`
absence for the three target keys; an access-denied or any other response is
ambiguous and fails closed. It does not list a bucket or prefix, prints no
opaque version/checksum values, and writes a 15-minute-expiry mode-600 state.

Create the private approval input locally:

```sh
umask 077
node scripts/check-wildfire-derived-recovery.mjs --approval-template > /private/tmp/witness-tree-wildfire-derived-recovery-approval.json
chmod 600 /private/tmp/witness-tree-wildfire-derived-recovery-approval.json
```

Change only the approval `status` to `owner-approved` and `approved` to `true`.
Do not hand-edit the state or copy its opaque values into chat. Immediately
before either preflight or recovery, generate a fresh state as follows (this is
the only state-capture command that calls AWS, and it is read-only):

```sh
umask 077
node scripts/capture-wildfire-derived-recovery-state.mjs \
  --state /private/tmp/witness-tree-wildfire-derived-recovery-state.json
```

Run the local preflight first:

```sh
zsh scripts/run-wildfire-derived-recovery.sh --preflight \
  /private/tmp/witness-tree-wildfire-derived-recovery-approval.json \
  /private/tmp/witness-tree-wildfire-derived-recovery-state.json \
  /private/tmp/witness-tree-wildfire-derived-readback-iam-attestation.json \
  /private/tmp/witness-tree-wildfire-derived-recovery-evidence.json
```

Only after the owner has independently confirmed the authorization and private
state should the owner run the MFA-gated path:

```sh
zsh scripts/run-wildfire-derived-recovery.sh --recover \
  /private/tmp/witness-tree-wildfire-derived-recovery-approval.json \
  /private/tmp/witness-tree-wildfire-derived-recovery-state.json \
  /private/tmp/witness-tree-wildfire-derived-readback-iam-attestation.json \
  /private/tmp/witness-tree-wildfire-derived-recovery-evidence.json
```

For a future owner-local run, the wrapper combines the fresh root/default
state capture and local preflight before it reaches the existing MFA-gated
runner. It refuses a preexisting state or evidence path, including partial or
completed evidence, and does not handle or store the TOTP:

```sh
zsh scripts/run-wildfire-derived-recovery-owner.sh --recover \
  /private/tmp/witness-tree-wildfire-derived-recovery-approval.json \
  /private/tmp/witness-tree-wildfire-derived-recovery-state.json \
  /private/tmp/witness-tree-wildfire-derived-readback-iam-attestation.json \
  /private/tmp/witness-tree-wildfire-derived-recovery-evidence.json
```

The runner refuses completed evidence, a preexisting BC manifest or Ontario
key, any mismatch, and any missing exact readback. It has no command
path for BC payload upload, multipart operations, deletion, governance bypass,
legal hold, or IAM access.

The evidence file is an owner-only mode-600 checkpoint. It is written after
each successful exact head and after each successful retention readback, so a
failure cannot be mistaken for an atomic multi-object operation. A completed
evidence file blocks another run. Partial evidence is diagnostic only, not a
resume authorization: if a conditional write races with an object created
after the root/default absence proof, the runner stops without overwriting and
refuses a recovery retry before MFA. Preserve the partial evidence for owner
review; do not delete it or reuse it as permission to infer remote state. A
fresh root/default capture is valid only when all three target keys still prove
exact `404` absence. The runner rechecks the 15-minute private-state expiry
after MFA role assumption and never treats a `403` as proof of absence or adds
`ListBucket` permission.

## Repository evidence boundary

The repository-integrated summary is
[`data/current-wildfire-derived-archive-evidence.json`](../data/current-wildfire-derived-archive-evidence.json),
validated by `npm run check:current-wildfire-derived-archive-evidence` and
`scripts/check-current-wildfire-derived-archive-evidence.mjs`. It contains no
concrete provider version/checksum binding and lists no audit operations. It is
therefore an attestation-only historical record, not exact-version readback,
retention, recovery, transformation, ingestion, release, or production proof.
The integrated raw and derived records leave the gate at 0/6 machine-verifiable
and 6/6 attested-only. A durable signed or digest-bound verifier and separate
downstream evidence are required before that state can change.
