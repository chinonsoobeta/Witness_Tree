# Immutable object-storage implementation decision

**Status:** Proposed implementation design; no provider, bucket, object, retention policy, replication target, or production archive exists yet.

This is the Phase 1 storage design for verified source bytes. It supplements the [acquisition decision](ACQUISITION_DECISION.md) and the example-only [raw archive contract](RAW_ARCHIVE.md). It does not authorize a download, upload, transformation, ingestion, or public release.

## Decision

Use one provider-neutral, append-only raw archive in a **Canadian provider region**. The selected provider must keep the primary bucket, any replica, backups, inventory, and processing scratch used for these source archives in Canada. A provider that cannot document this cannot be selected for Phase 1.

The owner must still name the provider, exact Canadian region, account/project, budget, retention duration, and accountable operator. This decision does not assert that any of those choices has been made.

Object versioning alone is insufficient: the selected service must support write-once retention (for example, Object Lock in compliance mode or an equivalent immutable-retention control) before the first completed raw upload. The bucket must not allow an ordinary operator to shorten retention, delete a retained version, or overwrite a completed raw object.

## Object layout and sidecar

All placeholders below are validated, lower-case safe path segments; `retrieved-at-utc` is UTC in `YYYY-MM-DDTHH-mm-ssZ` form. `original-filename` is a basename only, not a path.

```
raw/{source-id}/{source-version}/{retrieved-at-utc}/{sha256}/payload/{original-filename}
raw/{source-id}/{source-version}/{retrieved-at-utc}/{sha256}/manifest.json
```

The payload object and its `manifest.json` form one snapshot. The SHA-256 in the key is calculated from the exact compressed source bytes. A new retrieval always receives a new prefix; `current`, `latest`, a mutable alias, and an overwrite are prohibited. The existing example key function is intentionally simpler and must remain labelled example-only until a production manifest validator and provider configuration exist.

The JSON sidecar must contain, at minimum:

- snapshot ID; source ID; source-ledger ID when assigned; source and effective versions;
- publisher, catalogue URL, requested URL, licence ID and URL, required attribution, and changes notice;
- retrieval UTC timestamp, HTTP status/content type when known, byte length, original filename, SHA-256, archive-integrity result, and retrieval tool/method version;
- the exact payload and sidecar object keys, provider object version IDs, bucket/account identifier, configured region, retention mode and retention-until timestamp;
- prior snapshot key when superseding a source, plus the local verification record and geospatial-profile reference where applicable; and
- promotion state (`uploaded`, `remote-verified`, or `rejected`) and the accountable reviewer/time for a completed promotion.

No credentials, signed URLs, access keys, or personal data belong in a sidecar or Git.

## Required storage controls

Before the first upload, the owner/operator must provide evidence that the selected archive location has all of the following:

| Control | Required state |
| --- | --- |
| Region and replication | Primary, replica, backup, inventory, and source-processing storage are documented Canadian locations. Cross-border replication is disabled. |
| Versioning | Enabled before writes; every provider version ID is retained in the sidecar. |
| Immutability | Compliance-grade write-once retention, configured before writing raw objects. A retention period and legal-hold procedure are approved by the owner. |
| Access | Dedicated service identity may create objects; read access is least-privilege; only a tightly limited break-glass role may administer retention, with audit logging. No public bucket access. |
| Encryption and audit | Provider-managed or owner-managed encryption is explicitly selected; encryption, object access, policy, retention, and deletion-attempt logs are retained and reviewable. |
| Lifecycle | No expiration, transition, or replica rule may bypass the approved retention period. Multipart/incomplete-upload cleanup is allowed only before a completed retained object exists. |
| Recovery | A Canadian recovery copy or equivalent provider durability/recovery evidence is documented and tested without weakening primary-object retention. |

Retention duration is deliberately not invented here. It is an owner/legal decision because it determines cost, deletion obligations, and whether records remain reproducible for the product lifetime.

## Promotion gates

Promotion is a copy of already verified local bytes, never a transform step. A source is eligible only when every applicable gate passes:

