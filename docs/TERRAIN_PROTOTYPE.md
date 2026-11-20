# Terrain view prototype

**Status: prototype. Not released, not an admitted source, not expert reviewed,
not production eligible.** It lives on the branch `prototype/terrain-view`, is
switched off unless a build sets `NEXT_PUBLIC_TERRAIN_PROTOTYPE=1`, and covers
one place. Nothing here is on `main` or on the public Site.

## What it is

A second map on one place page (Squamish, `csd-2021/5931006`): the land seen at
a tilt, at its true height, with the same detected-loss patches Explore draws
laid over it and the place's outline on top.

It has two levels of detail seen from above, and photographs taken on the
ground.

- **The whole place.** A 30 m model of bare ground. It answers "what does this
  land look like, and where on it was forest lost?".
- **The close-up area.** A box about 6.3 km by 7.9 km over the middle of
  Squamish (downtown, the estuary, the mouth of the Squamish River and the
  Stawamus Chief), marked with a dashed line. Inside it the land is a 1 m laser
  survey, either the top of whatever stands there (treetops and roofs) or the
  bare ground beneath, with the District of Squamish's 2024 air photo laid over
  it at about 10 cm for each pixel, and at about 5 cm in a core of about
  15 square kilometres. The photo is published as a 7.5 cm photo, so the core
  holds all the detail it has. A reader can pick out single trees, road markings, garden
  beds and the lines of a parking space.
- **Photos from the ground.** Dots on the map mark photographs that volunteers
  took at ground level and gave to two open archives. Choosing a dot opens the
  photo under the map. Nine of them are all-round photos a reader can look
  around in; the rest are single frames from drives along roads.
- **A way out to Google Street View.** A link under the map opens Google's own
  street-level photos at the middle of the map, facing the way the map faces.
  It leaves the Site. Nothing of Google's is shown, copied or kept here.

A reader can go to the close-up, return to the whole place, zoom, turn, tilt or
look straight down, choose between treetops and bare ground, and switch four
things on or off: the air photo, the loss patches, the ground-level photo dots,
and a colouring of height above ground in five classes.

## How close this gets to street level

The owner asked for detail as high as Google Street View. Street View is
photographs taken from the ground, a few metres apart, along almost every road.
Three free things get part of the way, and none gets all of it.

| | Whole place | Close-up area | Photos from the ground |
| --- | --- | --- | --- |
| Shape of the land | 30 m | 1 m survey, stored at about 0.77 m | not a shape: a photograph |
| Picture | none | air photo, about 10 cm for each pixel, about 5 cm in the core | the photographer's own picture: 11,904 pixels around for an all-round photo, up to 2,048 across for a road photo |
| Seen from | above | above | a person's or a car's height |
| Where | the whole place | one box of about 50 square kilometres | 101 photos so far: 9 at one spot under the trees, 92 along roads |

**1. The air photo at all the detail it has.** The District publishes the photo
at 7.5 cm for each pixel. The first build stored it at about 19 cm. This build
stores it at about 10 cm over the whole close-up area and at about 5 cm over
the core. That is the grid the District's own service keeps the photo on, so
nothing the photo holds is lost there. A measured comparison at six spots
(downtown, the Stawamus Chief, the estuary, and the north, west and south of
the box) found that each finer level adds picture the coarser one lacks. There is no finer free picture from
above: this is the limit of the source, not of the build.

**2. Real photographs from the ground, where volunteers took them.** Two open
archives hold street-level photos anyone may reuse with credit. Inside the
close-up area they hold:

- **Panoramax:** 9 all-round photos, 11,904 by 5,952 pixels each, taken on
  2026-06-25 by one contributor within about 25 m of each other, under the
  trees beside a creek. They show a forest from inside it.
- **KartaView:** 9,234 single photos from 32 drives along roads, taken from
  2016 to 2022. Thinned so that no two stand within 40 m, 453 remain. The
  archive's photo store stopped answering during the download, so 92 of the
  453 are in this build, all from 2016 and 2017. The script picks up the other
  361 when it is run again.

