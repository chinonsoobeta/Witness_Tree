# Observability evidence record schema

`data/observability-deployment.json` records the repository-preparation and later delivery-and-synthetic evidence for the Phase 8 `observability` gate described in section 4 of [PHASE8_IMPLEMENTATION_PLAN.md](PHASE8_IMPLEMENTATION_PLAN.md). The archive half of that gate stays in the `access-logging` control of [`data/archive-operations-readiness.json`](../data/archive-operations-readiness.json); this record does not replace it and does not flip it.

The record has two intentionally distinct states. `partial` binds the repository assets that can be built without owner credentials and states exactly what remains unobserved. It must not contain AWS deployment evidence, an operational review, or `syntheticUptime.lastRun`. `archive-and-delivery-observed` is the owner-run evidence shape and remains strict about real Canadian destinations, retention, enabled controls, a real synthetic run, and a dated review. Passing the partial check proves only that the repository boundary is honest and executable. It does not prove deployment and it does not change the Phase 8 criterion from `fail`.

`scripts/check-observability-deployment.mjs` is repository-only: it makes no AWS call, reads nothing outside this repository, and writes nothing. It parses the alarm/dashboard CloudFormation definition and checks the workflow and runner paths named by the partial record.

## Envelope

| Field | Requirement |
| --- | --- |
| `schemaVersion` | Exactly `witness-tree/observability-deployment/1`. |
| `capturedAt` | UTC instant, `YYYY-MM-DDTHH:MM:SSZ`. |
| `status` | `partial` for repository preparation, or `archive-and-delivery-observed` for actual owner-run evidence. |
| `claims.hostTierMonitored` | Must be `false`. |
| `claims.observabilityComplete` | Must be `false` while any tier is unobserved. |

## `partial` repository-preparation shape

The partial record contains `siteTier`, `repositoryAssets`, `syntheticUptime`, `ownerBoundary`, `unobserved`, and `claims`. It must omit `logDestinations`, `archive`, `delivery`, `alarms`, `dashboard`, and `operationalReviews`; those field names are reserved for observed deployment evidence. It must also omit `syntheticUptime.lastRun` until the scheduled workflow has actually run and its result has been observed.

`repositoryAssets` names two repository-relative files that must exist:

- `monitoringDefinitionsPath`, a JSON CloudFormation template. It must constrain `DeploymentRegion` to `ca-central-1` and `ca-west-1`, define CloudWatch alarms for 5xx rate and origin error rate with numeric thresholds, evaluation periods, recipient actions, and `TreatMissingData: "missing"`, and define one dashboard covering `request-rate`, `cache-hit-ratio`, and `error-rate`.
- `syntheticRunnerPath`, the runner invoked by the workflow.

`syntheticUptime` carries the workflow path, cron schedule, read-only and non-substitution claims, and configured routes. The partial shape requires `/en`, `/fr`, `/en/explore`, `/fr/explorer`, `/en/compare`, and `/fr/comparer`, each with its real `200` status and a content marker. `/fr/compare` is rejected because it is not the French comparison route.

`ownerBoundary` must say `ownerRunRequired: true`, `awsMutationPerformed: false`, and `syntheticRunPerformed: false`. Its `pendingEvidence` list must separately name the `ca-central-1` and `ca-west-1` log destinations and retention, S3 server access logging, CloudTrail data events, delivery standard logging, delivery metric publication, alarm/dashboard deployment, synthetic last run, and operational review. Every partial completion claim remains `false`, including `phase8CriterionPass`.

## `archive-and-delivery-observed` shape

The remaining sections specify the complete observed shape. Values in this shape come from actual owner-run read-backs, not proposed form inputs or repository definitions.

## `siteTier`

`host`, `externallyHosted: true`, `hostSideMonitoringAvailable: false`, `monitored: false`. While the site tier is externally hosted, recording either boolean as `true` is rejected. Recent production Worker logs can be queried through the management connector, but no project-visible retained request count, error rate, alerting hook, or dashboard is recorded. Those logs do not establish an operated monitoring tier.

