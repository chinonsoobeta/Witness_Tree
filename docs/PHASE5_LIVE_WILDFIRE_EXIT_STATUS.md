# Phase 5 live-wildfire exit status

The machine-checked record at [`data/phase5-live-wildfire-exit-status.json`](../data/phase5-live-wildfire-exit-status.json) reports four local implementation criteria. Its percentage is deliberately an unweighted count of those exact criteria, not a production-readiness percentage.

All four local criteria currently pass: Pacific DST scheduling; the five public safety display fields; the stale static state after 25 hours; and retention/querying of a simulated May–September season. `npm run check:phase5-live-wildfire-exit-status` re-hashes each cited local evidence file and fails if a criterion, percentage, or blocker is changed without evidence.

Phase 5 is still incomplete. Cleared feeds and a real operations rehearsal are distinct blocked checkpoints. The deployed routes remain illustrative until they have authoritative endpoints, written reuse/archival rights, admitted versioned snapshots, and production approval. The local simulated season contains no feed data and cannot evidence production retention.

The wildfire surface provides context only. It must not give emergency direction, predict spread, or characterize damage.
