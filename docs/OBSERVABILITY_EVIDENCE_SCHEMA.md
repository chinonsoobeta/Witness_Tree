# Observability evidence record schema

`data/observability-deployment.json` is the delivery-and-synthetic half of the Phase 8 `observability` gate described in section 4 of [PHASE8_IMPLEMENTATION_PLAN.md](PHASE8_IMPLEMENTATION_PLAN.md). The archive half of that gate stays in the `access-logging` control of [`data/archive-operations-readiness.json`](../data/archive-operations-readiness.json); this record does not replace it and does not flip it.

**The record does not exist yet, and nothing in this repository fabricates it.** It is written only from an actual AWS run by the archive and delivery owner, from observed console read-backs rather than form inputs. `npm run check:observability-deployment` fails closed while the file is absent, and the failure names the file and this document. Everything below is the shape the checker requires, not a description of anything that has been deployed.

`scripts/check-observability-deployment.mjs` is repository-only: it makes no AWS call, reads nothing outside this repository, and writes nothing. The same field list appears as a block comment at the top of that file.

## Envelope

| Field | Requirement |
| --- | --- |
| `schemaVersion` | Exactly `witness-tree/observability-deployment/1`. |
| `capturedAt` | UTC instant, `YYYY-MM-DDTHH:MM:SSZ`. |
| `status` | `partial` or `archive-and-delivery-observed`. |
| `claims.hostTierMonitored` | Must be `false`. |
| `claims.observabilityComplete` | Must be `false` while any tier is unobserved. |

## `siteTier`

`host`, `externallyHosted: true`, `hostSideMonitoringAvailable: false`, `monitored: false`. While the site tier is externally hosted, recording either boolean as `true` is rejected: no host-side logs, error rate, request count, or alerting hook is known to be available, and probe question 5 in the plan exists because the repository cannot answer it.

## `logDestinations`

A non-empty array of uniquely identified destinations. Each entry needs:

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

- `workflowPath`, repository-relative, and the file must exist in this repository;
- `schedule`, the cron expression the workflow runs on;
- `writePermissions: false`. The check reads public routes and must hold no write permission;
- `substituteForHostSideMonitoring: false`. A synthetic probe from outside is a genuine availability signal and is not host-side monitoring. The record has to say both things;
- `routes`, each with `path`, `expectedStatus`, and a `contentMarker`;
- `lastRun` with a UTC `startedAt`, a `result` of `pass` or `fail`, and `observedRoutes` covering every configured route with an observed `status` and `contentMarkerFound`. A run recorded as `pass` while any route missed its expected status or marker is rejected.

## `operationalReviews`

At least one dated record, each with a UTC `reviewedAt`, `reviewerRole`, `scope`, `findings`, and a non-secret `reference`.

## `unobserved`

Required and non-empty while the site tier is externally hosted, and at least one entry must carry `tier: "site"`. Each entry needs `component`, `monitored: false`, and a `reason` saying why no signal is available. Optional `metrics` entries carry a `name` and a `value` that is `null` or `"unknown"`; a number, and above all `0`, is rejected, because an absent measurement is not a clean reading.

## What this record does not do

Passing this check confirms that a recorded observability deployment is structurally complete and does not overstate itself. It does not flip the `observability` exit criterion, and it cannot: the archive half lives in `data/archive-operations-readiness.json`, whose `access-logging` control has its own evidence requirements, and the site tier stays unobserved under external hosting. Any flip of the gate has to write the site-tier gap into its own `reason` text.