These are the same kind of thing as Street View, and the nine all-round photos
are close to it in sharpness: 11,904 pixels around, against 16,384 for the one
Google panorama checked in Squamish, dated April 2023. The road photos are
single frames, kept here at up to 2,048 pixels across, and are less sharp. They are not the same in reach. Google drove nearly
every road in Squamish; the volunteers covered some roads once, between 2016
and 2022, and one spot off the road. Nothing between the dots is filled in.

**3. Google's own Street View, by a link.** Google documents a web address that
opens Street View at a place and a compass direction, with no account and no
key. The view builds that address from the middle of the map and the way it
faces. This is the only free way to reach Google's photos: they are Google's,
and their terms do not allow copying them into another site. An embedded frame
would need the owner to accept Google's terms and to loosen the Site's content
security policy, so the prototype links out instead. See "What a release would
need".

What the prototype still cannot do: show a forest from inside it, away from
that one spot; show any place as it looks today; or match Street View's reach
along roads. The air photo was taken from above, so on a steep face (a cliff,
the side of a tree) it is stretched.

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

The service was read politely: 686 requests of 4,096 by 4,096 pixels (80 for
the first build, 606 for the finer levels), one at a time, a second apart, each
kept on disk so no block is asked for twice. The service's own record gives the
pixel size as 0.075 in EPSG:3857 units; at Squamish's latitude that is about
5 cm on the ground, which is why zoom 21 (about 4.8 cm) is the level that holds
everything.

**The photo shows people's property.** At this detail houses, yards and
vehicles are visible, as they are on the District's own public map. The licence
does not cover personal information. Whether to publish this picture on the
Site is the owner's decision, not a technical one.

### Ground-level photos: Panoramax

| Item | Finding |
| --- | --- |
| Archive | Panoramax, an open archive of street-level photos run by a community with French public bodies. Read through its shared search, `https://api.panoramax.xyz/api/search`, no account. |
| Licence | Each record carries its own licence. Only records marked `CC-BY-SA-4.0` were taken. |
| What it asks | Credit to the photographer, a link to the licence, a note of changes, and the same licence on anything made from the photo. |
| Found in the close-up area | 11 records. 9 are all-round photos by the contributor "49PL", taken on 2026-06-25, 11,904 by 5,952 pixels, 35 to 50 MB each. The files of the other 2 answered "not found" and are left out. |
| Kept | The original file of each photo, unchanged, with a SHA-256, beside the build output. The Site's copies are the same picture made smaller (4,096 and 8,192 pixels around) and the original itself. |

The archive blurs faces and number plates before it publishes a photo. Two
people are in view in these photos, with their faces blurred.

### Ground-level photos: KartaView

| Item | Finding |
| --- | --- |
| Archive | KartaView, street-level photos given by volunteers, run by Grab. Read through `https://api.kartaview.org/2.0/photo/`, no account. |
| Licence | Terms of use, section 4, read at https://kartaview.org/terms on 2026-11-19: the street images are licensed under "Creative Commons Attribution-ShareAlike 4.0 International". |
| Credit the terms ask for | "© Grab and KartaView Contributors". A record carries no photographer's name. |
| Found in the close-up area | 76,941 photos across the 32 drives that pass through it; 9,234 of them inside the box; 8,261 of those usable; 453 kept after thinning; 92 fetched so far. |
| Which were kept | Only photos the archive marks as blurred, active, public and flat. Then, newest first, a photo was kept only if no kept photo stood within 40 m of it, so each stretch of road is shown once. |
| Kept | The archive's own blurred file for each, unchanged, with a SHA-256, beside the build output. The Site's copy is the same picture at up to 2,048 pixels across. |

The search by place answers with a sample of each drive, so the script reads
every drive it names in full and keeps only what lies inside the box. Each
answer is kept on disk as it arrives, so a second run asks nothing twice.

**Compass directions are rough.** The recorded heading of a KartaView photo is
often wrong, so the view does not use it. **Dates are old.** The newest road
photo is from 2022.

**Share-alike is a real condition.** Both archives use CC BY-SA 4.0. The Site
shows the photos resized and otherwise unchanged, with credit and the licence
beside each one. Whether showing them obliges anything else the Site publishes
is a licence question for the owner and has not been answered.

### Google Street View: a link, not a source

