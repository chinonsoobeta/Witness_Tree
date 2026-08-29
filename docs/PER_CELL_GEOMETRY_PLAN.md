# Per-cell forest-loss geometry, 1984–2022

Plan only. Nothing in this document has been executed, and one of its
preconditions is a decision that is not mine to make.

Every number below that is labelled *measured* was read off this machine or
off the project ledgers on 2026-08-29. Numbers labelled *derived* are
arithmetic on those. Numbers the plan needs but does not have are named as
gaps, not filled in.

---

## 1. Why the site currently says the map is not per-cell geometry

The Explore map publishes four provincial aggregates for a single interval:
QC 0.97%, ON 1.44%, AB 2.81%, BC 1.39% for 2020–2022. Colour is constant
inside each province because the value is one number per province, not one
number per cell.

The banner that says this is a technical preview rather than per-cell
forest-loss geometry is accurate, and it stays accurate until every step in
this plan has actually run. It is not a placeholder to be edited away.

Three separate things are true at once, and they are easy to conflate:

1. **The underlying per-cell data exists.** It has existed since 2026-08-22.
2. **It has never been turned into geometry, reviewed, or admitted.**
3. **Materializing it nationally is currently prohibited by contract.**

Item 3 is the blocker, and section 3 covers it.

---

## 2. What already exists (measured)

This is the part that surprises people: the expensive computation is done.

### The national loss rasters

`derived/phase2-real-national-1984-2022-v1/loss/` holds **38 annual
whole-interval loss rasters**, `detected-forest-loss-1984-1985.tif` through
`detected-forest-loss-2021-2022.tif`.

| Property | Value |
| --- | --- |
| Grid | 193,936 × 128,340 cells |
| Resolution | 30 m |
| CRS | Lambert Conformal Conic 2SP on NAD83, standard parallels 49°/77°, false origin 49°N 95°W |
| Origin | (−2,660,910.524, 2,998,848.1105) |
| Type | Byte, nodata 255 |
| Layout | LZW, 512 × 512 blocks |
| Size on disk | 3.9 GB for all 38 |

**The earliest year on file is 1984.** The first interval is 1984–1985 and the
last is 2021–2022. The site's 2020–2022 window is a publication choice, not a
data limit. This plan covers all 38 intervals and there is no reason to start
at 2020.

Alongside them: `masks/` holds 39 annual forest masks (17 GB) and
`disturbance/` holds `recorded-harvest-1985-2022.tif` and
`wildfire-1985-2022.tif`, which are sparse and total only 262 MB
compressed.

### The connected-component lineage, already complete

`derived/phase2-real-loss-component-inventory-1984-2022-v1/`, status
`completed`, 38 of 38 pairs.

| Measured | Value |
| --- | --- |
| Connected components (patches), all years | **303,530,909** |
| Loss cells, all years | **1,384,027,417** |
| Nodata cells encountered | 0 |
| Component lineage on disk | **68.3 GB** of JSONL |
| Connectivity | 4-neighbour |

1.384 billion cells at 30 m is 124.6 Mha of gross detected change over 38
years. That is a count of change events, not a net area, and it double-counts
any cell that changed more than once across intervals.

The lineage is already run-length encoded. One line per run and one per
finished component:

```
{"componentId":1140185245,"record":"run","row":5879,"x0":35501,"x1":35501}
{"cellCount":1,"componentId":1140185245,"firstCell":1140185245,"record":"component"}
```

Runs counted directly: 6,310,028 for 1984–1985 and 12,738,658 for 2020–2021.
Both files give a runs-per-cell ratio of 0.379, so the national total is
*derived* at **≈525 million runs**.

**This means the hard part is behind us.** Connected-component labelling
across a 24.9-gigacell raster is the step that normally needs a cluster. It
was done single-machine, bounded to two raster rows of state at a time, and
the result is on the SSD with per-pair checksums.

### The pilot

