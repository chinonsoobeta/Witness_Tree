# Alberta and Québec district sources, 2026-09-18

The record is [`data/provincial-electoral-sources-2026-09-18.json`](../data/provincial-electoral-sources-2026-09-18.json). It succeeds the source inventory, ledger and outreach records for these two sources. Those records are not edited.

## Alberta: re-sourced

The owner asked for Alberta to be re-sourced.

- **Before:** Elections Alberta's 2019 shapefile. Its terms allow non-commercial reproduction only without modification. The site reprojects, tiles and measures the outlines, so those terms don't cover it.
- **Now:** the Government of Alberta's "Provincial Electoral Division - Current 2019" layer (Provincial Geospatial Centre).
  - Licence: Open Government Licence - Alberta 2.2, which allows modification and commercial use with attribution.
  - Retrieved read-only on 2026-09-18 from `geospatial.alberta.ca`. Only the number, name and province fields were requested; the member-name fields were left out.
  - Stored on the SSD at `raw/alberta-provincial-electoral-divisions-2019/2026-09-18/`, with response headers, layer description, metadata XML and a sidecar.
- **Compared with the old file:**
  - The same 87 division numbers and names.
  - Total area differs by 44.7 ha out of 66.3 million ha.
  - Outlines differ by 2,022 ha in all (0.003%). The largest single division difference is 0.14%.
  - Alberta figures are re-run, not reused.
- **Credit:** the sentence the licence prescribes, "Contains information licensed under the Open Government Licence - Alberta", with the licence's own dash. It is shown in English on both locales rather than as our own translation.

## Québec: reused as published

The owner said Québec doesn't need adapting and the boundaries should just be reused.

- **Found:** the copy the project had been using had the published geometry, but one name was rewritten. "Riv.-du-Loup-Témis.-Basques" had been expanded to the full name. That is an adaptation.
- **Now:** Élections Québec's published file, byte for byte (sha256 `5c22379a...`).
  - Names and identifiers are shown as published.
  - The outlines are drawn without simplification.
- **Credit:** "Source : © Directeur général des élections du Québec et Commission de la représentation électorale, 2026."
- **What this is and isn't:**
  - It is the owner's determination that unchanged reuse falls within Élections Québec's non-profit reproduction terms.
  - It is not written permission. Nothing was sent to or received from Élections Québec.
  - The first packet build had read tiling and measuring as possibly adaptation. The record keeps that reading next to the owner's determination.

## What was rebuilt

Every earlier output is kept as run. The new outputs have new names:

| Output | New name |
| --- | --- |
| Interval district figures | `ab-provincial-ridings-2019-goa`, `qc-provincial-ridings-2026-published` |
| Annual district figures | the same two names |
| District index | `phase6-district-index-v2` |
| Boundary tiles | `boundary-overlays-v4` (built locally, not uploaded) |

Québec's geometry is unchanged, so its figures and index had to come out identical to the earlier run, and they did. That makes Québec a free check on the rerun.

## Not done here

- Nothing was uploaded or deployed.
- The live site still draws the v3 tiles, which hold the Elections Alberta outlines.
- The site credit changes in the same step that switches the site to v4. Changing it earlier would credit a source the site isn't drawing.
