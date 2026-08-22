# Phase 1 partial-ledger evidence audit

The canonical ledger has exactly two `partial-component` rows. This audit used
official publisher sources and changes neither row's evidence credit. No new
artifact was downloaded, no publisher agreement was accepted, no permission
request was sent, and no archive, transformation, ingestion or production
claim was made.

## National historical fire

The acquired component is the Canadian National Fire Database polygon archive:
778,498,701 bytes, SHA-256
`a0373a6dd8e341c3440ed9907f81e8ba6227135dacd9cdc07e4c6af0a59b1b4e`,
48,571 profiled features. It does not substitute for the other named component.

The missing component is NRCan's National Burned Area Composite. The
[official NBAC index](https://cwfis.cfs.nrcan.gc.ca/downloads/nbac/) lists a
dated 1972–2025 Shapefile archive and metadata release `20260513`, but the
[official end-user agreement](https://cwfis.cfs.nrcan.gc.ca/datamart/datarequest/nbac)
requires affirmative acceptance. It limits use to the licensee's own internal
use and prohibits distribution or transfer without Canada's prior written
consent. An agent cannot accept those terms for the accountable owner.

The shortest lawful route is an explicit owner decision on the exact agreement
and intended private staging/archive/public-display use. If accepted, acquire
the single dated archive and metadata PDF, checksum and profile them, and retain
the prescribed citation. Obtain written consent before any redistribution or
transfer.

## Provincial electoral boundaries

BC and Ontario are already locally checksum-bound and profiled. Reacquiring
them would add no missing evidence. Alberta and Québec remain outstanding:

- [Elections Alberta's terms](https://www.elections.ab.ca/terms-conditions/)
  allow non-commercial educational reproduction without modification;
  commercial distribution needs written permission. The geography data lead
  must obtain written permission covering retention, transformation,
  public-service use and redistribution before acquisition.
- [Élections Québec identifies the 2017 map as current](https://www.electionsquebec.qc.ca/cartes-electorales/carte-electorale-du-quebec/).
  Its direct GeoJSON returned HTTP 403 in the recorded audit. The
  [official terms](https://www.electionsquebec.qc.ca/notre-institution/conditions-dutilisation/)
  permit nonprofit reproduction with attribution, while adaptation and other
  use need written authorization. The locally checksum-bound 2026 map is not
  current until the 43rd legislature ends and cannot substitute early.

The shortest lawful route is to secure Alberta's permission, obtain Québec's
written authorization and confirmation that the public 2017 atlas ZIP is the
accepted current artifact, then acquire and profile only the two missing
provincial editions. Do not mix the future Québec edition into the current
four-province set.

## Current route exhaustion (2026-08-20)

The machine-checked route record in
[`data/phase1-partial-source-route-exhaustion.json`](../data/phase1-partial-source-route-exhaustion.json)
captured the two partial-row routes against evidence head `650a7da`; its impact
fields are reconciled against the current integrated head `1749b50`. Read-only HTTP
HEAD inspection established that the exact NBAC ZIP is publicly listed and
returns 1,257,052,370 bytes, the Alberta 2019 ZIP returns 2,852,757 bytes, and
the Québec 2017 atlas ZIP returns 30,007,395 bytes. None was downloaded.

The Québec atlas ZIP is a newly recorded public alternative to the blocked
direct 2017 GeoJSON route. Its official page describes 2017 provincial
divisions and municipalities in Shapefile format. That page permits
non-commercial reproduction with attribution, but the official Québec
conditions require written authorization for adaptation or other use and note
additional Statistics Canada restrictions. It therefore does not clear the
intended transformed public-service scope. The Alberta ZIP is likewise
published, but Elections Alberta's terms require unchanged reproduction for
the public non-commercial/educational exception; the intended transformation,
derived outputs and redistribution still need written permission.

The NBAC index also exposes annual fragments, raster/summary products and
public services. The fragments do not establish the named single 1972–2025
release; the raster/summary products are not the required polygon source; and
the service routes do not provide a checksum-bound immutable release. The
dated vector ZIP remains governed by the affirmative NBAC End-User Agreement,
which limits use to the licensee's internal use and requires Canada's prior
written consent before transfer or distribution.

The bounded Gmail searches found no message or substantive reply for either
partial row. The prepared NBAC, Alberta and Québec owner requests remain
unsent, and the route record preserves zero acquisition, permission, checksum,
profile, archive and score credit.

## Numerator impact

The older component audit records a **14.75/31** baseline. The current
canonical ledger is **14.75/31** with **9/31**
immutable archive proofs and a **39.2741935%** evidence-tracking score. This
current route audit adds **0** credit and does not change those counts. Resolving either
entire row would move that row from `0.25` to `0.75`, a `+0.50` raw-credit
change; partial resolution of one missing component earns no additional
credit.