`derived/phase2-patch-event-pilot-1984-1985-v2/pilot.wtpe`, 11,356,389 bytes,
format `WTP2PE01`. It converted **the first 10,000 finalized components** of
the 1984–1985 pair into event records carrying `areaHectares`, `category`,
`coverageGrade`, `evidence`, `eventStart`/`eventEnd`, an inclusive-x-run
geometry at unsimplified 30 m, and hashes binding the method parameters, the
source lineage and the source loss raster. It is marked
`productionEligible: false`, `released: false`.

The pilot proves the encoding works. **Its generator is not in the repository
and is not on the SSD.** Rebuilding that generator as versioned, tested repo
code is work item 1, not a copy-paste.

### The governance state

- `data/phase2-zonal-aggregation-contract.json` lists, under `prohibitions`:
  **"national per-cell geometry or polygon materialization"**, plus
  "converting nodata/Unknown to observed non-loss" and "production claims
  using illustrative or unadmitted geometry".
- `data/phase2-formal-exit-status.json`: **2 of 4** formal exit criteria, 50%.
  Admitted: the v2.1 national baseline and the boundary aggregates, both
  under limited, non-release, nonproduction scope. Not met:
  `expert-review-100-per-province` (400 real candidates exist, review not
  started, every province count zero) and `published-independent-comparisons`
  (every required value published null pending like-for-like inputs).
- `claims`: `productionEligible: false`, `released: false`,
  `formalPhaseComplete: false`.

---

## 3. The precondition that is not an engineering task

The contract prohibits exactly the thing this plan produces.

That prohibition was written for a reason and the reason is still live: a
national per-cell polygon layer invites every reader to zoom to their own
land and read a 30 m cell as a statement about that parcel, at a moment when
the expert review that would tell anyone how often those cells are right has
not started and stands at zero of 100 per province.

So this plan cannot begin with code. It begins with an owner decision on a
narrowly scoped amendment. Authorization to run the pipeline is not the same
as the amendment, and neither one is evidence that the review happened.

**What the amendment has to settle, in writing, before stage 1 runs:**

1. Whether national per-cell materialization is permitted at all, and under
   what scope word. The existing vocabulary is "limited, non-release,
   nonproduction".
2. Whether the output may be published, and if so at what zoom. Producing it
   and publishing it are two decisions, and the honest default is to produce
   it, hold it, and publish nothing above the aggregate the site already
   shows until the expert review has numbers.
3. The **minimum mapping unit**. 303.5M components include an enormous
   number of single-cell patches: every one of the first four components in
   the 1984–1985 file has `cellCount: 1`, which is 0.09 ha. Whether a 0.09 ha
   detection is a patch or is speckle is a method decision with a real effect
   on every published count. It must be recorded in the method manifest with
   its reason, not chosen inside a script.
4. Whether the nodata rule survives contact with polygons. A polygon has an
   inside; a cell can be Unknown. The prohibition on turning Unknown into
   observed non-loss has to be restated in polygon terms, or the geometry
   will quietly assert coverage it does not have. The lineage records
   `nodataCellCount: 0` for these pairs, which helps, but the rule still
   needs to be written for the general case.

Until item 1 is decided, stages 1 through 5 below are not startable, and
saying otherwise would be inventing an approval.

---

## 4. The machine, measured

This section exists because the obvious plan, "fan out across all 10 cores",
is wrong here, and the measurements say why.

| Measured | Value |
| --- | --- |
| Cores | 10 logical, 10 physical |
| RAM | 16 GB |
| SSD free | 1.4 TiB of 1.8 TiB |
| Sequential read, 1 stream | **137 MB/s** |
| Sequential read, 6 parallel streams | **101 MB/s aggregate** |
| Sequential write, 1 stream | **130 MB/s** |
| Concurrent read + write | **110 MB/s aggregate** |
| Python `json.loads` throughput | **1.12 M lines/s per core** |

