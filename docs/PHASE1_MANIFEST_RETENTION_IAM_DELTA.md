# Phase 1 manifest-retention IAM delta

The exact-key IAM delta was applied and read back on 2026-08-25. The checksum-bound, redacted record is [`data/phase1-manifest-retention-iam-applied-2026-08-25.json`](../data/phase1-manifest-retention-iam-applied-2026-08-25.json), checked for record consistency by `npm run check:phase1-manifest-retention-iam-applied-record-consistency`. It proves policy text only: it does not establish any object upload, object-version retention, source admission, transformation, ingestion, release, or Phase 1 completion.

| Role / future path | Required desired delta | Observed live-policy status |
| --- | --- | --- |
| `WitnessTreeArchivePromotionUploader`: federal/general promotion | Applied through live inline policy `ExactApprovedPromotionOnly`; policy readback exactly matched the desired state. | Exact retention scope is six primary and two recovery resources; Access Analyzer returned zero ERROR and SECURITY_WARNING findings. |
| `WitnessTreeCurrentWildfirePromotionUploader` | Applied through live inline policy `WitnessTreeCurrentWildfireExactObjectAccess`; policy readback exactly matched the desired state. | Exact retention scope is eight primary resources; Access Analyzer returned zero ERROR and SECURITY_WARNING findings. |
| `WitnessTreeWildfireDerivedPromotionUploader` | Applied through live inline policy `WitnessTreeWildfireDerivedExactObjects`; policy readback exactly matched the desired state. | Exact retention scope is four primary resources; Access Analyzer returned zero ERROR and SECURITY_WARNING findings. |
| `WitnessTreeArchivePromotionUploader`: canopy recovery | Applied within the same live inline policy `ExactApprovedPromotionOnly`. | The same exact policy readback covers two recovery resources; no recovery object state is inferred. |

All three applied changes allow only `s3:PutObjectRetention` and `s3:GetObjectRetention` for retention. The evidence records no wildcard resource, delete, retention bypass, bucket-administration, or IAM permission. It deliberately does not retroactively claim historical sidecars immutable or any object retained.
