# Phase 3 external-checkpoint handoff

This package prepares execution; it records no participant, human-review, field-performance, or outside-audit result. The machine gate must continue to print `pending-real-evidence` until the required people perform the work and provide reviewable evidence. A protocol, empty template, automated browser result, or owner approval is not a completed checkpoint.

The English and French scripts are parity-complete working drafts, not professionally reviewed translations. The accountable study owner must confirm the exact session wording before recruitment; this package makes no linguistic-review claim.

Canonical files:

- [`data/phase3-external-checkpoint-protocol.json`](../data/phase3-external-checkpoint-protocol.json) fixes scope, bilingual tasks, eligibility, privacy and pass arithmetic.
- [`data/phase3-external-checkpoint-evidence.json`](../data/phase3-external-checkpoint-evidence.json) is the empty, fail-closed evidence envelope.
- [`scripts/check-phase3-external-checkpoints.mjs`](../scripts/check-phase3-external-checkpoints.mjs) rejects missing scope, inferred consent, PII fields, self-generated completion and threshold drift.

Run `npm run check:phase3-external-checkpoints` after any change. Do not change `status` to `complete` by hand to make the gate pass.

## Owner inputs required before recruitment or telemetry

The accountable owner must supply, rather than the build team infer:

1. Release/build identifier and production-like origin to test.
2. Named study owner.
3. Approved retention period in days.
4. Approved bilingual consent-form version.
5. Recruitment approval reference and privacy-review reference.
6. Field-performance sampling decision and exact reference.
7. Exact UTC measurement-window start and end, minimum eligible aggregate samples per locale, HTTPS origin, provider name, immutable configuration reference and privacy-review reference.

Keep every corresponding field `null` until that decision exists. Do not recruit or contact anyone from this package.

## Moderated non-GIS usability checkpoint

Recruit two separate panels: exactly 10 eligible English participants and exactly 10 eligible French participants. A participant must complete at least four of the five tasks unassisted, each in strictly less than 180 seconds. A language passes only when at least 8 of its 10 participants pass. One language cannot compensate for the other.

Eligibility and exclusions are bilingual and exact in the protocol. Ask only the six yes/no attestations. Do not record why someone is ineligible. Disability and assistive-technology use are never exclusions.

### Consent script

English:

> You are invited to test an illustrative, nonproduction forest-information interface. Participation is voluntary. You may skip a task or stop at any time. We record only a random participant code, your assigned language, six eligibility confirmations, task start/end times and outcomes, and coded usability issues. We do not record your name, contact details, IP address, exact age, demographics, audio, video, screen or identifying quotes. The approved retention period is **[REQUIRED — OWNER-PROVIDED DAYS]**. Do you explicitly consent to participate under consent form **[REQUIRED — APPROVED VERSION]**?

French:

> Nous vous invitons à tester une interface illustrative et non destinée à la production sur l’information forestière. La participation est volontaire. Vous pouvez sauter une tâche ou arrêter en tout temps. Nous consignons uniquement un code aléatoire, la langue attribuée, six confirmations d’admissibilité, les heures de début et de fin des tâches, les résultats et des problèmes codés. Nous ne consignons ni votre nom, ni vos coordonnées, ni votre adresse IP, ni votre âge exact, ni des données démographiques, ni l’audio, ni la vidéo, ni l’écran, ni des citations permettant de vous identifier. La période de conservation approuvée est de **[REQUIS — NOMBRE DE JOURS FOURNI PAR LA PERSONNE RESPONSABLE]**. Consentez-vous explicitement à participer selon le formulaire **[REQUIS — VERSION APPROUVÉE]**?

If the answer is not an explicit yes, stop. A moderator must create the consent receipt reference and timestamp before the session. The build team and validator cannot infer them.

### Participant evidence fields

For each eligible session, record only:

- a random 16-character lowercase hexadecimal participant ID that encodes nothing;
- a separate opaque panel ID for each language;
- the six explicit eligibility booleans;
- consent status, receipt reference, protocol version and timestamp;
- session and all five task timestamps;
- `completedUnassisted` and `assistanceProvided` for each task;
- a human moderator attestation reference.

Do not record names, email, phone, address, IP address, age, date of birth, recruitment source, raw media, demographics, or identifying quotations. Candidate exclusions are aggregate counts by language only.

## Manual accessibility evidence

Use a human tester and record environment, start/end timestamps, issue IDs and an attestation reference.

- Keyboard: location, place, Explore and bilingual-parity templates in English and French. Verify keyboard-only completion, visible focus, DOM order, no trap and no blocked task.
- Screen reader: place and location in both languages. The environment is structured, not free text, and requires nonblank `assistiveTechnology`, `assistiveTechnologyVersion`, `browser`, `browserVersion`, `operatingSystem` and `operatingSystemVersion`; placeholders such as “test”, “unknown” or “generic” fail. Verify headings, landmarks, link/control names, event order, figures, Unknown reasons, provenance and table alternatives.
- Forced colours/CVD: all four templates, both languages, in forced-colours, grayscale, protanopia, deuteranopia and tritanopia modes. A person must inspect content, focus, links, evidence shapes, confidence bars, Unknown treatment, charts and legends. Automated emulation does not fill this evidence.

## Field performance

Collect only aggregate place-page LCP by locale. The result is eligible only when p75 is strictly below 2,000 ms for both English and French, each locale meets the owner-approved sample minimum, and every row exactly repeats the approved UTC window, HTTPS origin, provider, configuration reference, sampling-decision reference and privacy-review reference. Strip query strings and retain no IP, user ID, precise location, full URL or raw event. Until the owner and privacy reviewer approve every one of those inputs, do not enable collection.

## Outside accessibility review

Engage a reviewer and organisation outside the build team. Their signed report must cover WCAG 2.2 AA and EN 301 549 across location, place, Explore and bilingual-parity templates in English and French. Record independence/conflict attestation, report reference, every scope result and issues. Completion requires zero unresolved critical defects.

## Issue severity

- `critical`: blocks a core task, removes essential meaning, exposes a serious safety/privacy issue, or prevents required conformance with no workable path.
- `high`: major barrier affecting a required flow, with only a difficult workaround.
- `medium`: material friction or ambiguity that does not block the flow.
- `low`: minor defect with limited task impact.

Use opaque issue IDs and coded, de-identified observations. Do not fabricate an issue-free result: an empty issue list is valid only when a real reviewer attests that none were observed.

## Safe execution order

1. Owner supplies the seven required inputs and approves recruitment/retention/privacy boundaries.
2. External moderator runs the separate English and French panels.
3. Human accessibility testers complete keyboard, screen-reader and forced-colours/CVD matrices.
4. Privacy-approved aggregate field measurement runs for the approved window.
5. Outside assessor completes and signs the WCAG/EN 301 549 report.
6. Enter de-identified evidence, recompute the usability summary, run the gate, and resolve any critical issue.
7. Only then may the owner consider changing the envelope to `complete`; passing this gate still does not authorize deployment or production data.
