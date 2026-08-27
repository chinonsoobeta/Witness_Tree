# Phase 6 accounts, saved areas, and alerts exit status

The checksum-verified record at [`data/phase6-account-alert-exit-status.json`](../data/phase6-account-alert-exit-status.json) reports the five literal Phase 6 exit criteria. Its **4/5 (80%)** figure is an unweighted local implementation result, not a production-readiness claim or an authorization to activate accounts or send alerts.

Four criteria pass: the managed Canadian database isolation drill, deterministic 30-day deletion policy, evidence-carrying bilingual alert payload construction, and correction-recipient selection. The remaining criterion is deliberately not softened: no outbound sender/queue plus independent timed rehearsal proves the five-minute kill switch.

`lib/accounts/activation-gate.ts` therefore defaults closed. It requires explicit evidence for Canadian residency, direct RLS isolation, geometry encryption/no-log verification, consent/deletion/retention, verified sender and one-click unsubscribe, rate/queue controls, a kill-switch rehearsal, reviewed bilingual templates, privacy/security/legal review, and an incident owner/runbook before any future account mutation or delivery boundary may activate.

No real personal data is held, no emails are sent, and no production account service is claimed. The remaining Phase 6 checkpoint is an independent live test of deletion and the kill switch together with privacy, security, and legal sign-off.
