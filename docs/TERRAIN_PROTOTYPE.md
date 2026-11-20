# Terrain view prototype

**Status: prototype. Not released, not an admitted source, not expert reviewed,
not production eligible.** It lives on the branch `prototype/terrain-view`, is
switched off unless a build sets `NEXT_PUBLIC_TERRAIN_PROTOTYPE=1`, and covers
one place. Nothing here is on `main` or on the public Site.

## What it is

A second map on one place page (Squamish, `csd-2021/5931006`): the land seen at
a tilt, at its true height, with the same detected-loss patches Explore draws
laid over it and the place's outline on top.

It has two levels of detail.

- **The whole place.** A 30 m model of bare ground. It answers "what does this
  land look like, and where on it was forest lost?".
- **The close-up area.** A box about 6.3 km by 7.9 km over the middle of
  Squamish (downtown, the estuary, the mouth of the Squamish River and the
  Stawamus Chief), marked with a dashed line. Inside it the land is a 1 m laser
  survey, either the top of whatever stands there (treetops and roofs) or the
  bare ground beneath, with the District of Squamish's 2024 air photo laid over
  it at about 19 cm for each pixel. A reader can pick out single trees, roofs
  and vehicles.

A reader can go to the close-up, return to the whole place, zoom, turn, tilt or
look straight down, choose between treetops and bare ground, and switch three
things on or off: the air photo, the loss patches, and a colouring of height
above ground in five classes.

## How close this gets to street level

The owner asked for the detail of a street-level photo service. That is
photographs taken from the ground, and no free source has them for forest land.
This prototype is the nearest free equivalent, and it is a view from above:

| | Whole place (first build) | Close-up area (this build) |
| --- | --- | --- |
| Shape of the land | 30 m | 1 m survey, stored at about 0.77 m, drawn as a mesh of about 1.5 m at zoom 18 and 0.77 m at zoom 19 |
| Picture on the land | none | air photo, about 19 cm for each pixel |
| What stands on the land | not shown | treetops and roofs, and their height above ground |

What it cannot do: look under the canopy, show a trunk or the side of a
building, or show anything as it would look to a person standing there. The
photo was taken from above, so on a steep face (a cliff, the side of a tree) it
is stretched.

## The sources, and what was verified

Read on 2026-11-19, from each publisher's own documents.

### Far ground: MRDEM-30

| Item | Finding |
| --- | --- |
| Product | Medium Resolution Digital Elevation Model (MRDEM-30), CanElevation Series, digital terrain model. Natural Resources Canada. |
| Record | https://open.canada.ca/data/en/dataset/18752265-bda3-498c-a4ba-9dfe68cb98da |
| Specification | Product Specifications, edition 1.2, 2025-06-20 |
| Licence | Open Government Licence – Canada, version 2.0 (specification section 11.3) |
| Access | Public bucket `canelevation-dem` (ca-central-1), no account. The specification recommends reading the cloud-optimised files in place over downloading them. |
| Grid | 30 m, EPSG:3979, heights in metres above CGVD2013 |

**What the Open Government Licence – Canada allows.** A "worldwide,
royalty-free, perpetual, non-exclusive licence to use the Information, including
for commercial purposes", with an attribution statement. It gives no warranty,
and it does not cover third-party rights the provider cannot license.

**The third-party part.** The specification's legal notice says the product
"was in part produced using Copernicus WorldDEM-30". The Copernicus WorldDEM-30
licence (COP-DEM-GLO-30-F) allows reproduction, distribution, communication to
the public and adaptation, free of charge, on these conditions:

- article 6(b): adapted data shown to the public carries the notice "produced
  using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and
  Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA;
  all rights reserved";
- article 6(c): with the sentence "The organisations in charge of the Copernicus
  programme by law or by delegation do not incur any liability for any use of
  the Copernicus WorldDEM-30";
- article 6(d): no impression that those organisations endorse the user.

### Close-up shape: HRDEM Mosaic, 1 m

