# Observability: current state and owner decisions

Status: **draft, 2026-09-29.** Nothing here was deployed. No AWS resource was
created or changed while writing it. Phase 8 `observability` stays `fail`
until the owner fills in the decisions below, runs the deployment, and
records the evidence in
[`data/observability-deployment.json`](../data/observability-deployment.json)
using the complete shape in
[OBSERVABILITY_EVIDENCE_SCHEMA.md](OBSERVABILITY_EVIDENCE_SCHEMA.md).

The gate in [EXTERNAL_GATES.md](EXTERNAL_GATES.md) requires current service
and delivery monitoring, alerting, retained logs, a dashboard, and a completed
operational review.

## 1. What exists and has been observed

| Signal | Evidence | Limit |
| --- | --- | --- |
| Synthetic probe of six bilingual routes | 178 scheduled runs from 2026-09-01 to 2026-09-29. Last run 2026-09-29T16:29:16Z passed on all six routes (GitHub Actions run 36598052928) | GitHub runs the 15-minute cron about every 3.75 hours (median); the longest gap was 7.9 hours |
| Two-failure issue alert, and close on recovery | 163 successful handler runs since 2026-09-05 | Has never fired: no probe has failed since it was added. A person only sees it if they watch the repository's issues |
| Daily live map render check | Scheduled at 14:23 UTC; fails the run when the map does not draw | Opens no issue; someone has to look at the run list |
| Probe receipts | Workflow artifacts, kept 90 days | These are GitHub artifacts, not a log store this project controls |

## 2. What is missing, and what it would take

1. **Probe cadence.** With two consecutive failures needed and gaps of up to
   7.9 hours, an outage can go unreported for up to about 16 hours. GitHub
   documents that scheduled workflows may be delayed or dropped under load.
   Changing the cron cannot fix this.
2. **Delivery alarms read metrics that nothing publishes.**
   `infra/phase8-observability.json` alarms on `Delivery5xxRate` and
   `DeliveryOriginErrorRate` in a custom namespace, and no publisher for those
   metrics exists in this repository. CloudFront publishes its own metrics
   (`5xxErrorRate`, `TotalErrorRate`, `Requests`) only in `us-east-1`. A
   CloudWatch alarm has to be in the same region as its metric. So the
   options are:
   - (a) alarm on CloudFront's own metrics in `us-east-1`, with the dashboard
     staying in a Canadian region and reading them through a cross-region
     widget; or
   - (b) build and run a publisher that copies them into `ca-central-1`.
   Option (a) adds no code, but it puts two alarm definitions outside Canada.
   That is a residency judgement for the owner (decision O4).
3. **No deployed alarm, dashboard, or log destination.** The template and the
   evidence schema are ready. The deployment needs the owner's AWS session.
4. **The site tier cannot be observed from here.** ChatGPT Sites exposes no
   project-visible request count, error rate, alert hook, or log retention.
   The record has to keep this tier in `unobserved`, and the checker rejects
   any claim that it is monitored. The owner's review has to accept that
   limit in writing.
5. **No operational review.**

## 3. Recommended path

Run one **CloudWatch Synthetics canary in `ca-central-1`**. It would probe the
same six routes and content markers as `scripts/run-synthetic-uptime.mjs`
every 15 minutes, alarm on `SuccessPercent`, and appear on the dashboard.
Scheduled canaries run on time, so this replaces the GitHub cadence problem
with an alarm that fires within about 30 minutes. It also keeps the probe in
the existing Canadian AWS account and adds no outside service. Keep the
GitHub probe as a free second signal.

Costs at on-demand prices for `ca-central-1`, from the AWS price list
published 2026-09-28 (USD):

| Item | Unit price | Monthly |
| --- | --- | --- |
| Canary every 15 minutes (2,880 runs) | $0.0014 per run | about $4.03 (every 5 minutes: about $12.10) |
| Alarms (canary plus 2 delivery alarms) | $0.10 per alarm | $0.30 |
| Dashboard | not in the price list; AWS has a free dashboard allowance | confirm in the console |
| Canary artifacts and logs | $0.033 per GB-month (logs), S3 for artifacts | cents at this volume |
| S3 server access logs for the raw archive | storage only | cents |
| CloudTrail data events on the raw archive | $0.000001 per event | cents at the current write rate |

Expected total: about **$5 a month**, plus the Lambda run time the canary
uses and any dashboard fee. Confirm the figures in the AWS console before approving.

## 4. Decisions for the owner

Leave a line blank until it is decided. Do not fill a line in for someone
else.

| ID | Decision | Owner answer |
| --- | --- | --- |
| O1 | Probe: approve the Synthetics canary (section 3), keep only the GitHub probe and accept a detection delay of up to about 16 hours, or something else | |
| O2 | Who receives alarms: the SNS topic subscriber, by role. Record the role here and keep contact details out of Git | |
| O3 | Log destination bucket and region for S3 server access logs and CloudTrail data events on `witness-tree-raw-archive-ca-central-1` | |
| O4 | Delivery alarms: CloudFront's own metrics with alarms in `us-east-1` (2a), a publisher into `ca-central-1` (2b), or no delivery alarms | |
| O5 | CloudFront standard logging for the delivery distribution: on or off, and its destination | |
| O6 | **Log retention**, in days, for each destination above, and for canary artifacts | |
| O7 | **Operational review**: who reviews, how often, and the date of the first review. The review reads the dashboard, the alarm history, the probe receipts, and this record | |

## 5. After the decisions

1. The owner deploys `infra/phase8-observability.json`, amended for O1 and
   O4, in the chosen Canadian region, and enables O3 and O5 logging.
2. Record the observed destinations, retention, alarms, dashboard, the
   canary's last run, and the first review in
   `data/observability-deployment.json` with status
   `archive-and-delivery-observed`. Then run
   `node scripts/check-observability-deployment.mjs`.
3. Rebind the Phase 8 `observability` criterion to that record. Change it to
   `pass` only when the checker passes on observed evidence.
