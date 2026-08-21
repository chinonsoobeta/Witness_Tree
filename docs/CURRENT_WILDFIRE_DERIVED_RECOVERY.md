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

The owner must create three private inputs. The commands below are local only;
they do not call AWS:

```sh
umask 077
node scripts/check-wildfire-derived-recovery.mjs --approval-template > /private/tmp/witness-tree-wildfire-derived-recovery-approval.json
chmod 600 /private/tmp/witness-tree-wildfire-derived-recovery-approval.json
node scripts/check-wildfire-derived-recovery.mjs --state-template > /private/tmp/witness-tree-wildfire-derived-recovery-state.json
chmod 600 /private/tmp/witness-tree-wildfire-derived-recovery-state.json
```

The owner must change only the approval `status` to `owner-approved` and
`approved` to `true`, and fill the private BC payload `versionId` and
`checksumCRC64NVME` from an exact read-only head. The opaque values must remain
in the mode-600 state file and must not be committed or pasted into chat.

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

The runner refuses an existing evidence path, a preexisting BC manifest or
Ontario key, any mismatch, and any missing exact readback. It has no command
path for BC payload upload, multipart operations, deletion, governance bypass,
legal hold, or IAM access.