| Item | Finding |
| --- | --- |
| Product | High Resolution Digital Elevation Model Mosaic (HRDEM Mosaic), CanElevation Series, 1 m: the digital surface model (treetops and roofs) and the digital terrain model (bare ground). Natural Resources Canada. |
| Record | https://open.canada.ca/data/en/dataset/0fe65119-e96e-4a57-8bfe-9d9245fba06b |
| Specifications | HRDEM Mosaic Product Specifications, edition 1.1, 2022-11-15; HRDEM Product Specifications, edition 1.7, 2026-05-19 |
| Licence | Open Government Licence – Canada. Mosaic specification section 11.3: "Information regarding the use of the data is defined in the Open Government Licence - Canada". The publisher's catalogue lists the collection `hrdem-mosaic-1m` as `OGL-Canada-2.0`. |
| Access | Same public bucket, no account. Files `hrdem-mosaic-1m/2_4-mosaic-1m-dsm.tif` and `2_4-mosaic-1m-dtm.tif`. |
| Grid | 1 m, EPSG:3979, lidar only |
| Copies of the two specifications | Kept beside the build output, with a SHA-256 for each |

**The flight year is not established.** The catalogue dates this piece of the
mosaic 2025-10-16, which is when the mosaic was assembled, not when the land was
flown. The publisher's by-project files over this area (2016, 2017 and 2018
projects) match the mosaic cell for cell on only 2% to 4% of cells, so none of
them can be named as its origin. The survey is older than the 2024 photo by an
unknown number of years.

**Coverage.** Lidar covers part of the land only. Inside the close-up area 18%
of the finest pixels have no survey: the sea, and land no flight covered. Those
are filled from the 30 m ground model, in both the surface and the ground
archive.

### Close-up picture: District of Squamish, Aerial Photo 2024

| Item | Finding |
| --- | --- |
| Product | "Aerial Photo 2024", described by the publisher as "Squamish composite orthophoto 7.5cm & 15cm flown spring/summer, 2024". District of Squamish. |
| Record | The District's open data portal, https://data.squamish.ca/, item `e86a2b42f49046918c0c0c1d13f000a2`, category "Open Data", public |
| Licence on the record | "This data set is published under the terms of the Open Government Licence - Squamish." |
| Licence text | Open Government Licence – Squamish, version 2.0, read at https://squamish.ca/government-and-administration/maps-and-data/open-data/. It grants a "worldwide, royalty-free, perpetual, non-exclusive licence to use the Information, including for commercial purposes", asks for the statement "Contains information licensed under the Open Government Licence - Squamish.", gives no warranty, forbids implying endorsement, and does not cover personal information or third-party rights. |
| Access | The District's public image service, no account: `https://portal.squamish.ca/server/rest/services/Orthophoto_2024/ImageServer` |
| Grid | 7.5 cm pixels in EPSG:3857 |

The service was read politely: 80 requests of 4,096 by 4,096 pixels, one at a
time, a second apart, each kept on disk so no block is asked for twice.

**The photo shows people's property.** At this detail houses, yards and
vehicles are visible, as they are on the District's own public map. The licence
does not cover personal information. Whether to publish this picture on the
Site is the owner's decision, not a technical one.

### What the caption carries

The Open Government Licence – Canada statement, the Copernicus notice and
liability sentence, and the Open Government Licence – Squamish statement, in
English and in French, beside the existing boundary and forest attributions.

The Copernicus notice keeps its two hyphenated year ranges, because the licence
gives the wording to show. The Site's year-range gate
(`scripts/check-year-range-format.mjs`) therefore lists it among the quotations
held as written. That entry exists for this prototype only and should be
reviewed with the source.

### Software

MapLibre GL JS and `pmtiles` are already dependencies of the Site. No dependency
was added. The build scripts use GDAL from the Python environment already kept
for data work.

## How the data was built

Two scripts, run in this order. Each writes a provenance record beside its
output: the remote files' size, ETag and date, a SHA-256 for every input and
output, tile counts, the script's own SHA-256, and the claims above, all false.

**1. The far ground** (`build_terrain_tiles.py`). Reads three windows of
`mrdem-30-dtm.tif` straight from the bucket (30 m for the core, 60 m and 120 m
for the land around it), and cuts 512-pixel Terrarium tiles (height rounded to
a quarter metre) for zooms 8 to 11.

```bash
~/Witness_Tree-hmm-pilot/venv/bin/python -I scripts/terrain_prototype/build_terrain_tiles.py --out ~/Witness_Tree-terrain-prototype/squamish
```

**2. The close-up area** (`build_close_tiles.py`). Four steps, each of which can
be run alone with `--step`:

- `fetch-photo` downloads the air photo blocks and a mask of where each has a
  picture;
- `elevation` reads a 1 m window of the surface model and of the ground model,
  copies the far tiles, and cuts zooms 12 to 16 for the close-up area (height
  rounded to a sixteenth of a metre), filling survey gaps from the 30 m window;
