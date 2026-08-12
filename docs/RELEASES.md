# Data releases

Each published data release has a versioned manifest. It records the release ID
and date, latest data end year, boundary edition, method version, bilingual
release note, corrections link, and the stale/degraded state. Every artifact
must have an immutable SHA-256 checksum and licence ID.

Validate a manifest and any local artifact paths with:

```sh
node scripts/verify-release.mjs path/to/manifest.json
```

The verifier checks each supplied `localPath` against its declared SHA-256.
Never replace an artifact under an existing release ID; publish a new manifest
and compare it with the prior one using `compareArtifacts`.
