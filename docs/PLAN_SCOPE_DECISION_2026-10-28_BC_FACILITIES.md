# Plan scope decision, 2026-10-28: BC timber processing facilities

Decided by the owner, Chinonso Obeta, on 2026-10-28. Machine-readable record:
[`data/plan-scope-decision-2026-10-28-bc-facilities.json`](../data/plan-scope-decision-2026-10-28-bc-facilities.json),
checked by `npm run check:bc-timber-facilities-access`.

The owner's full message, replying to the feature plan:

> I approve all except for Feature #9: Reproduce it yourself. I approve the
> plan amendment for #9. For #5, I agree: We must not name individuals, but
> licenses and agencies are okay. Does this one require an FOI request? If so,
> hold it for now. Assign Opus 5.5 subagents on high reasoning to complete the
> implementation of these features.

## Interpretation, awaiting the owner's confirmation

The sentence approving a plan amendment names #9. Feature #9 (reproducibility)
needed no plan amendment, and the same message held it. Feature #10 (BC mill
facilities) was the only feature whose plan required amending sections 1.3 and
14.2, so the lead session applied the approval to #10 and told the owner so in
its reply. This amendment rests on that interpretation until the owner confirms
it; the record carries `ownerConfirmedInterpretation: false`.

## Plan sections amended

| Section | Before | After |
| --- | --- | --- |
| 1.3 Non-goals | No corporate ownership histories. | Unchanged, except that facilities may be listed from the BC survey within the scope below. Listing them is not a corporate ownership history and authorizes none. |
| 14.2 Organisation attribution rules | Name an organisation only where an authoritative public record names it, with the exact role, the record date and version, and a named dispute route. | A facility named by the survey may be listed within the scope below. Every 14.2 rule still applies. |

## Approved scope

- Facilities are listed from the Government of British Columbia's Major Primary
  Timber Processing Facilities survey, published under the Open Government
  Licence – British Columbia.
- Each facility shows its name, community, product type, year and status
  exactly as the survey records them.
- No cause is stated or implied for any change in status.
- No link is drawn between a facility and any loss figure.
- The organisation dispute route required by plan section 14.2 must be live
  before the facilities table is published, so the table is gated behind that
  route being configured.
- Alberta, Ontario and Québec are out of scope for this version, because no
  equivalent open annual survey has been verified.
- Legal review of the attribution wording remains an external gate.

## What this decision does not grant

No legal sign-off, production release, source rights, corporate ownership
history, causal attribution, link to loss figures or coverage of other
provinces. It marks no phase gate passed and records no admission or release.

## Rights check, 2026-10-28

The scope depends on the survey being published under the Open Government
Licence – British Columbia. The rights check the same day found that it is not.
See [`data/bc-timber-facilities-access-block.json`](../data/bc-timber-facilities-access-block.json).

- The BC Data Catalogue record, *British Columbia Major Timber Processing
  Facilities*, is **Access Only**: reproduction is not permitted without written
  permission. It holds only the latest survey's open and presumed-open mills as
  a spatial layer.
- The only facility-level spreadsheet, the *List of Mills Appendix 2023*
  (51,820 bytes, SHA-256 `ca52dbd6…16cc`), and the yearly reports are on
  gov.bc.ca with no licence, so the gov.bc.ca copyright terms apply: all rights
  reserved.
- Only survey year 2023 is a spreadsheet. 2020 to 2022 are PDF reports; years
  before 2014 are available only on request.
- The appendix lists open and presumed-open mills only and has no status column.
  Its company column, by the publisher's own note, was compiled partly from
  company websites.

So nothing was built under this decision: no transformed record, page panel or
table. The file was read in a scratch directory to record its checksum and
contents and was not kept in the repository or the data root.

## What would unblock it

Written permission from the Province (the copyright permission form, or the
Economics and Trade Branch at Mill.Survey@gov.bc.ca), or publication of the
appendices under the Open Government Licence – British Columbia. A request
draft is in the access block record; it has not been sent. The approved
`status` field also needs the survey's category for each facility and year,
which the published appendix does not carry.
