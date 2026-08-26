# VLCE2 remote promotion workflow

`scripts/vlce2-remote-promotion.mjs` is the executable Phase 1 workflow for the 39 VLCE2 payload records. It starts in dry-run mode and does not call AWS unless `--execute` is provided. It pins the Canadian bucket, `ca-central-1`, every payload key, and every payload VersionId from the repository-controlled preparation record.

Dry run (safe; no AWS calls or writes):

```sh
node scripts/vlce2-remote-promotion.mjs
```

Execution is intentionally irreversible for the 38 currently unretained payload versions. After separate owner approval of the exact retention date and all consequences, the command would be:

```sh
node scripts/vlce2-remote-promotion.mjs --execute --approve-compliance-retention --retention-until 2033-08-12T00:00:00Z --sidecar-dir /controlled/empty/vlce2-sidecars
```

Do not run that command until the owner has explicitly approved the compliance retention date. It first reads every one of the 39 exact payload versions and fails on any byte, CRC64, checksum-type, or VersionId drift. Only then does it create deterministic bilingual, OGL-Canada-attributed manifest sidecars, upload and read them back, and apply `COMPLIANCE` retention to the 1985–2022 payload VersionIds. Sidecars are deliberately rebuildable, not locked; their named payloads are the immutable evidence.

After every retention request, the workflow reads the same payload version with `get-object-retention` and fails unless it reports `COMPLIANCE` and the exact approved instant. A successful request alone is never evidence of a lock. The first complete independent read-back is recorded in [`data/vlce2-remote-promotion-evidence.json`](../data/vlce2-remote-promotion-evidence.json); its local gate is `npm run check:vlce2-remote-promotion`.