## `logDestinations`

In the observed shape, this is a non-empty array of uniquely identified destinations. Each entry needs:

- `id`, and `kind` from `s3-server-access-log`, `cloudtrail-data-events`, `cloudfront-standard-logs`, `cloudwatch-logs`;
- `tier` from `archive`, `delivery`, `synthetic`. `site` is rejected, because a site-tier log destination would be a monitoring claim about a tier that has none;
- `region`, which must be `ca-central-1` or `ca-west-1`. Any other region is rejected outright;
- `retentionDays`, a positive integer, plus `retentionSource` naming how retention is enforced. `0`, `null`, and strings such as `"Unknown"` are all rejected: an unstated retention must not arrive as a clean zero;
- `reference` and `reviewerRole`. References must be non-secret. Account IDs, ARNs, access key IDs, and signed URLs are refused by pattern.

## `archive`, `delivery`

`archive.bucket`, plus `archive.serverAccessLogging` and `archive.cloudTrailDataEvents`, each with `enabled: true`, a `destinationId` that resolves to a destination of the matching kind, and a non-secret `reference`. `cloudTrailDataEvents` also needs `eventSelectorScope`, saying what the data-event selector actually covers. `delivery` needs a non-secret `distributionReference` and a `standardLogging` block bound the same way to a `cloudfront-standard-logs` destination.

## `alarms`

A non-empty array. Each alarm needs `id`, `tier` (not `site`), `metric`, `comparison` from `greater-than`, `greater-than-or-equal`, `less-than`, `less-than-or-equal`, a finite numeric `threshold` with a `thresholdUnit`, a positive integer `evaluationPeriods`, a `recipientRole`, `enabled: true`, and a non-secret `reference`. The set must include at least one alarm whose metric names a 5xx rate and one whose metric names an origin error rate.

## `dashboard`

A non-secret `reference`, a Canadian `region`, and `panels` covering at least `request-rate`, `cache-hit-ratio`, and `error-rate`.

## `syntheticUptime`

The observed shape repeats the checked workflow configuration and adds the run evidence:

- `workflowPath`, repository-relative, and the file must exist in this repository;
- `schedule`, the cron expression the workflow runs on;
- `writePermissions: false`. The check reads public routes and must hold no write permission;
- `substituteForHostSideMonitoring: false`. A synthetic probe from outside is a genuine availability signal and is not host-side monitoring. The record has to say both things;
- `routes`, each with `path`, `expectedStatus`, and a `contentMarker`;
- `lastRun` with a UTC `startedAt`, a `result` of `pass` or `fail`, and `observedRoutes` covering every configured route with an observed `status` and `contentMarkerFound`. A run recorded as `pass` while any route missed its expected status or marker is rejected.

## `operationalReviews`

The observed shape requires at least one dated record, each with a UTC `reviewedAt`, `reviewerRole`, `scope`, `findings`, and a non-secret `reference`. The partial shape omits this field rather than inventing a review.

## `unobserved`

Required and non-empty while the site tier is externally hosted, and at least one entry must carry `tier: "site"`. Each entry needs `component`, `monitored: false`, and a `reason` saying why no signal is available. Optional `metrics` entries carry a `name` and a `value` that is `null` or `"unknown"`; a number, and above all `0`, is rejected, because an absent measurement is not a clean reading.

## What this record does not do

Passing this check confirms that the record is internally consistent for its stated status and does not overstate itself. A partial pass confirms only repository preparation and the explicit owner boundary. An observed pass confirms that the recorded deployment evidence is structurally complete. Neither status flips the `observability` exit criterion: the archive half lives in `data/archive-operations-readiness.json`, whose `access-logging` control has its own evidence requirements, and the site tier stays unobserved under external hosting. Any later flip of the gate has to write the site-tier gap into its own `reason` text.
