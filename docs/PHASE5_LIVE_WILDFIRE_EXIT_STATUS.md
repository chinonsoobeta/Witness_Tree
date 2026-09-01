# Phase 5 live-wildfire exit status

The machine-checked record at [`data/phase5-live-wildfire-exit-status.json`](../data/phase5-live-wildfire-exit-status.json) reports four local implementation criteria. Its percentage is deliberately an unweighted count of those exact criteria, not a production-readiness percentage.

Three of the four local criteria currently pass: the five public safety display fields; the stale static state after 25 hours; and retention/querying of a simulated May–September season. The scheduled-job criterion fails. Its DST gate selects the required hours, but the dated 100-run receipt records 56 gated no-ops, 44 attempted-refresh failures, and zero real refresh successes. The workflow now commits refreshed files to a bot branch and opens a pull request instead of pushing directly to protected `main`; that code path is not evidence that a scheduled run has succeeded. `npm run check:phase5-live-wildfire-exit-status` re-hashes each cited local evidence file and fails if the observed run history is represented as a pass.

Phase 5 is still incomplete. Cleared feeds and a real operations rehearsal are distinct blocked checkpoints. The deployed routes remain illustrative until they have authoritative endpoints, written reuse/archival rights, admitted versioned snapshots, and production approval. The local simulated season contains no feed data and cannot evidence production retention.

The wildfire surface provides context only. It must not give emergency direction, predict spread, or characterize damage.
