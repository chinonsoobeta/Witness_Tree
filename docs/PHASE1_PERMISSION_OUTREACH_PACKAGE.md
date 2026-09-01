# Phase 1 permission and export outreach package

Status: **seven initial owner-reviewed messages sent; eight substantive replies recorded through 2026-08-21; blockers remain.** Mailbox evidence through 2026-08-21 records only bounded send/reply facts and omits message IDs, thread IDs, bodies, personal contact fields, attachments, and mailbox links. The FOM-only form was submitted and its view-only-use clarification received an owner-authorized reply; neither supplies permission or authorized access. A later owner-submitted FOI response on 2026-08-27 supplied catalogue links. A read-only profile on 2026-09-01 verified complete, count-reconciled public WFS extracts during a stable read window, but not a direct package or coherent one-timestamp extract. It is recorded separately below and does not establish archive evidence or production eligibility. A send, form submission, reply, routing instruction, or follow-up does not authorize acquisition, archival, transformation, ingestion, release, source-ledger admission, or production use.

One earlier request to FAIB is tracked only to prevent a duplicate message. The package records **seven verified initial sends**, which cover the other 12 canonical access-blocked rows, plus that earlier request. The historical audit records eight substantive replies touching eight unique blocked rows; no reply in that audit provides an artifact, checksum, permission, authorized access, or production evidence. The exact machine-readable mapping and current FOM-only form outcome are in [`data/phase1-permission-outreach-package.json`](../data/phase1-permission-outreach-package.json), [`data/phase1-outreach-reply-audit.json`](../data/phase1-outreach-reply-audit.json), and [`data/phase1-bc-copyright-permission-form-package.json`](../data/phase1-bc-copyright-permission-form-package.json). The later BC FOI catalogue response is in [`data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json`](../data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json) and is checked by `npm run check:bc-forest-tenure-foi-catalogue-response`.

## Reply audit through 2026-08-21

The eight substantive replies include the BEC custom-download route and the FOM view-only-use clarification. Permission and authorized access remain pending:

| Route | Rows | Current evidence | Still blocked by |
| --- | --- | --- | --- |
| BC Forest Tenures Branch | `bc-fta-cutblocks`, `bc-harvesting-authorities` | The request was directed to the Province's FOI records route under FIPPA. | No coherent export, edition, checksum, reuse authorization or lifecycle decision as of the 2026-08-21 audit cutoff. |
| Ontario FRI team | `on-fri`, `on-fri-term-2` | The team pointed to Ontario GeoHub and said T2 directions will be uploaded when available for public use. | No stable T2 package, exact-package rights confirmation, checksum or archive evidence. |
| BC Data Maps | BEC component of `bc-old-growth-bec` | The team directed clients to its service portal. A later reply identified the indirect BCGW Custom Download route and its order/eligibility requirements; no order or portal submission was recorded. | No complete BEC snapshot, transaction semantics, checksum or edition; email/Terms acceptance/order submission and eligible account requirements remain unresolved. |
| BC Intellectual Property Program | VRI, FOM and TAP components of `bc-old-growth-bec` | The program described its permission form, exact catalogue-name/URL requirement, intended-use details, custodian review, possible licensing vehicle and fee. A 2026-08-20 follow-up confirmed that one form may cover all three datasets. | No form submission, custodian decision, licence, artifact, fee decision or TAP implementation layer. |
| BC FAIB | `bc-consolidated-cutblocks` | FAIB asked for proposed derived, aggregate, map-tile and public outputs; a follow-up supplied those details. | No authorization, attribution wording, review decision or new artifact; no raw download occurred. |

The CIRNAC thread and two FAIB acknowledgements are acknowledgement-only. No substantive reply was found for SOPFEU, ISC, or the reserve/treaty rows beyond the CIRNAC automatic reply. The two partial rows remain owner-review drafts and have no external reply. The FOM-only form and clarification reply are recorded; no permission, authorized access, terms acceptance, order, attachment download, or score evidence resulted. VRI and TAP remain unsubmitted.

## Supplemental FOI catalogue response on 2026-08-27

