# Read-only domain availability and price research

Observed **2026-08-25 13:00 PDT (America/Vancouver)**. This record is evidence for an owner decision only. It does not register, reserve, transfer, negotiate for, or authorize public use of any name or domain. Availability and pricing can change between this observation and an owner-approved checkout.

## Registry state: definitive RDAP responses

The `.ca` queries used the RDAP server published for CIRA by [IANA](https://www.iana.org/domains/root/db/ca.html): `https://rdap.ca.fury.ca/rdap/domain/<domain>`. The `.org` queries used the Public Interest Registry RDAP service: `https://rdap.publicinterestregistry.org/rdap/domain/<domain>`.

| Exact target | RDAP request | Response observed | Narrow conclusion |
| --- | --- | --- | --- |
| `witnesstree.ca` | [CIRA RDAP](https://rdap.ca.fury.ca/rdap/domain/witnesstree.ca) | HTTP 404, `Domain not found` | No registration record was returned at observation time. This is not a reservation or a guarantee that a registrar will sell the name. |
| `witnesstree.org` | [PIR RDAP](https://rdap.publicinterestregistry.org/rdap/domain/witnesstree.org) | HTTP 404 | No registration record was returned at observation time. This is not a reservation or a guarantee that a registrar will sell the name. |
| `mistik.ca` | [CIRA RDAP](https://rdap.ca.fury.ca/rdap/domain/mistik.ca) | HTTP 200; registration event `2004-02-09T18:23:56Z`; expiration event `2031-02-09T05:00:00Z`; `client transfer prohibited` | Registered; it is not available for ordinary new registration. No contact or acquisition attempt was made. |
| `mistik.org` | [PIR RDAP](https://rdap.publicinterestregistry.org/rdap/domain/mistik.org) | HTTP 200; registration event `2022-07-27T05:28:13.679Z`; expiration event `2027-07-27T05:28:13.679Z` | Registered; it is not available for ordinary new registration. No contact or acquisition attempt was made. |

These are registry responses, not DNS or registrar-search heuristics. No DNS lookup, registrar availability search, or purchase flow was used. RDAP records may contain redacted/limited registration data and do not grant a right to register or use a name.

## Public price snapshot (one possible registrar, not a recommendation)

Public Web Hosting Canada (WHC) pages displayed the following Canadian-dollar prices when this record was prepared. They are a decision-input snapshot, not a quote or checkout total. The current [new-domain page](https://deploy.whc.ca/domain-names/new) showed `.ca` C$10.99 (struck-through C$14.99) and `.org` C$14.99 (struck-through C$20.99); its live display can change. The [transfer page](https://whc.ca/noms-de-domaine/transfert) showed `.ca` C$8.99 (struck-through C$14.99) and `.org` C$14.99 (struck-through C$20.99), and says a transfer includes one year of renewal.

| TLD | Public new-registration display | Public renewal display | Public transfer display | Applies to target |
| --- | --- | --- | --- | --- |
| `.ca` | C$10.99 first year (C$14.99 shown struck through) | C$14.99/year displayed as the non-sale price | C$8.99 sale (C$14.99 shown struck through) | Only `witnesstree.ca` is currently unregistered; `mistik.ca` is registered. |
| `.org` | C$14.99 first year (C$20.99 shown struck through) | C$20.99/year displayed as the non-sale price | C$14.99 sale (C$20.99 shown struck through) | Only `witnesstree.org` is currently unregistered; `mistik.org` is registered. |

No checkout was entered, so taxes, payment fees, eligibility checks, premium/reserved-name treatment, exact renewal terms, and final transfer eligibility remain unverified. WHC describes WHOIS-contact management and identity protection as account features, but this observation does not establish whether privacy is included, available, or appropriate for any of these targets. Its transfer guidance also requires authorization/administrative-contact control and generally notes a 60-day registration/transfer restriction; no such credentials or control were requested or handled.

For `.ca`, CIRA states that registrants must satisfy a [Canadian Presence Requirement](https://www.cira.ca/en/ca-domains/register-your-ca/), select the relevant category, and register through a registrar. `.org` may be registered by anyone according to [Namecheap's public `.org` guide](https://www.namecheap.com/domains/registration/gtld/org/), but that statement does not displace any chosen registrar's terms or legal/naming review. Namecheap also notes an ICANN fee may be added to listed `.org` prices and privacy is subject to eligibility and terms; this is included only as a public caveat, not a WHC price comparison.

## Owner decision boundary

1. Do not use `mistik.ca` or `mistik.org` as if they can be newly registered; both have current registry records.
2. Before any `Witness Tree` registration, obtain the required owner approval, legal/name clearance direction, registrar terms, final tax-inclusive checkout price, and `.ca` eligibility confirmation.
3. Registration of any domain would reserve a technical identifier only. It would not confer trademark clearance, naming permission for Mistik, public-launch approval, or permission to admit production data.