Google documents the address `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=<latitude>,<longitude>&heading=<degrees>`
(Maps URLs). It needs no account or key and costs nothing. Followed in a
browser on 2026-11-19, it opened Google's Street View at the spot asked for.
The view writes this address into an ordinary link. No Google picture, script
or frame is loaded by the Site, and the content security policy is unchanged.
Where Google has no photo near the spot, Google shows its map instead.

### Checked and not used

- **Mapillary.** The largest open archive of street-level photos. Reading it
  needs an account and an access token, which is the owner's to create. Likely
  the best next step: see "What a release would need".
- **Wikimedia Commons.** 123 photos carry a position inside the close-up area,
  but they are of mixed subjects (people at a table, vehicles, climbers), not a
  record of the land, and each has its own licence and author. Not taken.
- **Google's photos themselves.** Not free to copy or store. Reached by the
  link above only.
- **An embedded Street View frame.** Possible only with Google's terms accepted
  and the Site's content security policy loosened to allow Google's frame.
  Both are the owner's decisions.

### What the caption carries

The Open Government Licence – Canada statement, the Copernicus notice and
liability sentence, the Open Government Licence – Squamish statement, and the
credit for the ground-level photos (Panoramax contributors, each named with
their photo, and "© Grab and KartaView Contributors", under CC BY-SA 4.0), in
English and in French, beside the existing boundary and forest attributions.
Each opened photo also shows its date, its photographer or the archive's
credit, the archive and the licence.

The Copernicus notice keeps its two hyphenated year ranges, because the licence
gives the wording to show. The Site's year-range gate
(`scripts/check-year-range-format.mjs`) therefore lists it among the quotations
held as written. That entry exists for this prototype only and should be
reviewed with the source.

### Software

MapLibre GL JS and `pmtiles` are already dependencies of the Site. No dependency
was added. The all-round photos are drawn by about thirty lines of shader code
in `components/places/GroundPhoto.tsx`, not by a viewer library. The build
scripts use GDAL from the Python environment already kept for data work.

## How the data was built

Three scripts, run in this order. Each writes a provenance record beside its
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

- `fetch-photo` downloads the air photo in blocks of 4,096 pixels, and a mask
  of where each has a picture: one block for each zoom-15 tile, then finer
  blocks, zoom 16 over the close-up area and zoom 17 over its core, skipping
  any the photo does not reach;
- `elevation` reads a 1 m window of the surface model and of the ground model,
  copies the far tiles, and cuts zooms 12 to 16 for the close-up area (height
  rounded to a sixteenth of a metre), filling survey gaps from the 30 m window;
- `photo` cuts the blocks into 256-pixel WebP tiles: zooms 12 to 20 in one
  set, and zoom 21 over the core in a set of its own, because a map draws
  nothing where a set has no tile and cannot fall back to a coarser one;
- `height` subtracts ground from surface and cuts classed, paletted PNG tiles
  for zooms 12 to 17.

```bash
~/Witness_Tree-hmm-pilot/venv/bin/python -I scripts/terrain_prototype/build_close_tiles.py --out ~/Witness_Tree-terrain-prototype/squamish-close --far ~/Witness_Tree-terrain-prototype/squamish --step all
```