The owner-submitted FOI request `FOR-2026-056834` received a response pointing to the official BC Data Catalogue records for the two requested views and asking whether the links satisfy the request and whether the request may be withdrawn by 2026-09-01. The catalogue readback found the expected OGL-BC labels and only an indirect Custom Download route, WMS, and KML resources. A read-only 2026-09-01 WFS profile reconciled 222,618 cutblocks and 71,876 harvesting authorities against unchanged before-and-after service counts and distinct `OBJECTID` values, with zero duplicates and zero missing records. DescribeFeatureType matched the catalogue schema exactly for both views, and the pages covered all 23 reported administrative districts.

The 31 pages carried 31 distinct response timestamps spanning 2026-09-01T15:04:49.139Z through 2026-09-01T15:10:41.229Z. This verifies a stable read window, not a one-timestamp snapshot. The indirect Custom Download resource still has no direct package URL. On 2026-09-01, per the owner's own report and not a mailbox readback, the owner sent a reply confirming successful retrieval of both complete provincial layers, treating the timestamp limitation as feedback and expressly not as a continued request, and asking to withdraw FOR-2026-056834. The ministry has not acknowledged or confirmed the withdrawal, so closure remains unverified. The response, profile and non-sensitive sent-reply facts are preserved in [`data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json`](../data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json); the text as sent is retained in [`docs/DRAFT_BC_FTEN_FOI_REPLY_FOR-2026-056834.md`](DRAFT_BC_FTEN_FOI_REPLY_FOR-2026-056834.md). Both BC rows remain access-blocked with zero raw-evidence credit and no production eligibility. This supplemental response does not rewrite the historical reply audit above.

## BC Copyright Permission Request — owner package, not submitted

