# Boundary editions: a false toolchain claim, and why engineering cannot correct it alone

## Status

**Owner-blocked.** The correction is written and verified. It is not merged, because merging it
would break an owner admission binding, and an owner admission may not be rebound by engineering.

## The false claim

[`data/boundary-editions.json`](../data/boundary-editions.json) on `main` states:

> gdalinfo is NOT installed on the staging machine, so no geometry, CRS, or attribute schema was validated.

and lists as a limitation:

> gdalinfo is not installed. Geometry, coordinate reference system, and attribute schema are Unknown — no vector content was read.

Both statements are false as of this writing, and `main` is already self-contradictory about it:
[`data/raster-grid.json`](../data/raster-grid.json), which is on `main`, records
`"gdal": "3.13.2"`, `"proj": "9.8.1"`, `"geos": "3.14.1"` and 39 of 39 years opened with zero GDAL
errors. One record on `main` says the toolchain is absent while another records its output.

This matters beyond tidiness. The claim is load-bearing: it is the stated reason several
downstream limits hold geometry validity at `Unknown`. A reader who notices the contradiction has
no way to tell which record is stale, and a reader who trusts the false one will conclude that a
check which *was* run was not run.

## Independent verification

This was not accepted on the strength of the unmerged branch that proposed it. Each claim was
re-derived on the staging machine.

**Toolchain presence and versions.**

```sh
gdalinfo --version      # GDAL 3.13.2 "Iowa City", released 2026/07/20
proj                    # Rel. 9.8.1, April 10th, 2026
geos-config --version   # 3.14.1
```

The versions match the record's proposed text exactly, and match what `data/raster-grid.json`
already records.

**Feature counts, by real OGR reads.** `ogrinfo -so -al` was run over the `/vsizip` virtual
filesystem against each staged archive, read-only, with nothing extracted or modified:

| Edition | Recorded | OGR read | Result |
| --- | ---: | ---: | --- |
| `statcan-2021-provinces-territories-cbf` | 13 | 13 | match |
| `statcan-2021-census-divisions-cbf` | 293 | 293 | match |
| `statcan-2021-census-subdivisions-cbf` | 5161 | 5161 | match |
| `elections-canada-fed-2023` | 343 | 343 | match |
| `statcan-2021-fed-2013-order-cbf` | 338 | 338 | match |

All five returned exit code 0. Every count previously derived from `.shx` index arithmetic is
confirmed by a real read.

**The two boundary CRSs are the same CRS.** The Statistics Canada archives declare
`PROJCRS["NAD83 / Statistics Canada Lambert"]`; the Elections Canada archive declares
`PROJCRS["PCS_Lambert_Conformal_Conic"]`. Only the name string differs. PROJ finds exactly one
candidate operation between them:

```
Candidate operations found: 1
unknown id, Inverse of Statistics Canada Lambert + unnamed, 0 m, World
PROJ string: +proj=noop
```

and `cs2cs` round-trips test points at `(-2000000, 1000000)`, `(0, 0)`, and `(1500000, 2500000)`
with zero displacement to nine decimal places.

## What remains Unknown, and stays Unknown

`ogrinfo -so` reads headers. It does **not** open geometry. The correction does not touch these,
and the restated checker refuses any attempt to claim them:

- geometry validity: self-intersections, ring order, null or empty geometries, duplicate
  identifiers, and topological gaps or overlaps between adjacent polygons
- the full attribute schema beyond the headers
- whether the boundary polygons fall inside the raster footprint, because **no reprojection and no
  intersection has been executed**

`geometryValidated`, `crsValidated`, and `attributeSchemaValidated` therefore stay `false`.
`crsValidated` in particular is not stale: PROJ established that the two boundary CRSs match *each
other*, which is a different claim from the boundary CRS having been validated against the VLCE2
raster grid. It has not been, and those two differ by roughly 6,000 km.

## Why this cannot be merged by engineering

[`data/phase2-source-input-admission-statcan-2021-provinces-territories-cbf.json`](../data/phase2-source-input-admission-statcan-2021-provinces-territories-cbf.json)
is an owner admission. It carries `"decision": "approve"` and binds the exact bytes of the evidence
it was granted against:

| | |
| --- | --- |
| Bound path | `data/boundary-editions.json` |
| Bound SHA-256 | `037786098133fb10a5a485d3d3445b71d44d22b9e7c11ea02c6d95cd1e8ff663` |
| Admission recorded at | 2026-08-26T00:23:52Z |

That digest is the current content of the file on `main`. The corrected file hashes to
`2ee846edbd8230109342b0077f01bae9def20acef40e70f8970868df51db777c`, so merging the correction
invalidates the binding.

The binding exists for exactly this situation. It prevents the prose surrounding an approved
artifact from being rewritten underneath the approval. Rebinding it in engineering would convert
the owner's decision into a decision about text the owner never read. Engineering-derived evidence
may be rebound when its stated reason still holds; an owner admission may not.

Note what the correction does **not** disturb: the admitted artifact itself is untouched.
`artifactSha256` remains `d28bbb15d7b49e3d1828755a5f1b4ebcee699ad70efe8b0f1b902d29ebffd20b`,
`editionId` remains `statcan-2021-provinces-territories-cbf`, and `featureCount` remains 13, now
confirmed by a real OGR read rather than index arithmetic. The scope of what was approved is
unchanged. Only the surrounding evidence text is corrected.

## What the owner is being asked to decide

Re-admit the same source input against the corrected evidence bytes. Concretely, a fresh
`witness-tree/phase2-source-input-admission/1` record that:

1. carries a new `approve` decision for the same scope, in the owner's own words;
2. binds `data/boundary-editions.json` at
   `2ee846edbd8230109342b0077f01bae9def20acef40e70f8970868df51db777c`;
3. keeps `artifactSha256`, `editionId`, and `featureCount` identical to the existing record.

Nothing here asks for a new right, a new source, an ingestion, a release, or a production
admission. It asks the owner to confirm that an approval granted against a record containing a
false toolchain claim still stands against the same record with that claim corrected.

Until that record exists, this correction stays unmerged and `main` keeps the false claim. That is
the fail-closed outcome, and it is the correct one: a stale false claim is a defect, but silently
re-pointing an owner's approval at rewritten evidence is a worse one.
