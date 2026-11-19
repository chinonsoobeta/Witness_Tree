# Terrain view prototype

**Status: prototype. Not released, not an admitted source, not expert reviewed,
not production eligible.** It lives on the branch `prototype/terrain-view`, is
switched off unless a build sets `NEXT_PUBLIC_TERRAIN_PROTOTYPE=1`, and covers
one place. Nothing here is on `main` or on the public Site.

## What it is

A second map on one place page (Squamish, `csd-2021/5931006`): the land seen at
a tilt, at its true height, with the same detected-loss patches Explore draws
laid over it and the place's outline on top. A reader can turn the view, look
straight down, reset it, and switch the loss patches off to see the bare land.

It answers "what does this land look like, and where on it was forest lost?".
It does not show trees. The ground is a 30 m model of bare land; a loss patch
marks forest detected as lost at least once from 1984 to 2022, and some of that
has grown back.

## The elevation source, and what was verified

Read on 2026-11-19, from the publisher's own documents.

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

The prototype's caption carries the Open Government Licence statement, the
Copernicus notice and the liability sentence, in English and in French.

**Not verified, and not used.** The licence of the higher-resolution HRDEM
mosaic (1 m to 2 m lidar) was not confirmed. The prototype does not read it.

**Software.** MapLibre GL JS and `pmtiles` are already dependencies of the Site.
No dependency was added.

## How the data was built

`scripts/terrain_prototype/build_terrain_tiles.py` reads three windows of
`mrdem-30-dtm.tif` straight from the bucket (30 m for the core, 60 m and 120 m
for the land around it), and cuts 512-pixel Terrarium tiles (height rounded to a
quarter metre) for zooms 8 to 11. It writes `provenance.json` beside the tiles:
the remote files' size, ETag and date, a SHA-256 for each window, tile counts,
and the claims above, all false.

```bash
~/Witness_Tree-hmm-pilot/venv/bin/python -I scripts/terrain_prototype/build_terrain_tiles.py --out ~/Witness_Tree-terrain-prototype/squamish
```

```bash
pmtiles convert ~/Witness_Tree-terrain-prototype/squamish/terrain.mbtiles ~/Witness_Tree-terrain-prototype/squamish/squamish-dtm.pmtiles --force
```

Copy the archive to `public/prototype/terrain/squamish-dtm.pmtiles` (ignored by
git), then start the Site with `NEXT_PUBLIC_TERRAIN_PROTOTYPE=1` and open
`/en/places/1984-2022-v1/csd-2021/5931006`.

Measured on the build of 2026-11-19:

| | |
| --- | --- |
| Remote file read | `mrdem-30-dtm.tif`, 83,854,027,098 bytes, ETag `1bf055857edce86b1311967c8d88395e-9997` |
| Time | 91.5 s |
| Peak memory | 864 MB |
| Tiles | 116 (zoom 8: 20, zoom 9: 16, zoom 10: 16, zoom 11: 64) |
| Archive | 34,512,766 bytes, SHA-256 `a516e83913ed54bce32334b9eedc725759b68fee2643f4e2b8fc778f285fc171` |
| Heights in the core | −21.28 m to 2,853.22 m, no empty cells |
| Where the core's heights come from | about 54% adjusted Copernicus radar, 42% lidar (HRDEM), 3% a blend of the two |

## What was checked

On a local development server, in Chromium, on 2026-11-19:

- the view reaches its ready state in English and in French, with terrain,
  shading, loss patches and the outline;
- Turn left, Turn right, Look straight down, Tilt the view, Reset the view and
  Show forest loss each do what they say;
- at 375 px wide the frame fits, nothing scrolls sideways, and every control is
  44 px tall;
- no content-security-policy, tile or WebGL errors in the console;
- with the flag off, `terrainPrototype()` returns nothing, so the section is not
  rendered;
- `npm run lint`, `npm run typecheck`, `npm run check:bilingual`,
  `npm run check:premise-loss-vocabulary` and the 28 place-page unit tests pass.

Not checked: a production build, a real phone or touch device, Safari or
Firefox, a screen reader, keyboard-only use of the map itself, and print.

## Limits a reader would need to know

- **Land shape, not trees.** 30 m bare ground. Nothing in the view is a tree, a
  canopy height or a photograph.
- **One date of ground against 38 years of loss.** The radar heights were
  collected from 2011 to 2015 and the lidar's median year is 2018. The ground
  does not change through the record.
- **Accuracy varies by source.** Against lidar, the radar-derived ground has a
  root-mean-square error of 4.99 m under vegetation and 1.59 m in the open
  (specification, edition 1.2). About half of this view is radar-derived.
- **The model stops near the United States border.** Land beyond it is drawn
  flat at 0 m. Squamish is about 75 km north of it, and it can come into view
  when the camera looks south.
- **Some heights are slightly below zero** (lowest −21.28 m). Where they
  sit was not examined; they are drawn as they are.
- **Far land is coarser** (60 m, then 120 m).
- **The French wording is a draft** and has not been reviewed.
- **The frame keeps its light colours on the dark theme.**

## What a release would need

1. **The owner's approval of a new source.** Elevation is not in the approved
   plan's source list. This needs a source admission, a licence decision for the
   Copernicus conditions, and entries in the Site's source and third-party
   notices.
2. **A national or provincial archive, hosted with the others.** One place is
   34.5 MB at zoom 11. A province is a different size of job and needs its own
   measured run, bounded in memory like every other data job.
3. **A reviewed French text and an accessibility pass** (keyboard, screen
   reader, touch), which local tests do not close.
4. **A decision on where it belongs**: every place page, Explore, or neither.

## A step toward seeing the trees themselves

Not built. The same publisher's lidar products include surface models as well as
ground models; the difference between the two is canopy height. That would show
where tall forest stood on the day of the flight, at 1 m to 2 m, for the areas
lidar covers. Its licence and coverage have not been verified.
