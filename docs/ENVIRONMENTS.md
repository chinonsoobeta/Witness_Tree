# Environments and promotion controls

This document defines the required environment model and the owner's selected host split. It does not imply that every selected environment, cloud account, secret store, database, bucket, or deployment is provisioned.

| Environment | Purpose | Admission and exit control |
| --- | --- | --- |
| Development | Local implementation and synthetic or clearly labelled illustrative fixtures. | Never represents a source as acquired, admitted, production eligible, or publicly released. |
| Data review | Human review of newly acquired or transformed source evidence before it may reach staging. | Requires source-ledger completeness, licence/attribution review, checksum-bound provenance, automated ingestion validation, and the required human review. Incomplete evidence remains unavailable or Unknown. |
| Staging | Release-candidate product validation using approved review outputs. | Requires passing automated gates, bilingual parity, accessibility and claim checks, reproducible versioned inputs, and the responsible approval for the candidate. It is not production. |
| Production | Owner-authorized public service and approved operational jobs. | Requires every applicable release gate, including legal, source, editorial, privacy/security, and operational evidence. No release occurs merely because a staging build passes. |

Promotion order is development → data review → staging → production. A failed or incomplete gate stops promotion at its current environment; it must not be bypassed by changing a status label or substituting a fixture.

Published outputs are immutable by version: a correction or method/data update publishes a new version while retaining the prior version at its stable address. Published results are never overwritten. Environment-specific credentials and configuration stay outside the repository and are not placed in fixtures, generated pages, logs, or CI output.

## Phase 0 decision options — no provisioning authorization

**Decision status (2026-08-25):** the owner selected the public-host/AWS split below and separately authorized in-scope external mutation, purchase, contact, registration, provisioning, upload, and licence acceptance. That authorization permits execution after an exact target, cost, terms, credentials, and rollback/safety preflight; it is not evidence that any particular operation occurred. The selection is not proof that the current public Site incorporates the latest repository work. The existing immutable-archive evidence remains separate from application-environment selection and does not prove an AWS application environment.

### Selected allocation

