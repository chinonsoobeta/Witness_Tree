# Archive operations readiness gate

`data/archive-operations-readiness.json` is the Phase 1 evidence record for the archive controls that are currently absent from the empty AWS bucket. It is intentionally **blocked** and `productionEligible: false`. Passing `npm run check:archive-operations-readiness` confirms that this record is structurally complete and does not overstate readiness; it does not make the archive ready.

The record separately preserves the recovery-copy and replication decisions. It also requires owned evidence for five controls:

- dedicated upload and break-glass identities;
- object-access, policy, retention, and deletion-attempt logging;
- lifecycle rules measured against an approved retention duration;
- legal-hold procedure, authorized role, audit review, and an exercise; and
- a Canadian recovery/replication decision with a recovery exercise that preserves primary retention.

For a control to become `evidenced`, add at least one redacted evidence object for every listed requirement. Each object needs a kind, UTC capture instant, non-secret reference, and reviewer role. References may point to a private configuration record; do not put account IDs, credentials, signed URLs, personal data, or raw source bytes in Git.

The gate permits `status: "ready"` only when every control is evidenced and both the recovery-copy and Canadian-replication decisions are approved. `productionEligible` is permanently `false` in this record: even a ready archive-control package cannot authorize raw-source promotion. That remains subject to the immutable-storage, attribution, checksum, remote-verification, and reviewer gates in [IMMUTABLE_STORAGE_DECISION.md](IMMUTABLE_STORAGE_DECISION.md).

Current provisioned-state facts and their limitations remain in [IMMUTABLE_STORAGE_PROVISIONING.md](IMMUTABLE_STORAGE_PROVISIONING.md). No cloud configuration is changed by this record or check.