**The device does not scale with concurrency. It gets slower.** Six parallel
readers delivered 101 MB/s where one delivered 137 MB/s, because the queue
starts seeking between six streams instead of reading one. Every "use all the
CPUs" instinct that translates into "start ten readers" makes this pipeline
26% slower.

The right shape follows directly:

> **One reader thread per volume. All parallelism happens on bytes that are
> already in memory.**

A single reader pulls 64 MB chunks off the SSD at full speed and hands them
to a pool of 8 worker processes. The reader is never idle, the workers are
never waiting on the device, and the device never sees a second stream.

The corollary is that **passes are the unit of cost, not cores.** Design for
the smallest number of full passes over the 68.3 GB, and never re-read.

### What that implies for wall clock

*Derived* from the measurements:

- Total JSONL lines ≈ 303.5M component records + 525M run records ≈ **829M**.
- CPU to parse them all: 829M ÷ 1.12M/s = **740 core-seconds**. On 8 workers,
  **≈ 1.5 minutes**.
- I/O to read 68.3 GB once at 137 MB/s: **≈ 8.3 minutes**.
- I/O for one read-plus-write pass, 68.3 GB in and ~20 GB out, at the
  measured 110 MB/s concurrent aggregate: **≈ 13 minutes**.

CPU is not the constraint by roughly a factor of eight. **A full national
conversion of all 38 years is a job measured in tens of minutes, not days**,
provided it is one streaming pass and not a database.

Polygonization (stage 2) is the one genuinely CPU-heavy step and is perfectly
parallel per component; it is the only place where adding cores helps
linearly, and it should be co-scheduled with the same single reader.

Two things would invalidate these figures and must be re-measured rather than
assumed: an output format that needs a global sort (stage 3 budgets for it
explicitly), and any stage that random-accesses the rasters instead of
streaming them.

---

## 5. The pipeline

Six stages. Stages 1–3 are the product; 4–5 are delivery; 6 is evidence.

### Stage 1. Rebuild the patch-event extractor as repo code

Restore what produced `pilot.wtpe`, as `scripts/build-phase2-patch-events.mjs`
plus a `lib/phase2/patch-events.ts` module, with unit tests over small
fixtures covering: a single-cell component, a component whose runs straddle a
chunk boundary, a component touching the raster edge, and a run adjacent to
nodata.

Parallel shape: the reader emits newline-aligned 64 MB chunks; workers parse
and group runs by `componentId`; a component whose runs straddle a chunk
boundary is emitted as a partial and stitched by a serial merge. At 64 MB
chunks there are ~1,092 chunk boundaries across all 38 files, so stitching is
negligible.

Output: one `.wtpe` per interval, same schema as the pilot, carrying the same
four hashes. **Bounded memory: no worker holds more than one chunk plus its
open partial components.**

Gate: `check:phase2-patch-events` re-derives the record count and the
component-id set for one interval from the lineage and fails on any mismatch.

### Stage 2. Polygonize

Runs to rings. Each component's inclusive-x-runs trace directly to a
rectilinear boundary; no general polygonizer is needed and none should be
used, because a general one will simplify and this output must not.

Two geometry products, and keeping them separate is the point:

- **`cells`**, the exact run store. 525M runs at 12 bytes (u32 row, u32 x0,
  u32 x1) is *derived* at **≈6.3 GB**, delta-encodable to less. This is the
  authoritative geometry. It is never simplified, ever.
- **`patches`**, one unsimplified rectilinear polygon per component, with
  `areaHectares`, `cellCount`, interval, and the stage-3 attributes.

Parallel shape: fully independent per component. This is where the 8 workers
earn their keep. Feed them from the same single reader.

**Size is the one number this plan cannot give you.** Patch vertex counts
depend on shape complexity that the lineage does not record. Measure it on
the 1984–1985 pair first, extrapolate by component count, and confirm the
total fits the 1.4 TiB before starting the other 37.

### Stage 3. Attribute each patch

Join `recorded-harvest-1985-2022.tif` and `wildfire-1985-2022.tif` to label
cause, and the annual forest masks to carry the denominator.