- `photo` cuts the blocks into 256-pixel WebP tiles for zooms 12 to 19;
- `height` subtracts ground from surface and cuts classed, paletted PNG tiles
  for zooms 12 to 17.

```bash
~/Witness_Tree-hmm-pilot/venv/bin/python -I scripts/terrain_prototype/build_close_tiles.py --out ~/Witness_Tree-terrain-prototype/squamish-close --far ~/Witness_Tree-terrain-prototype/squamish --step all
```

Then one `pmtiles convert` for each of the five archives, into
`public/prototype/terrain/` (ignored by git):

```bash
pmtiles convert ~/Witness_Tree-terrain-prototype/squamish/terrain.mbtiles public/prototype/terrain/squamish-dtm.pmtiles --force
```

```bash
pmtiles convert ~/Witness_Tree-terrain-prototype/squamish-close/surface.mbtiles public/prototype/terrain/squamish-surface.pmtiles --force
```

```bash
pmtiles convert ~/Witness_Tree-terrain-prototype/squamish-close/ground.mbtiles public/prototype/terrain/squamish-ground.pmtiles --force
```

```bash
pmtiles convert ~/Witness_Tree-terrain-prototype/squamish-close/photo.mbtiles public/prototype/terrain/squamish-photo-2024.pmtiles --force
```

```bash
pmtiles convert ~/Witness_Tree-terrain-prototype/squamish-close/height.mbtiles public/prototype/terrain/squamish-height.pmtiles --force
```

Build the Site with `NEXT_PUBLIC_TERRAIN_PROTOTYPE=1`, start it, and open
`/en/places/1984-2022-v1/csd-2021/5931006`. A running production server lists
the public files once, at start, so restart it after adding an archive.

### Measured on the builds of 2026-11-19

Far ground:

| | |
| --- | --- |
| Remote file read | `mrdem-30-dtm.tif`, 83,854,027,098 bytes, ETag `1bf055857edce86b1311967c8d88395e-9997` |
| Time, peak memory | 91.5 s, 864 MB |
| Tiles | 116 (zoom 8: 20, zoom 9: 16, zoom 10: 16, zoom 11: 64) |
| Archive | 34,512,766 bytes |
| Heights in the core | −21.28 m to 2,853.22 m, no empty cells |
| Where the core's heights come from | about 54% adjusted Copernicus radar, 42% lidar (HRDEM), 3% a blend of the two |

Close-up area:

| | |
| --- | --- |
| Area | Zoom 14 tiles x 2585 to 2588, y 5575 to 5579: longitude −123.200684 to −123.112793, latitude 49.667628 to 49.738682 |
| Remote surface file | `2_4-mosaic-1m-dsm.tif`, 159,701,620,349 bytes, ETag `ac37832e3b7f5637ce813fe702c27a77-595` |
| Remote ground file | `2_4-mosaic-1m-dtm.tif`, 152,736,011,515 bytes, ETag `3d6982efcf1c8c28b111e8128e67796d-569` |
| Windows kept on disk | surface 193.6 MB, ground 174.6 MB |
| Elevation step | 90.1 s |
| Elevation tiles added, each archive | 433 (zoom 12: 4, zoom 13: 9, zoom 14: 20, zoom 15: 80, zoom 16: 320) on top of the 116 far tiles |
| Surface heights | −2.15 m to 1,355.39 m |
| Ground heights | −30.4 m to 1,352.85 m |
| Finest pixels with no survey | surface 15,055,053 and ground 15,065,640, of 83,886,080 (18%) |
| Photo download | 80 blocks, 16 minutes |
| Photo step | 41.0 s |
| Photo tiles | 27,070 (zoom 19: 20,293), 99% of the area has a picture, 0.193 m for each pixel at zoom 19 |
| Height step | 15.7 s |
| All steps in one run, photo blocks already on disk | 148 s with six worker processes. The largest single process held 1.1 GB; swap stayed at zero. |
| Height tiles | 1,454 (zoom 17: 1,063) |

Archives in `public/prototype/terrain/`:

| Archive | Bytes |
| --- | --- |
| `squamish-dtm.pmtiles` | 34,512,766 |
| `squamish-surface.pmtiles` | 121,534,248 |
| `squamish-ground.pmtiles` | 86,800,135 |
| `squamish-photo-2024.pmtiles` | 403,384,999 |
| `squamish-height.pmtiles` | 7,707,533 |
| Total | 653,939,681 |

Height above ground at the finest zoom, as a share of the pixels that have a
survey, rounded: under 2 m 36%, 2 to 10 m 17%, 10 to 20 m 17%, 20 to 30 m 19%,
30 to 40 m 8%, 40 m or more 2%.

