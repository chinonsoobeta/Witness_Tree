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

The shortest lawful route is to secure both publishers' permissions and an
accessible current Québec artifact, then acquire and profile only the two
missing provincial editions. Do not mix the future Québec edition into the
current four-province set.

## Numerator impact

The raw-evidence numerator remains exactly **14.75/31**. This audit adds **0**
credit, so the formal evidence-tracking score stays **39.2741935%**. Resolving
either entire row would move that row from `0.25` to `0.75`, a `+0.50` raw
credit change; partial resolution of one missing component earns no additional
credit.
