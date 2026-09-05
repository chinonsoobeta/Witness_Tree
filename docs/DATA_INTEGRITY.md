# Data integrity and the recovery position

The SSD data root is the sole copy of the project data. The former internal copy
was deleted on 2026-08-26. No backup or successful recovery is established by
this work. A manifest can detect a later difference; it cannot restore a byte.
Phase 8's backups criterion stays failed and its completed count stays 8 of 16.

```sh
npm run verify:data-root-inventory -- --help
npm run verify:data-root-inventory -- --output /tmp/inventory-first.json
npm run verify:data-root-inventory -- --baseline /tmp/inventory-first.json --output /tmp/inventory-next.json
node --test tests/data-root-inventory.test.mjs
```

Use a new output path each time, with an existing parent outside every data-root
alias. Existing manifests are never overwritten. The source defaults to
`resolveDataRoot()`, currently `/Volumes/Extended_SSD/Witness_Tree-data`.
`--root` permits a read-only comparison against another explicitly named tree.
The scanner opens regular files with `O_RDONLY | O_NOFOLLOW` and streams their
SHA-256 checksums. It includes hidden files and empty directories. Symlink
targets are recorded and hashed as link text, never followed or copied.

The manifest binds sorted paths, entry kinds, sizes and content digests with a
tree digest. A baseline comparison lists additions, missing entries and changed
content or link targets, and fails on any difference. Root absence produces
`unavailable`, null counts and exit 2. Read errors, special files, source changes
during the walk, invalid baselines or content differences produce `failed` and
exit 1. Only a complete inventory or unchanged comparison exits 0.

This is a sequential observation, not an atomic filesystem snapshot. The scanner
checks metadata before and after reads and directory walks and refuses detected
concurrent changes; it cannot prove that no adversarial change escaped those
checks. Preserve the baseline outside the SSD and compare its digest through an
independent trusted record before relying on it. Replacing both a file and its
baseline can defeat an unauthenticated checksum comparison.

If corruption is detected, retain the prior manifest, the new failed observation
and the affected path list. Do not overwrite, move, delete or repair the SSD from
this verifier. Stop downstream use of the affected bytes and assess whether the
specific source can be reacquired and independently verified. Availability of
an upstream source is not a backup or proof that the exact original can be
recovered. Any backup or recovery operation requires its own authorization and
evidence; this script performs neither.