| Scope | Selected host / region | Current evidence and boundary |
| --- | --- | --- |
| Public application host | Owner-controlled ChatGPT Site **Witness Tree**; project `appgprj_6a7bea9e59988191a9304d4c5a3f379d`; current public URL [witness-tree-canada.r7bv67rgkk.chatgpt.site](https://witness-tree-canada.r7bv67rgkk.chatgpt.site). | The current URL is publicly reachable and records the owner-selected public host. It does **not** prove the deployed source/version incorporates this repository’s latest work, nor does it admit production data or satisfy any release gate. Primary owns all Sites actions. |
| Data review, immutable raw archive, staging support, and production data services | AWS Canada (Central), `ca-central-1`. | AWS is selected for these scopes. The repository has specific evidence only for the existing immutable S3 raw archive described in [IMMUTABLE_STORAGE_PROVISIONING.md](IMMUTABLE_STORAGE_PROVISIONING.md) and [immutable-promotions.json](../data/immutable-promotions.json). AWS application, data-review, staging-support, database, secret, logging, queue, backup, and production-data resources remain unprovisioned unless separately evidenced. |
| Custom domains | Deferred until the owner obtains a domain. | No domain attachment, registration, DNS, or routing action has occurred. |

### Common non-negotiables

- Keep development fixture-only. Do not put production source bytes, personal data, or production credentials on a developer workstation or an unapproved service.
- Keep data review, staging, and production separately addressable, with separate deploy identities and release records. A staging artifact must be rebuilt or promoted from an immutable, checksum-bound release input; production must never deploy a mutable staging alias.
- Before real restricted/personal or source data enters a provider, record the exact Canadian location for every selected storage, database, backup, log, queue, analytics, support/export, build-cache, and processing-scratch component. A Canadian region name alone is not full residency evidence.
- Roll back application code by deploying the immediately preceding immutable release version; roll back a bad data/method result by publishing a superseding version and correction record, never by overwriting the published result. Retained raw archives are governed by their approved WORM retention and are not a rollback target.

### Options

| Option | Development / data review / staging / production shape | Canadian residency and archive fit | Separation and operators | Likely cost model | Rollback and approval boundary |
| --- | --- | --- | --- | --- |
| **A. Recommended: one AWS Canadian-region operating boundary** | Local fixture-only development; data review and staging in distinct AWS accounts or equivalent isolated resource boundaries in `ca-central-1`; production in a third boundary. Use the existing provider-neutral immutable-promotion contract with the approved S3 archive only after its independent source gates. | AWS lists `ca-central-1` as Canada (Central), Canada, and lists a regional S3 endpoint. S3 Object Lock in compliance mode matches the archive’s version/retention evidence model. Every non-S3 service remains a separate Canadian-residency verification item. | Owner names a product operator, data-review operator, production operator, and break-glass approver. Separate deploy identities; production cannot read developer credentials or mutable staging locations. | Variable: retained object storage and requests; review/staging/production compute hours; database/storage; logs/monitoring; egress; backup/recovery; domain and support. Estimate the selected services and Canadian region before approval, rather than using a standing price. | Decommission empty non-production resources only after preserving the release/audit record. Do not create an account, configure an AWS service, grant a role, or upload data until the owner approves provider/account boundaries, budget ceiling, retention/recovery, and operators. |
| **B. Azure Canada Central / Canada East alternative** | Same four-stage model, with distinct subscriptions/resource groups and a dedicated immutable Blob container for raw archives. | Microsoft lists Canada Central (Toronto) and Canada East (Quebec) as paired Canadian regions. Use only storage/compute/logging/backup choices whose exact locations are documented; locked immutable Blob policy is required for a raw archive. | Same named roles and distinct deploy identities. Review whether every selected managed service, backup and diagnostic destination remains in Canada before use. | Variable: storage tier/capacity, operations, retrieval, compute, database, diagnostics, egress and recovery. Obtain a current Canada-region estimate. | A locked retention policy is deliberately difficult to reverse. Approval must name the chosen redundancy/replication setting, as it changes both recovery and residency scope. |
| **C. Google Cloud Montréal or Toronto alternative** | Same four-stage model, with distinct projects and a dedicated regional raw-archive bucket. | Google lists `northamerica-northeast1` (Montréal) and `northamerica-northeast2` (Toronto). A regional bucket is required unless the owner separately approves and evidences another location; Bucket Lock is irreversible after locking. | Same named roles and distinct deploy identities. Validate the location of every selected service and export destination independently. | Variable: storage class, operations/retrieval, compute, database, logging, egress and recovery. Obtain a current regional estimate. | Bucket Lock cannot be removed or shortened. Owner approval must set the retention period, recovery strategy, and account-continuity owner before any lock. |

Option A is now the owner-selected AWS path for data review, archive, staging support, and production data services. Azure and Google Cloud remain unselected alternatives. This selection does not establish that any AWS application, identity, log, database, cache, backup, or delivery service has been provisioned or located in Canada. The ChatGPT Site is the selected public application host, not an AWS workload.

### Exact preflight before the next action

The provider/host choice and broad execution authorization are recorded. Before provisioning or configuring an AWS application/data environment, the implementation record must still resolve all of the following so that the authorized action has a bounded target, cost, and rollback path:

1. AWS account ownership, exact Canadian location for each service, named operators, and separate development/data-review/staging/production boundaries.
2. A monthly and one-time budget ceiling, including storage, compute, database, logs, egress, backups, support, and recovery; an estimate is not a purchase authorization.
3. The data classification for each environment, including whether it may contain only fixtures, admitted source bytes, public release candidates, or personal data. Personal-data services need the separately required privacy/security approval.
4. Identity/secret management, public-access stance, audit-log retention, Canadian recovery/backup choice, incident contact, and explicit prohibition or documented approval for cross-border replication, exports, analytics, and build caches.
5. The promotion evidence and rollback rehearsal: immutable release input/version, automated gates, named human approval, and proof that the immediately previous release can be restored without rewriting public data.

The next safe action is limited to creating the selected isolated non-production boundary and returning redacted configuration evidence for review. The owner's broad authorization does not permit credentials in the repository or waive source-admission, legal, privacy, retention, budget, or release gates. Each completed external action must be recorded with its exact target and result.

### Official evidence used for this decision record

- AWS: [Regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html), [S3 endpoints](https://docs.aws.amazon.com/general/latest/gr/s3.html), [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [S3 pricing](https://aws.amazon.com/s3/pricing/), and [AWS Pricing Calculator](https://docs.aws.amazon.com/pricing-calculator/latest/userguide/getting-started.html).
- Microsoft: [Azure regions](https://learn.microsoft.com/en-us/azure/reliability/regions-list), [region pairs](https://learn.microsoft.com/en-us/azure/reliability/regions-paired), [immutable Blob storage](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview), and [Blob cost model](https://learn.microsoft.com/en-us/azure/storage/blobs/blob-storage-estimate-costs).
- Google Cloud: [bucket locations](https://cloud.google.com/storage/docs/locations), [Bucket Lock](https://cloud.google.com/storage/docs/bucket-lock), and [Cloud Storage pricing](https://cloud.google.com/storage/pricing).

These sources describe provider capabilities and price categories, not a legal residency opinion or a quote. Recheck them and produce a dated regional estimate immediately before owner approval.