The efficient shape is not a lookup. The lineage is emitted in raster row
order and the rasters are stored in row-major 512 × 512 blocks, so this is a
**co-sequential scan**: advance the patch stream and the two disturbance
rasters together, matching on row. The disturbance rasters are 262 MB
compressed, so this adds almost nothing to the I/O budget and avoids random
access into a 24.9-gigacell grid entirely.

Rule that must be enforced in code and asserted in a test: a cell that is
Unknown in a disturbance raster produces a patch attributed `unknown`, never
`not-harvest` and never `not-fire`.

### Stage 4. Spatially order

Compute a Hilbert index per patch in stage 2, then external-merge-sort. For a
~12 GB patch table this is two passes of read-plus-write at the measured
110 MB/s: *derived* **≈ 7 minutes**. Sorting is what makes stage 5 cheap and
makes the tiles small; skipping it costs more later than it saves now.

### Stage 5. Tiles, with an honest zoom policy

30 m cells cannot be shown below about z13. Pretending otherwise is where a
per-cell layer starts lying, so the layer is explicitly zoom-tiered:

| Zoom | What is served | What it is |
| --- | --- | --- |
| z0–z7 | the existing provincial aggregates | unchanged from today |
| z8–z12 | patch polygons, generalized per zoom | a **presentation** generalization, labelled as such |
| z13+ | unsimplified patch polygons | the real boundary |
| on request | the `cells` run store | the authoritative geometry |

The generalized tiers are the "illustrative geometry" the contract's third
prohibition is about. They may be drawn; they may not be counted. Any
statistic on the site continues to come from the zonal aggregates, never from
a tile.

Delivery reuses the existing PMTiles release path
(`scripts/build-phase2-province-map-release.mjs`, the CloudFront release
prefix, the `check:phase8-province-map-release` gate). 38 intervals is 38
layers or one layer with an interval attribute and a time filter; the
existing native time control on Explore already has the interaction for it.

### Stage 6. Evidence, before any of it is published

- A `phase2-per-cell-geometry` exit-status record, fail-closed checker, and
  tests, in the house pattern.
- A readback that re-derives component counts and total cell counts per
  interval from the geometry and compares them to the lineage inventory,
  which is the whole point of having done the lineage first.
- Method parameters in the method manifest, hashed: minimum mapping unit,
  connectivity, the nodata rule, and every simplification tolerance per zoom.
- The publication criterion stays **fail** until the expert review has real
  per-province numbers. Producing the geometry does not move
  `expert-review-100-per-province`, and no part of this plan should be read
  as moving it.

---

## 6. Order of work

| # | Item | Blocked on |
| --- | --- | --- |
| 0 | Contract amendment and the four method decisions in §3 | **Owner. Nothing below starts without it.** |
| 1 | Patch-event extractor as repo code, with tests | 0 |
| 2 | Run the 1984–1985 pair; measure real output size and wall clock | 1 |
| 3 | Confirm the extrapolated 38-year total fits 1.4 TiB | 2 |
| 4 | Polygonize + attribute + sort, all 38 intervals | 3 |
| 5 | Readback and exit-status evidence | 4 |
| 6 | Tiles and the zoom policy | 5 |
| 7 | Publication decision | expert review, which is at 0 of 100 per province |

Items 1 through 6 are engineering and, on the measured throughput of this
machine, are days of work rather than weeks. Item 0 and item 7 are not
engineering, and no amount of CPU shortens them.

---

## 7. What this plan does not do

It does not make the site's per-cell banner removable. The banner comes down
when items 0 through 7 are all closed, not when the geometry exists on disk.

It does not touch the expert review, the published comparison rates, or
Phase 2's formal exit percentage, all of which stay exactly where they are.

It does not license a single new claim. 1.384 billion detected change cells
is a count of detections, and what fraction of them are right is precisely
the question the unstarted review was designed to answer.
