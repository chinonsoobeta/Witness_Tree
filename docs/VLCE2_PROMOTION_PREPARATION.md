# VLCE2 promotion preparation

[`data/vlce2-promotion-preparation.json`](../data/vlce2-promotion-preparation.json) is the repository-controlled record for all 39 Canadian Annual High-Resolution Forest Land Cover (VLCE2) payload versions, 1984–2022. It replaces dependence on the removed scratchpad manifests. It contains the byte length, locally recorded SHA-256, locally recorded whole-file CRC64NVME, S3 `FULL_OBJECT` CRC64NVME in provider base64 form, S3 payload VersionId, deterministic S3 keys, and the Open Government Licence – Canada attribution for every year.

It is a reversible preparation record, not a storage action. The validator has no AWS SDK, upload, retention, or deletion code. Run it with:

```sh
npm run check:vlce2-promotion
```

It validates the current truth supplied for this audit: 1984 is retained in compliance mode through 2033-08-12; 1985–2022 are **not retained**. The latter 38 records still bind known upload evidence, but they are not immutable evidence and cannot be promoted or described as write-once.

The gate is deliberately fail-closed: it requires the complete annual series; each provider CRC64 must decode to the recorded whole-file CRC64NVME; every VersionId must be present and structurally valid; and an entry marked `not-retained` cannot carry a retention mode or date. Fields such as `plannedRetention`, `intendedRetention`, `targetRetention`, and `requestedRetention` are rejected outright. `--require-all-retained` fails until all 39 named payload versions have separately authorised, live S3 retention evidence.

The one retained state is recorded as `operator-reported-live-state`, not as an independent live check performed by this repository. A later irreversible action needs a separate owner decision for the 38 unretained payload versions: approve compliance-mode retention, choose and accept an irreversible retention-until date, apply it only to the listed VersionIds, then read every object back from S3 and replace the affected state with contemporaneous evidence. That workflow is outside this preparation change.

The source is Natural Resources Canada’s [Annual High-Resolution Forest Land Cover, Canada, 1984–2022 catalogue record](https://open.canada.ca/data/en/dataset/2785c103-9c2d-429b-9f3d-89f5cd9ea94d). Reuse must retain: “Contains information licensed under the Open Government Licence – Canada.”
