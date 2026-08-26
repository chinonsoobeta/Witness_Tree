# Current-wildfire derived exact readback

This is a readback-only owner-local path for the checksum-bound BC 216-feature
and Ontario 188-feature derived artifacts. It never lists a bucket, uploads,
completes an MPU, writes retention, rewrites a sidecar, deletes, changes IAM,
uses a governance bypass, or uses a legal hold. It does not admit either source
or derived data to production.

The repository contains an attestation-only record for both payload/manifest pairs in
[`data/current-wildfire-derived-archive-evidence.json`](../data/current-wildfire-derived-archive-evidence.json).
It omits concrete provider identifiers, uses checksum placeholders, records no
audit operations, and closes none of the six-object gate. Do not treat it as a
readback, retention proof, transformation, ingestion, release, or production
record.

The exact contract is machine-checked by
`scripts/check-wildfire-derived-readback.mjs`. It binds account
`286853118812`, profile `WitnessTreeArchiveOperator`, proposed MFA role
`WitnessTreeWildfireDerivedPromotionUploader`, bucket
`witness-tree-raw-archive-ca-central-1`, region `ca-central-1`, the two exact
payload keys and their deterministic `manifest.json` sidecars, local byte/SHA
values, and payload COMPLIANCE retention through
`2033-08-12T00:00:00Z`.

## Owner approval and preflight

The owner must review the exact machine-generated approval, keep it owner-owned
mode 600, and preserve every exclusion in the file. A template can be written
to a private path for review:

~~~sh
umask 077
node scripts/check-wildfire-derived-readback.mjs --approval-template > /private/tmp/witness-tree-wildfire-derived-readback-approval.json
chmod 600 /private/tmp/witness-tree-wildfire-derived-readback-approval.json
~~~

The safe local command is:

~~~sh
zsh scripts/run-wildfire-derived-readback.sh \
  --preflight \
  /private/tmp/witness-tree-wildfire-derived-readback-approval.json
~~~

It verifies the two local artifacts, deterministic sidecar sizes/hashes, exact
scope, retention date, production/Phase 2 exclusions, and approval permissions.
It makes no TOTP or AWS call.

## Conditional MFA readback

Only after the owner has confirmed the distinct role exists with exact
read-only/readback capabilities and the approval passes may the owner run:

~~~sh
zsh scripts/run-wildfire-derived-readback.sh \
  --readback \
  /private/tmp/witness-tree-wildfire-derived-readback-approval.json
~~~

The interactive path creates an MFA session, assumes only the exact derived
role, and then performs eight exact-key `HeadObject` calls: an unversioned head
to discover the concrete version followed immediately by an exact
`--version-id` head for each payload and sidecar. It performs two exact
payload-version retention reads. It requires each payload and sidecar to have
the approved byte length, a concrete version, `FULL_OBJECT` CRC64NVME, and each
payload to have COMPLIANCE retention through `2033-08-12T00:00:00Z`.

The command stops before any mutation if the role is absent, a readback
permission is missing, a key is absent, bytes/checksums drift, a version is not
concrete, or retention is absent/wrong. The proposed IAM record currently has
no live-role evidence and does not include a version-specific read permission;
the existing direct operator session also cannot head the derived keys. Thus
the conditional command is not currently safe to execute.

Even a successful private run cannot change the canonical gate by itself. The
repository has no durable signed or digest-bound verifier that can authenticate
private version identifiers and provider checksum values. Until such a verifier
is implemented and its output integrated, the machine gate remains 0/6.
