# 1984-2022 owner admission packet

Prepared 2026-09-18. **Status: template, not approved.** No admission record exists for anything in it.

On 2026-09-18 the owner said that "all the map data should be admitted and published to the site from 1984 to 2022." That is a direction, not an admission, because it names no bytes. [`data/phase2-1984-2022-owner-admission-packet.json`](../data/phase2-1984-2022-owner-admission-packet.json) names the bytes. Each one is bound by SHA-256, computed from disk when the packet was built. Only a decision recorded against the packet's own SHA-256 can admit them.

The 2026-08-26 record admitted only the 2020-2022 province aggregate. This packet does not edit or widen that record.

## The new province calculation

Until now there was no province figure for any span other than 2020-2022 and 1984-2022. The new file [`data/phase3-province-interval-spans-1984-2022.json`](../data/phase3-province-interval-spans-1984-2022.json) holds all 741 spans for BC, AB, ON and QC. Each span has:

- loss counted once per place;
- forest known at the start year;
- unknown area;
- yearly losses added together.

**How it was computed**
- The bound interval worker (`scripts/phase3_interval_zonal_aggregate.py`, unchanged) cannot fit a whole province in memory. So each province was cut along exact pixel edges into 383 pieces in total, and the worker ran on each piece.
- Every counted field is a cell count, and the worker's centre rule puts each cell in exactly one piece, so summing the pieces is exact.
- A four-riding test matched the single-pass worker on all 12 fields.
- The run used 10 workers and took 27 minutes. It was limited by SSD reads, not CPU.

**Every anchor holds to the cell** (`data/phase3-province-interval-spans-anchor-check.json`):

| Anchor | BC | AB | ON | QC |
| --- | --- | --- | --- | --- |
| 1984-2022 loss and 1984 forest equal the cumulative run | yes | yes | yes | yes |
| 38 one-year spans equal the annual series (loss and forest) | 38 | 38 | 38 | 38 |
| 2020-2022 equals the admitted figure (ha and percent) | 800,473.32 | 748,863.72 | 714,701.70 | 680,273.64 |
| No span's once-counted loss exceeds its yearly sum or its forest | yes | yes | yes | yes |

The older federal-riding rollup is not proposed. District edges run into water that the province boundary excludes, so for 1984-2022 it overstates the once-counted loss: BC by 787.59 ha, ON by 646.38 ha and QC by 333.72 ha.

**Selected spans.** Each figure is a minimum. Percent is of forest known at the start year. The four-province figure is the sum over provinces, which is exact because provinces don't overlap.

| Span | BC | AB | ON | QC | Four provinces |
| --- | --- | --- | --- | --- | --- |
| 1984-2022 | 10,823,353 ha (19.57%) | 6,842,769 ha (27.52%) | 9,280,647 ha (19.07%) | 18,028,529 ha (25.97%) | 44,975,298 ha (22.69%) |
| 2002-2022 | 7,454,806 ha (12.91%) | 5,320,396 ha (20.14%) | 4,495,202 ha (9.39%) | 9,521,489 ha (13.68%) | 26,791,894 ha (13.29%) |
| 2012-2022 | 4,287,191 ha (7.40%) | 3,420,167 ha (12.59%) | 2,264,434 ha (4.61%) | 4,695,975 ha (6.72%) | 14,667,767 ha (7.19%) |

Share of each province with no data: AB 24.02%, QC 15.05%, ON 9.03%, BC 0.004%.

## What the owner is asked to decide

**Choices:** approve admission and release, approve admission only, reject, or defer. Items can be chosen one at a time.

| Item | What it is | Note |
| --- | --- | --- |
| A | The 79-raster national batch everything is computed from (`phase2-real-national-1984-2022-v1`) | Not admitted today. The 2026-08-26 record covered a different 21-raster batch. |
| B | Province annual series and the 1984-2022 once-counted loss | Marked countable today, as a minimum. |
| C | The new province span file, its per-piece file and its driver | All anchors hold. |
| D | District span figures | Federal, BC and ON only. See below. |
| E | 38 annual per-cell patch archives (already on the CDN) | They draw outside the four provinces. No span-ready archive exists yet. |
| F | The 960 m coarse grid behind draw-and-measure | Built and complete, never uploaded. |

**Release means:**
- new release records;
- uploading the coarse grid;
- rewriting the site copy that says the figures cover only 2020-2022;
- a 1984-2022 bulk download;
- deploying only through the ChatGPT Sites control plane.

**What approval cannot do.** Phase 2 stays at 2 of 4 and Phase 8 stays at 8 of 16. Approval admits and releases bytes. It does not complete expert review, the independent comparisons or any external event.

## Alberta and Québec districts cannot be admitted by this packet

The source inventory records both provincial district maps as blocked on rights. On 2026-09-18 I read each publisher's public terms (read only: nothing was sent, requested or accepted).

**Alberta.** The bound file is Elections Alberta's 2019 shapefile.
- Elections Alberta's [terms](https://www.elections.ab.ca/terms-conditions/) allow non-commercial reproduction only if:
  - the material is not modified;
  - Elections Alberta is named as the source;
  - it is not presented as official or endorsed.
- There is no set attribution sentence, and the shapefile carries no licence file.
- The site reprojects, generalizes and tiles the outlines, and derives figures from them. That is modification, so attribution alone doesn't cover it.
- **The site's current credit is wrong.** `lib/explore/boundaries.ts:76` credits the Alberta outlines to the Open Government Licence - Alberta, but this file was not published under that licence.
- **A possible clean path the repo never considered.** The Government of Alberta publishes "Provincial Electoral Division - Current 2019" (Provincial Geospatial Centre) under the Open Government Licence - Alberta. That licence allows modification with the credit "Contains information licensed under the Open Government Licence - Alberta."
  - This copy is not acquired or compared with the bound file.
  - Re-sourcing Alberta from it would need its own decision.
  - The licence page returned an error on 2026-09-18 and should be re-read before anyone relies on it.

**Québec.** The bound file is Élections Québec's 2026 map.
- The map was enacted on 2026-06-12 and published in the Gazette on 2026-06-17. It is first used at the 2026-10-05 election.
- Its shapefile is now public, which settles the "no accessible artifact" half of the blocker.
- Élections Québec's [terms](https://www.electionsquebec.qc.ca/en/our-institution/terms-of-use/) allow non-profit reproduction if the source and © are credited. Adapting the content or commercial use needs written permission.
- If permission is granted, the credit would read: "Source : © Directeur général des élections du Québec et Commission de la représentation électorale, 2026."
- Données Québec has no open copy of the boundaries, only a list of division names.

**Already live.** Both outlines are already in the live boundary-overlays-v3 release, which records no rights basis for them. This packet doesn't change that; it is raised for a separate decision.

## Rebuild and check

```sh
python3 scripts/phase3-province-interval-spans-check-anchors.py data/phase3-province-interval-spans-1984-2022.json
```

Rebuilding the span file needs the SSD. That command is recorded in the file's `execution` and `derivation` blocks. The packet builder (`scripts/build-phase2-1984-2022-owner-admission-packet.py`) refuses to build unless the anchor check and the partition test both pass. It also refuses to overwrite an existing packet.