1. The staged record has an exact byte length, SHA-256, successful archive-integrity result, safe local path, retrieval timestamp, and source URL.
2. Source selection, licence/reuse review, publisher attribution, changes notice, and any source-specific release restriction are approved. Québec has metadata-verified attribution; Alberta still needs attribution/source-version review.
3. The approved storage configuration has documented Canadian residency, versioning, immutable retention, access policy, logging, and recovery controls.
4. Upload is made to the new deterministic prefix. The completed remote object’s exact byte count and independently calculated SHA-256 match the local record; provider version IDs and retention evidence are written to the sidecar.
5. A reviewer compares the remote sidecar to the staged record and marks it `remote-verified`. A failed upload, mismatch, or missing retention proof is `rejected`; it never becomes a source-ledger, transformation, ingestion, or public-release input.
6. Transformation requires a separate approval after remote verification. The Alberta AVI profile is blocked pending a deterministic repair-or-quarantine rule for 608 self-intersecting geometries. Raw archive promotion does not waive that gate.

## Verification and rollback

Each completed promotion is verified by reading the remote payload and calculating SHA-256 from those bytes; ETags, object names, and successful upload responses are not checksum substitutes. The verifier also records the returned provider version ID, configured retention state/until date, region, and sidecar SHA-256. A periodic inventory check must compare all sidecars with provider object inventory/versioning records and report missing, extra, mutable, or expired objects.

There is no destructive raw-data rollback. If a source, method, or release is wrong, retain the raw snapshot and its evidence, append a corrected snapshot, and mark the prior snapshot superseded/rejected in the lineage record. A transformed or public release rolls back only by moving a separately versioned release pointer to a prior verified release; it never mutates or deletes the raw snapshot that informed it. Any legal-hold or retention exception requires the owner’s documented process.

## Capacity evidence and first reservation

Current evidence supports these limits only:

| Measure | Bytes | Decimal GB | Binary GiB |
| --- | ---: | ---: | ---: |
| Two locally verified staged ZIPs | 971,285,693 | 0.97 | 0.90 |
| Six priority compressed candidate artifacts, one snapshot each | 92,627,415,442 | 92.63 | 86.26 |
| Conservative raw reservation for one snapshot plus one complete replacement | 185,254,830,884 | 185.25 | 172.53 |

Reserve **at least 200 GB of immutable raw capacity** for the first six-artifact snapshot plus one full replacement, before metadata overhead. This is a planning floor, not a forecast: it excludes uncompressed extraction, geometry repair/quarantine copies, transform scratch, derived files, tiles, releases, backups beyond the replacement, live wildfire snapshots, and future source versions. The only bytes currently verified are the 0.97 GB local staging set; the 92.63 GB total is HEAD-observed candidate volume, not acquired storage.

## Next implementation units

### Codeable now (no provider access)

1. Add a production-staging manifest schema and validator that accepts the required sidecar fields but refuses `remote-verified`, immutable, or production claims unless supplied with independently captured remote evidence.
2. Add deterministic key/sidecar generation and tests for safe segments, no mutable aliases, checksum/key agreement, required attribution, and append-only predecessor links. Keep the current `lib/archive` example-only contract unchanged or clearly separate it from the new real-staging contract.
3. Add an inventory-evidence verifier that consumes a redacted provider inventory export and sidecars; it must check payload/sidecar presence, size, SHA-256 evidence, version ID, retention evidence, and region claim without embedding provider credentials.
4. Add a transformation-admission check that requires `remote-verified` plus source-specific profile gates. It must continue to reject the Alberta AVI data until its geometry policy is accepted and tested.

### Owner/provider decisions before an uploader is written or run

1. Name the provider, exact Canadian region, account/project, bucket, cost centre, storage ceiling, retention period, recovery/replication approach, encryption choice, and accountable operator.
2. Create the immutable bucket with the controls above and retain a redacted configuration/evidence record outside public Git as appropriate.
3. Approve licence/attribution and source version for each source; resolve Alberta review and the blocked national-source records.
4. Choose the provider’s authenticated upload and inventory mechanism. Only then implement the smallest provider-specific adapter and run a non-production proof upload using non-source test bytes.

## Acceptance evidence for Phase 1 storage

Phase 1 can claim immutable raw storage for a source only when its remote payload and sidecar exist in the approved Canadian archive; their byte lengths and SHA-256 values match the local staging record; the provider version IDs and active immutable-retention evidence are captured; attribution is approved; and an independent reviewer has recorded `remote-verified`. Until then, the correct status remains local staging.