## What was checked

On a production build with the flag on, served locally, in Chromium, on
2026-11-19:

- the flagged production build completes, and the view reaches its ready state
  in English and in French;
- all five archives are served with range requests (the largest is 403 MB);
- Go to the close-up, Whole place, Zoom in, Zoom out, Turn left, Turn right,
  Look straight down and Tilt the view each do what they say;
- Treetops and roofs and Bare ground swap the shape of the land; Air photo,
  Height above ground and Forest loss each switch their layer, and the height
  key appears with the height colouring and reads the same classes the tiles
  were built with;
- at the closest zoom, looking straight down, parked vehicles and single trees
  can be told apart;
- zoomed in outside the close-up area the land keeps its true height (the
  30 m model is used where the finer archive has no tile) and its shading, and
  the view stays in its ready state;
- at 375 px wide the frame fits, nothing scrolls sideways, and every control is
  44 px tall;
- the console shows no content-security-policy, tile or WebGL errors. MapLibre
  logs one advisory, that the surface and its shading share a source; that is
  deliberate, for the reason given at the top of `PlaceTerrain.tsx`;
- no middle dot separates pieces of text anywhere in the view;
- with the flag off, `terrainPrototype()` returns nothing, so the section is not
  rendered;
- `npm run lint`, `npm run typecheck`, `npm run check:bilingual`,
  `npm run check:premise-loss-vocabulary` and the 39 place-page unit tests pass.

Not checked: a real phone or touch device, Safari or Firefox, a slow
connection, a screen reader, keyboard-only use of the map itself, and print.

## Limits a reader would need to know

- **A view from above, not from the ground.** See "How close this gets to
  street level".
- **The close-up covers one box.** About 50 square kilometres of one place.
  Everything else is still the 30 m ground with no picture.
- **The survey and the photo are different years.** The photo is 2024. The
  survey's year is not established and it is older. A tree in the photo may
  stand where the surface is bare, and the reverse.
- **Treetops look melted.** The photo is draped over a surface with a point
  every metre or so. A single tree becomes a cone and a forest edge a wall.
  "Bare ground" gives the cleanest picture; "Treetops and roofs" gives the
  truest shape.
- **Height above ground is trees and buildings alike.** The colouring does not
  tell a tree from a roof, and it is not a forest map.
- **18% of the box has no survey.** There the ground is the 30 m model, so the
  treetop surface and the height colouring stop at a visible edge.
- **The photo is stored at about 19 cm, not the 7.5 cm it is published at.**
  That choice keeps the archive near 400 MB; at 7.5 cm it would be several
  times larger.
- **Loss patches are still 30 m cells.** They stay blocky however far in the
  reader goes, and at this detail a patch can sit on a roof or a road. A patch
  marks forest detected as lost at least once from 1984 to 2022, and some of it
  has grown back.
- **One date of ground against 38 years of loss.** The ground does not change
  through the record.
- **Accuracy of the far ground varies by source.** Against lidar, the
  radar-derived ground has a root-mean-square error of 4.99 m under vegetation
  and 1.59 m in the open (MRDEM specification, edition 1.2). About half of the
  far view is radar-derived.
- **The far model stops near the United States border.** Land beyond it is
  drawn flat at 0 m.
- **Some heights are below zero** (lowest −30.4 m in the 1 m ground, −21.28 m in
  the 30 m ground). Where they sit was not examined; they are drawn as they
  are.
- **The French wording is a draft** and has not been reviewed.
- **The frame keeps its light colours on the dark theme.**

## What a release would need

1. **The owner's approval of three new sources.** Elevation and air photos are
   not in the approved plan's source list. Each needs a source admission, a
   licence decision (the Copernicus conditions; the Open Government Licence –
   Squamish and its personal-information exemption), and entries in the Site's
   source and third-party notices.
2. **A decision on showing homes and vehicles** at this detail.
3. **An established survey year,** or wording a reviewer accepts without one.
4. **Hosting for large archives.** One box of one place is about 650 MB, most
   of it the photo. Air photos this fine exist only where a municipality
   publishes them, so most places could have the 1 m shape and height but no
   picture. A province is a different size of job and needs its own measured
   run, bounded in memory like every other data job.
5. **A reviewed French text and an accessibility pass** (keyboard, screen
   reader, touch), which local tests do not close.
6. **A decision on where it belongs**: every place page, Explore, or neither.
