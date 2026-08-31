# Current-wildfire exact-version read IAM evidence: 2026-08-25

The inline policy `WitnessTreeCurrentWildfireExactObjectAccess` on
`WitnessTreeCurrentWildfirePromotionUploader` received one additive action:
`s3:GetObjectVersion`. Its scope remains the eight exact current-wildfire raw
payload and `manifest.json` keys pinned by
`data/current-wildfire-immutable-promotion-preparation.json`; it grants no
wildcard or other-key access.

The redacted, checksum-bound attestation is
[`data/current-wildfire-versioned-readback-iam-applied-2026-08-25.json`](../data/current-wildfire-versioned-readback-iam-applied-2026-08-25.json).
It records the approved base and desired/readback policy hashes, zero blocking
Access Analyzer findings, an allowed exact `s3:GetObjectVersion` simulation,
and an implicit deny for an out-of-scope object. The full preparation-file hash
records the exact state used at apply time; the separately bound eight-key hash
continues to verify IAM scope even when unrelated archive/admission metadata is
later clarified. Verify its internal bindings without contacting AWS:

```sh
npm run check:current-wildfire-versioned-readback-iam-applied-record-consistency
```

This is an IAM-boundary record only. It is not evidence that any archive object
exists, was read, was retained, or is production-admitted. In particular, the
operator's exact-version `HeadObject` returned 403 Forbidden for the existing
CWFIS payload; recovery refused rather than replacing an unreadable object.
No replacement write is authorized or claimed.
