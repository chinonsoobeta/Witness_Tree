# External and release gates

The implementation plan contains decisions, reviews, observed operational results, and relationships that software cannot honestly manufacture. This register tracks the plan's external and release gates. Every item below remains **not complete** unless and until the stated evidence is recorded by the accountable owner. A passing local check, fixture, policy document, public technical preview, or draft route is not substitute evidence.

The current preview uses illustrative fixtures only. No production source release, account service, live wildfire integration, reserve/treaty production page, public beta, or general launch is authorized by this register.

## Phase 0: foundations, identity, and governance

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Editorial foundations sign-off | Recorded approval of the forest definition, evidence classes, and confidence rules | Editorial foundations were approved by accountable owner Chinonso Obeta on 2026-08-21 in `data/phase1-phase3-owner-approvals-2026-08-21.json`. Legal, external-review, real-data and release gates remain open. No separate editorial board has been appointed. |
| Legal review | Written bilingual sign-off for defamation, licensing, attribution, disclaimers, terms, privacy, and account/alert controls | Complete for the recorded Phase 0 scope by accountable-owner record dated 2026-08-27 in `data/phase0-legal-signoff-owner-record-2026-08-27.json`. This is not represented as an independent counsel opinion and does not grant missing source rights, licences, external review, production operation, or release. Materially changed legal, licence, personal-data, or release scope requires a new scoped review. |
| Name clearance and registration | Broader professional trademark/confusion review; both required names/domains registered; no persistent identifier uses the product name | Bilingual product-name registration is owner-attested complete for Witness Tree and Arbre témoin in `data/phase0-owner-scope-decisions-2026-08-27.json`, and the persistent-identifier gate passes. Domain registration and broader professional trademark/confusion review remain unresolved. The repository records the attestation, not private registrar documents or payment data. |
| Mistik name request | Written response from the appropriate Cree language authority, including terms, spelling, honorarium, and withdrawal rights; outcome recorded | Not authorized. Chinonso Obeta retained Witness Tree and explicitly did not authorize Mistik; nothing ships under Mistik without the required written authority. |
| Indigenous engagement route | Named, funded engagement lead; tested contact route that answers within five business days; published engagement statement | Explicit accountable-owner-approved Phase 0 exclusion recorded on 2026-08-27 in `data/phase0-owner-scope-decisions-2026-08-27.json`. No contact route, five-business-day test, or engagement occurred, and Witness Tree will not claim that engagement occurred. This exclusion completes Phase 0 only under its recorded scope and does not close Phase 7 production gates. |

## Phases 1 to 4: sources, methods, and provincial presentation

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Source rights and attribution | Per-source licence, attribution, redistribution, version, retrieval, and retention approval before ingestion or release | Incomplete; staging and source-candidate evidence do not authorize production use |
| Immutable archive ownership | Approved Canadian-region provider, retention duration/legal-hold process, access controls, and independently accepted proof before raw-source promotion | Not complete. Promoted snapshots do exist: `data/immutable-promotions.json` records three payloads under compliance-mode Object Lock in AWS `ca-central-1`, and `data/vlce2-remote-promotion-evidence.json` records 39 more. What is missing is the approval side of this gate, not the promotion side: no accountable owner has approved the provider, retention duration, legal-hold process, or access controls, and no independent party has accepted the proof. Promotion into a locked bucket is not the same as an approved archive, and none of it authorizes production use. |
| SOPFEU reuse | Written public-reuse terms before any Québec live-fire integration | Not confirmed |
| Technical advisory review | Review of the national baseline against provincial statistics, with documented explainable differences | Not started. A national baseline now exists: the owner admitted the Version 2.1 national batch on 2026-08-26 in `data/phase2-admission-record-2026-08-26.json`, under a limited, non-release, non-production scope. No advisory review of it against provincial statistics has begun, and no explainable differences are documented. |
| Provincial data-owner review | One outside reviewer per province confirms correct presentation of provincial data | Not started; required at Phase 4 and again for release readiness |
| Editorial and technical method sign-off | Recorded decisions for definitions, new sources, methods, and published-number changes | Not started; required before published-number releases. The Phase 0 editorial foundations approval above does not cover a method or published-number change. |

## Phases 5 to 7: operational and Indigenous-geography gates

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Live wildfire operations | Authoritative endpoint configuration and rights, four-times-daily scheduler, storage/monitoring/on-call ownership, and outage/schema/stale rehearsal evidence | Not complete; routes and refresh logic are illustrative/policy-only |
| Account privacy and security | Privacy/security sign-off, selected and verified Canadian hosting, live deletion and kill-switch test by an independent person, and approved outbound sender | Not started; accounts are inactive and hosting is unselected |
| Indigenous-geography engagement | Contact register, briefing offer, and working named right-of-reply recipient for every affected nation before reserve/treaty production pages go live | Independently open. The Phase 0 Indigenous-engagement exclusion does not provide production source authority, a contact register, a briefing offer, or a named tested right-of-reply recipient. No production reserve/treaty pages are authorized. |
| Federal boundary/source review | Verified source terms, names/diacritics, and approved presentation of reserve/treaty data | Not started; no verified production boundary dataset is integrated |

## Phases 8 to 9: release, beta, and launch

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Professional bilingual review | Professional translation with subject-matter/terminology review, French usability testing, and zero critical French defects | Required before production/public-data release; the preview is explicitly unreviewed |
| Independent accessibility audit | External WCAG 2.2 AA and EN 301 549 audit across all four templates, with zero critical defects; rendered keyboard and assistive-technology testing | Required before production/public-data release; source-level checks are not an audit |
| Security review and load test | Independent security review plus a 50-times-normal-traffic CDN load test that holds | Not started; no production account/alert service or load-test evidence exists |
| Release reproducibility and validation | A published figure recomputed from an immutable raw archive and recorded method version; independent-data validation and approved release/citation record | Not started; no production release exists |
| Operations readiness | Published runbook, staffed and tested fire-season on-call rota, incident/escalation route, source-update and correction ownership | Not complete, and no production operations are active. Two parts are written: `docs/OPERATIONS_HANDBOOK.md` is the published runbook, and the bilingual correction policy carries correction ownership and service targets. The staffed and tested fire-season on-call rota is the missing part, and no amount of writing supplies it: it needs named people who have agreed to be paged. |
| Public beta and correction evidence | Invited beta participants, observed correction operation, first quarterly correction metrics, no unresolved critical correction, and quarterly reproducibility pass | Not started; no beta has occurred |
| Source-agency confirmation and launch decision | At least one source agency confirms its data presentation, followed by a recorded go/no-go and formal launch decision | Not started |

## Recording a closure

Do not change a gate to complete because a related implementation task, automated test, or draft document exists. Record the dated evidence, accountable owner, scope, and any limitations in the decision/audit record first. A gate may close only for the release surface and data scope that its evidence actually covers.