The public [Copyright Permission Request form](https://forms.gov.bc.ca/copyright-permission-request/) was inspected read-only. Its visible required inputs include first and last name, organization, mailing address, email confirmation, phone, prior-permission status, source-material type, source details, intended-use category, and a detailed intended-use narrative. Website requests require a source URL and number-of-copies value; the page also warns that most requests are subject to a processing fee. No control was focused or populated.

The exact three catalogue names and URLs, source-specific purposes, transformations, free-public-access and voluntary-donation boundary, raw Access Only non-redistribution rule, Canadian controlled-archive request, attribution, limitations, correction/right-of-reply request, and all owner-only field decisions are mapped in [`data/phase1-bc-copyright-permission-form-package.json`](../data/phase1-bc-copyright-permission-form-package.json). The package deliberately leaves identity, address, email and phone values blank. It also leaves the form's singular Source URL and website copy-count decisions for the owner to confirm before any submission. One form may cover all three datasets, but that procedural statement is not permission, a licence, a fee agreement, or an artifact acquisition.

## 1. BC Forest Tenures Branch — FTA cutblocks and harvesting authorities

**To:** ForestTenuresBranch@gov.bc.ca<br>
**From:** Chinonso Obeta <chinonso8@gmail.com><br>
**Subject:** Request for coherent BCGW exports — FTA cutblocks and harvesting authorities

Hello Forest Tenures Branch,

I am requesting reproducible BCGW Custom Download exports for both Forest Tenure Cutblock Polygons (FTA 4.0) and Forest Tenure Harvesting Authority Polygons. The public services are mutable and non-transaction-safe, so a page-by-page retrieval would not be a coherent source release.

For each export, please provide or confirm the stable file or snapshot, publisher edition or as-of timestamp, full feature count, CRS, schema, format, checksum, required OGL-BC attribution, and refresh/correction contact. Please confirm whether the supplied artifact may be retained as a checksum-verified raw copy in immutable Canadian object storage, transformed for internal analysis, and used in derived/public map and aggregate outputs. We will not redistribute raw data or infer completed harvest from authority status. Please also identify the appropriate response or right-of-reply route for source and use concerns.

Regards,

Chinonso Obeta<br>
Witness Tree<br>
chinonso8@gmail.com

**Can unblock:** `bc-fta-cutblocks`, `bc-harvesting-authorities`. The latter still requires a separate lifecycle-semantics review.

## 2. Ontario MNRF — Term 2 FRI package and rights

**To:** info.mnrfscience@ontario.ca<br>
**From:** Chinonso Obeta <chinonso8@gmail.com><br>
**Subject:** Request for reproducible Forest Resource Inventory Term 2 package and reuse confirmation

Hello,

Witness Tree is seeking the appropriate, reproducible access route for Forest Resource Inventory Term 2 (2018–2028). The catalogue currently exposes only web explorers, which we will not treat as a released package.

Please identify available FMU package options and, for any package you authorize us to request, provide the stable artifact, edition/as-of date, FMU coverage list, CRS, schema, feature count, checksum, update status, required attribution, and the licence governing that exact package. Please confirm whether we may retain the approved raw artifact in immutable Canadian object storage, transform it for internal analysis, and publish only source-derived/aggregate public results under stated conditions. Please provide the proper refresh, correction, and response/right-of-reply contact. We will not acquire a web explorer or mix editions.

Thank you,

Chinonso Obeta<br>
Witness Tree<br>
chinonso8@gmail.com

---

Bonjour,

Witness Tree cherche la voie d’accès appropriée et reproductible à l’Inventaire des ressources forestières, période 2 (2018–2028). Le catalogue ne fournit actuellement que des explorateurs Web; nous ne les traiterons pas comme un jeu de données publié.

Veuillez indiquer les options de jeux de données par unité de gestion forestière et, pour tout jeu que vous autorisez, fournir l’artefact stable, l’édition ou la date de référence, la couverture, le SCR, le schéma, le nombre d’entités, la somme de contrôle, l’état des mises à jour, l’attribution et la licence applicables. Veuillez aussi confirmer les conditions de conservation d’une copie brute dans une archive immuable canadienne, de transformation interne et de publication de résultats dérivés ou agrégés, ainsi que le contact de mise à jour, de correction et de droit de réponse.

**Can unblock:** `on-fri`, `on-fri-term-2`.

## 3. BC Data Maps — BEC v13.1 coherent snapshot

**To:** datamaps@gov.bc.ca<br>
**From:** Chinonso Obeta <chinonso8@gmail.com><br>
**Subject:** Request for complete immutable BEC Map v13.1 export or snapshot semantics

Hello,

Could you provide a complete, coherent BEC Map v13.1 vector export, or document a transaction-consistent snapshot method for the service? The observed one-request response contains 10,000 of 17,870 published features and the WFS declares non-transaction-safe paging.

For the authoritative release, please provide the stable artifact or snapshot method, edition/effective date, feature count, CRS, schema, checksum, OGL-BC attribution, refresh/correction contact, and response/right-of-reply route. Please confirm the conditions for retaining a checksum-verified raw copy in immutable Canadian object storage, internal transformation, and derived/public outputs. This request concerns BEC ecosystem context only; it does not request or imply a substitute for old-growth-deferral geometry.

Regards,

Chinonso Obeta<br>
Witness Tree<br>
chinonso8@gmail.com

**Can unblock:** the BEC snapshot component of `bc-old-growth-bec`.

### Official custom-download route audit

The BEC Map catalogue record identifies version 13.1 (released 2026-07-08), the `WHSE_FOREST_VEGETATION.BEC_BIOGEOCLIMATIC_POLY` resource in EPSG:3005, SDO_GEOMETRY, and OGL-BC. The resource has **indirect access** and no direct file URL. The publisher's distribution workflow requires coordinate system, extent/AOI, clipping, format, included layers, a notification email, a Terms and Conditions acceptance, and order submission/confirmation. The linked BCGW access policy limits warehouse applicants to a Province employee, contractor, agent, or representative and adds account-use, retention, non-distribution, and security restrictions. No order, terms acceptance, payment, or download was performed. The prepared owner action is recorded in [`data/phase1-bec-custom-download-route-audit.json`](../data/phase1-bec-custom-download-route-audit.json); the row remains access-blocked with no raw-credit or immutable-proof change.

## 4. BC Intellectual Property Program — Access Only forest layers

**To:** QPIPPCopyright@gov.bc.ca<br>
**From:** Chinonso Obeta <chinonso8@gmail.com><br>
**Subject:** Permission and authoritative-export request — VRI 2025, FOM Cutblocks, and TAP deferral layer

Hello,

Witness Tree requests written guidance and, where available, permission for these Access Only BC catalogue sources: VRI – 2025 Forest Vegetation Composite Polygons; Forest Operations Map (FOM) – Cutblocks; and the Old Growth TAP Priority Deferral Areas – Current View. We will not use their public services as permission to reproduce or redistribute them.

For each source, please identify the authoritative stable export or snapshot, edition/effective date, full feature count, CRS, schema, checksum, applicable licence and attribution. For VRI, the advertised FGDB URL currently fails; please provide a functioning complete 2025 export and refresh cadence. For TAP, please identify the authoritative implemented-deferral layer if the current view is not it. Please state whether we may keep a checksum-verified raw copy only in immutable Canadian object storage, transform it internally, and publish derived/public outputs; state any limits, required attribution, refresh/correction contact, and response/right-of-reply route. We will not redistribute raw data and will preserve each source’s documented purpose limitations.

Regards,

Chinonso Obeta<br>
Witness Tree<br>
chinonso8@gmail.com

**Can unblock:** `bc-vri`, `bc-forest-operations-map`, and the TAP/implemented-deferral component of `bc-old-growth-bec`.

## 5. SOPFEU — official wildfire data

**To:** courrier@sopfeu.qc.ca<br>
**From:** Chinonso Obeta <chinonso8@gmail.com><br>
**Subject:** Demande d’autorisation — données officielles sur les feux de forêt / Permission request — official wildfire data

Bonjour,

Witness Tree demande si la SOPFEU peut autoriser l’accès à un jeu de données officiel sur les feux actuels ou historiques. Nous n’utiliserons pas le site public comme une licence de reproduction, de distribution ou de modification.

Veuillez préciser tout artefact stable ou instantané officiel, l’identifiant de version, la couverture, la cadence, le format, la somme de contrôle, les limites de requêtes, la licence, l’attribution et le contact de correction/actualisation. Veuillez aussi confirmer par écrit si une copie brute vérifiée peut être conservée dans une archive immuable canadienne, si les données peuvent être transformées en interne et si des résultats dérivés ou publics peuvent être publiés. Veuillez indiquer la voie de réponse appropriée et les restrictions ou avis requis.

Merci,

Chinonso Obeta<br>
Witness Tree<br>
chinonso8@gmail.com

---

Hello,

Witness Tree requests written authorization, if available, to access an official current and/or historical wildfire dataset. We will not treat the public website as a licence to reproduce, distribute, or modify its contents.

Please identify any stable official artifact or snapshot, version identifier, coverage, cadence, format, checksum, rate limits, licence, attribution, and correction/refresh contact. Please confirm whether a verified raw copy may be retained in immutable Canadian object storage, whether internal transformation is allowed, and whether derived or public results may be published. Please identify the appropriate response/right-of-reply route and any required restrictions or disclaimers.

**Can unblock:** `sopfeu`.

## 6. Indigenous Services Canada — reserve-boundary authority and engagement

**To:** communicationspublications@sac-isc.gc.ca<br>
**From:** Chinonso Obeta <chinonso8@gmail.com><br>
**Subject:** Request for authoritative reserve-boundary release, reuse terms, and appropriate engagement route / Demande de jeu de données, de conditions de réutilisation et de voie de dialogue

Hello,

Witness Tree is not seeking to infer Indigenous territory, title, rights, or consultation obligations. Before considering any reserve-boundary source, please identify whether ISC can designate an authoritative, reserve-only polygon release suitable for the stated purpose.

If a suitable release exists, please provide its stable artifact or snapshot, edition, scope and precision statement, feature count, CRS, schema, checksum, exact licence, attribution, and refresh/correction contact. Please state whether a checksum-verified raw copy may be retained in immutable Canadian object storage, transformed internally, and used for derived/public results. Crucially, please identify the appropriate Indigenous engagement and right-of-reply process; we will not contact communities or acquire data before that route is identified.

Regards,

Chinonso Obeta<br>
Witness Tree<br>
chinonso8@gmail.com

---

Bonjour,

Witness Tree ne cherche pas à inférer les territoires, titres, droits autochtones ni les obligations de consultation. Avant toute considération d’une source de limites de réserves, veuillez indiquer si ISC peut désigner une publication polygonale de réserves, faisant autorité et adaptée à cet usage.

S’il existe une publication appropriée, veuillez fournir l’artefact stable ou l’instantané, l’édition, l’énoncé de portée et de précision, le nombre d’entités, le SCR, le schéma, la somme de contrôle, la licence, l’attribution et le contact de mise à jour/correction. Veuillez indiquer les conditions d’archivage brut immuable au Canada, de transformation interne et de résultats dérivés/publics. Surtout, veuillez indiquer la démarche de dialogue et de droit de réponse appropriée avec les détenteurs de droits; aucune communauté ne sera contactée et aucune donnée ne sera acquise avant cette indication.

**Can unblock:** `indian-reserves`, `first-nation-reserves`.

## 7. CIRNAC — treaty geometry authority and engagement

**To:** infopubs@sac-isc.gc.ca<br>
**From:** Chinonso Obeta <chinonso8@gmail.com><br>
**Subject:** Request for suitable treaty-boundary source, reuse terms, and appropriate engagement route / Demande de source appropriée, de conditions de réutilisation et de voie de dialogue

Hello,

Witness Tree will not digitize, spatially join, or treat the published historic-treaty illustrations or modern-treaty map as legal or precision geometry. Could CIRNAC identify whether a suitable authoritative source exists for a clearly limited, non-legal purpose, or confirm that none should be used for this purpose?

For any suitable release, please provide the stable artifact or snapshot, edition, legal/precision scope statement, feature count, CRS, schema, checksum, exact licence, attribution, and refresh/correction contact. Please state the conditions for a checksum-verified raw copy in immutable Canadian object storage, internal transformation, and derived/public outputs. Please also identify the appropriate Indigenous engagement and right-of-reply process. We will not acquire any geometry or contact rights-holders before receiving that direction.

Regards,

Chinonso Obeta<br>
Witness Tree<br>
chinonso8@gmail.com

---

Bonjour,

Witness Tree ne numérisera pas les illustrations des traités historiques ni la carte des traités modernes, et ne les utilisera pas comme géométrie juridique ou précise. CIRNAC peut-il indiquer si une source faisant autorité convient à un usage clairement limité et non juridique, ou confirmer qu’aucune source ne devrait être utilisée à cette fin?

Pour toute publication appropriée, veuillez fournir l’artefact stable ou l’instantané, l’édition, l’énoncé de portée juridique/de précision, le nombre d’entités, le SCR, le schéma, la somme de contrôle, la licence, l’attribution et le contact de mise à jour/correction. Veuillez aussi indiquer les conditions d’archive brute immuable au Canada, de transformation interne et de résultats dérivés/publics, ainsi que la démarche appropriée de dialogue et de droit de réponse avec les détenteurs de droits. Aucune géométrie ne sera acquise et aucun détenteur de droits ne sera contacté avant cette orientation.

**Can unblock:** `historic-treaties`, `modern-treaties`.

## Already sent — no duplicate message

**To:** FAIB.Data.Management@gov.bc.ca<br>
**Subject:** Permission request — Harvested Areas of BC (Consolidated Cutblocks)

This request was recorded as sent on 2026-08-14 at 17:17:15 UTC. FAIB replied on 2026-08-18 at 18:28:15 UTC asking for the proposed derived, aggregate, map-tile and public-output products; a follow-up supplied those details on 2026-08-19. Do not send a duplicate initial request. No written authorization, licence, attribution decision or exact artifact has been supplied, so `bc-consolidated-cutblocks` remains blocked.

## Review boundary

Even a positive response does not admit a source. Before any source can advance, the response must be preserved as evidence, the exact supplied artifact must be retrieved through the approved path, its bytes and checksum verified, and the appropriate archive, geometry, governance, owner-admission, transformation, ingestion, release, and production gates independently satisfied.