Then one `pmtiles convert` for each of the six archives, into
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
pmtiles convert ~/Witness_Tree-terrain-prototype/squamish-close/photo-core.mbtiles public/prototype/terrain/squamish-photo-2024-core.pmtiles --force
```

```bash
pmtiles convert ~/Witness_Tree-terrain-prototype/squamish-close/height.mbtiles public/prototype/terrain/squamish-height.pmtiles --force
```

**3. The ground-level photos** (`fetch_ground_photos.py`). Searches the two
archives inside the close-up area, keeps each original with its SHA-256,
writes the Site's smaller copies and an `index.json` listing each photo's
position, date, credit, licence and files into
`public/prototype/terrain/ground/` (ignored by git), and records every count.
`--count-only` searches and counts without downloading a photo.

```bash
~/Witness_Tree-hmm-pilot/venv/bin/python -I scripts/terrain_prototype/fetch_ground_photos.py --work ~/Witness_Tree-terrain-prototype/street-level --publish public/prototype/terrain/ground
```

Build the Site with `NEXT_PUBLIC_TERRAIN_PROTOTYPE=1`, start it, and open
`/en/places/1984-2022-v1/csd-2021/5931006`. A running production server lists
the public files once, at start, so restart it after adding an archive or a
photo. If a rebuilt page lacks a style that the stylesheet has, the build cache
is stale: delete `.next/cache/turbopack` and build again. That happened once
here, on 2026-11-20.

### Measured on the builds of 2026-11-19 and 2026-11-20

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
| Photo download | 80 blocks in 16 minutes for the first build; 606 finer blocks (384 at zoom 17, 222 at zoom 16) at about 5 to 10 seconds each for this one. 4.1 GB on disk. |
| Photo step | 259.9 s with six worker processes; swap stayed at zero |
| Photo tiles | 206,500: zooms 12 to 19, 27,070; zoom 20, 81,126; zoom 21 (core only), 98,304. 99% of the area has a picture. |
| Ground size of one photo pixel | 0.193 m at zoom 19, 0.097 m at zoom 20, 0.048 m at zoom 21 |
| Core at zoom 21 | Zoom 14 tiles x 2586 to 2587, y 5576 to 5578: longitude −123.178711 to −123.134766, latitude 49.681847 to 49.724479, about 15 square kilometres |
| Height step | 15.7 s |
| All steps in one run, photo blocks already on disk | 148 s with six worker processes. The largest single process held 1.1 GB; swap stayed at zero. |
| Height tiles | 1,454 (zoom 17: 1,063) |

Archives in `public/prototype/terrain/`:

| Archive | Bytes |
| --- | --- |
| `squamish-dtm.pmtiles` | 34,512,766 |
| `squamish-surface.pmtiles` | 121,534,248 |
| `squamish-ground.pmtiles` | 86,800,135 |
| `squamish-photo-2024.pmtiles` | 1,341,898,966 |
| `squamish-photo-2024-core.pmtiles` | 539,529,169 |
| `squamish-height.pmtiles` | 7,707,533 |
| Total | 2,131,982,817 |

Ground-level photos in `public/prototype/terrain/ground/`:

| | |
| --- | --- |
| Photos in the index | 101: 9 all-round (Panoramax), 92 single (KartaView) |
| Files | 119 pictures and `index.json`, 529,734,215 bytes. The nine originals are about 400 MB of that. |
| KartaView search | 513 requests for lists, about 25 minutes, answers kept on disk |
| KartaView photos not fetched | 361 of 453. All ten of the archive's photo-store hosts stopped answering this machine partway through, on 2026-11-20, while its search and website kept answering. The script stops asking after five photos in a row fail. |
| Panoramax files not fetched | 2, "not found" |

Height above ground at the finest zoom, as a share of the pixels that have a
survey, rounded: under 2 m 36%, 2 to 10 m 17%, 10 to 20 m 17%, 20 to 30 m 19%,
30 to 40 m 8%, 40 m or more 2%.

## What was checked

On a production build with the flag on, served locally, in Chromium, on
2026-11-19 and 2026-11-20:

- the flagged production build completes, and the view reaches its ready state
  in English and in French;
- all six archives are served with range requests (the largest is 1.34 GB);
- Go to the close-up, Whole place, Zoom in, Zoom out, Turn left, Turn right,
  Look straight down and Tilt the view each do what they say;
- Treetops and roofs and Bare ground swap the shape of the land; Air photo,
  Height above ground, Forest loss and Ground-level photos each switch their
  layer, and the height key appears with the height colouring and reads the
  same classes the tiles were built with;
- looking straight down inside the core, at the closest zoom, the zoom-21 tiles
  are requested and drawn: the lines of parking spaces, a utility pole and its
  wires, and single clumps of grass can be told apart. The camera stops at zoom
  20, where those tiles are drawn one pixel for one pixel; closer would only
  enlarge them;
- the ground-level dots are drawn where the photos were taken; "See photos from
  the ground" opens the first photo and moves the map to it;
- an all-round photo loads a 4,096-pixel copy first and then the 11,904-pixel
  original; dragging it turns the view, and Look left, right, up, down, closer
  and wider each do what they say; at its closest, bark and the litter on the
  ground are sharp;
- a single road photo opens as an ordinary picture with only Previous, Next and
  Close; Previous from the first photo goes to the last;
- each opened photo shows its place in the list, its date, its credit, its
  archive and its licence, in both languages;
- the Street View link follows the map: after "Go to the close-up" it reads
  `viewpoint=49.691500%2C-123.148500&heading=140`. Followed by hand on
  2026-11-19, an address of this form opened Google's Street View at the spot;
- zoomed in outside the close-up area the land keeps its true height (the
  30 m model is used where the finer archive has no tile) and its shading, and
  the view stays in its ready state;
- at 375 px wide the frame fits, nothing scrolls sideways, every control and
  the Street View link is 44 px tall, and an all-round photo loads only its
  4,096-pixel copy;
- no request on the page fails, and the console shows no
  content-security-policy, tile or WebGL errors. MapLibre logs one advisory,
  that the surface and its shading share a source; that is deliberate, for the
  reason given at the top of `PlaceTerrain.tsx`;
- no middle dot separates pieces of text anywhere in the view;
- with the flag off, `terrainPrototype()` returns nothing, so the section is not
  rendered;
- `npm run lint`, `npm run typecheck`, the twelve static gates the change can
  touch (claims, style tokens, hex literals, year-range format, brand token,
  persistent identifiers, contrast, bilingual, loss vocabulary, CI coverage,
  source review, accessibility) and 63 place-page and gate unit tests pass.

Not checked: a real phone or touch device (dragging a photo with a finger),
Safari or Firefox, a slow connection, a screen reader, keyboard-only use of the
map itself, a device whose graphics memory cannot hold an 11,904-pixel
picture, and print.

## Limits a reader would need to know

- **It does not reach Street View.** From above, the picture stops at the air
  photo's own 7.5 cm. From the ground, there are photos at 101 spots, against
  Google's coverage of nearly every road. See "How close this gets to street
  level".
- **Ground-level photos are sparse, old and uneven.** One spot under the trees
  from 2026; road photos from 2016 and 2017 in this build. A road photo may
  show a place that has since changed. 361 more road photos are listed and not
  yet fetched.
- **Ground-level photos show people, vehicles and homes.** The archives blur
  faces and number plates by machine, which can miss some. Two people are in
  view in the all-round photos.
- **An all-round photo is large.** The original is 35 to 50 MB and is loaded
  whole on a wide screen, after a 3 MB copy.
- **The Street View link is only a link.** What it opens is Google's, on
  Google's terms, and is not checked by this Site. Away from roads Google may
  have nothing near and show its map instead.
- **The close-up covers one box.** About 50 square kilometres of one place, and
  the finest photo level a core of about 15. Everything else is still the 30 m
  ground with no picture. The District's photo reaches well beyond the box
  (its service spans about 20 km by 30 km), so the box could be widened.
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
- **The finest photo level covers the core only.** Outside it the photo is
  stored at about 10 cm, a little coarser than the 7.5 cm it is published at.
  The two photo archives are 1.9 GB together.
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

1. **The owner's approval of five new sources.** Elevation, air photos and
   ground-level photos are not in the approved plan's source list. Each needs a
   source admission, a licence decision (the Copernicus conditions; the Open
   Government Licence – Squamish and its personal-information exemption; the
   share-alike condition of CC BY-SA 4.0 for both photo archives), and entries
   in the Site's source and third-party notices.
2. **A decision on showing homes, vehicles and people** at this detail, from
   above and from the ground.
3. **A decision on Google.** The link out needs none of Google's terms accepted
   by the Site, but it sends a reader to Google. An embedded Street View frame
   would put it on the page, and needs Google's terms accepted and the content
   security policy loosened.
4. **A Mapillary access token, if more ground-level photos are wanted.**
   Mapillary is the largest open archive and needs a free account, which is the
   owner's to create. Its photos are CC BY-SA 4.0, like the two used here.
5. **An established survey year,** or wording a reviewer accepts without one.
6. **Hosting for large archives.** One box of one place is about 2.1 GB of
   archives and 0.5 GB of ground-level photos. Air photos this fine exist only
   where a municipality publishes them, so most places could have the 1 m shape
   and height but no picture. A province is a different size of job and needs
   its own measured run, bounded in memory like every other data job.
7. **A reviewed French text and an accessibility pass** (keyboard, screen
   reader, touch), which local tests do not close.
8. **A decision on where it belongs**: every place page, Explore, or neither.
