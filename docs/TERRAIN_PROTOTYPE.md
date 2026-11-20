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
- **The close-up area.** Everywhere the District of Squamish's 2024 air photo
  reaches: 145 zoom-14 map tiles, about 360 square kilometres, from Britannia
  Beach in the south to Paradise Valley in the north, marked with a stepped
  dashed line. The photo has a picture over about 290 square kilometres of
  them. The first builds covered a box of about 50 square kilometres over
  downtown. Inside the line the land is a 1 m
  laser survey where a survey flight passed, either the top of whatever stands
  there (treetops and roofs) or the bare ground beneath, with the air photo
  laid over it at about 10 cm for each pixel, and at about 5 cm, the photo's
  own grid, over the settled valley from Brackendale to the foot of the
  Stawamus Chief, about 82 square kilometres. A reader can pick out single
  trees, road markings, garden beds and the lines of a parking space. From far
  off, in the whole-place view, the photo shows too.
- **Photos from the ground.** Dots on the map mark photographs that volunteers
  took at ground level and gave to two open archives. Choosing a dot opens the
  photo under the map. Nine of them are all-round photos a reader can look
  around in; the rest are single frames from drives along roads.
- **Google Street View, inside the view.** A button under the map loads
  Google's own Street View in a frame, at the panorama nearest the middle of
  the map and facing the way the map faces. Nothing is asked of Google until
  the reader presses it. A link beside it opens the same spot on Google's own
  site. Google's photos are shown by Google's page; nothing of Google's is
  copied or kept here.

A reader can go to the close-up, return to the whole place, zoom, turn, tilt or
look straight down, choose between treetops and bare ground, and switch four
things on or off: the air photo, the loss patches, the ground-level photo dots,
and a colouring of height above ground in five classes.

## How close this gets to street level

The owner asked for detail as high as Google Street View. Street View is
photographs taken from the ground, a few metres apart, along almost every road.
The view now reaches that detail in one way only: by showing Google's own
Street View in a frame, where Google has it. The Site's own data gets part of
the way.

| | Whole place | Close-up area | Photos from the ground | Google Street View in a frame |
| --- | --- | --- | --- | --- |
| Shape of the land | 30 m | 1 m survey, stored at about 0.77 m | not a shape: a photograph | not a shape: a photograph |
| Picture | none | air photo, about 10 cm for each pixel, about 5 cm over the settled valley, about 82 square kilometres | the photographer's own picture: 11,904 pixels around for an all-round photo, up to 2,048 across for a road photo | Google's own panoramas, at Google's own sharpness |
| Seen from | above | above | a person's or a car's height | a car's height |
| Where | the whole place | everywhere the air photo reaches: about 290 square kilometres of picture inside about 360 | 101 photos so far: 9 at one spot under the trees, 92 along roads | wherever Google has driven; nothing away from roads |
| Whose | the Site's copy of public data | the Site's copy of public data | the Site's copy, share-alike | Google's, shown by Google's page, not the Site's data |

**1. The air photo at all the detail it has, everywhere it reaches.** The
District describes the photo as a 7.5 cm and 15 cm composite and serves all of
it on one grid of 0.075 units, about 5 cm on the ground at this latitude. The
first build stored it at about 19 cm over a box of about 50 square kilometres.
This build stores it at about 10 cm everywhere the photo has a picture, and at
about 5 cm, the service's own grid, over the settled valley: 33 map tiles,
about 82 square kilometres, taking in Brackendale, Garibaldi Highlands,
Garibaldi Estates, downtown, Valleycliffe and the foot of the Stawamus Chief.
An earlier build kept that level over about 15 square kilometres downtown
only. A measured comparison
at six spots in the first box (downtown, the Stawamus Chief, the estuary, and
its north, west and south) found that each finer level adds picture the coarser
one lacks, and a second measure at seven spots from Furry Creek to Paradise
Valley found the photo as sharp at its finest grid outside downtown as inside
it. There is no finer free picture from above: this is the limit of the
source, not of the build.

**2. Real photographs from the ground, where volunteers took them.** Two open
archives hold street-level photos anyone may reuse with credit. Inside the
first box (about 50 square kilometres over downtown) they hold:

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

**3. Google's own Street View, in a frame and by a link.** Google's photos are
Google's: their terms do not allow copying them into another site, so the only
free way to show them is to let Google's own page show them. The view does
that two ways. A button loads Google's Street View page in a frame under the
map, at the panorama nearest the middle of the map; this is Street View
itself, so along a road Google has driven the reader sees exactly what Street
View shows. A link opens the same spot on Google's site. The frame is allowed
only in a build with the prototype flag, loads nothing until the reader asks,
and uses an address Google serves but does not document for other sites. See
"Google Street View: a frame and a link, not a source" and "What a release
would need".

What the prototype still cannot do: show a forest from inside it, away from
that one spot and away from roads Google drove; or show, in its own data, what
Street View shows. The Site's own picture of the land stops at the air photo,
taken from above, so on a steep face (a cliff, the side of a tree) it is
stretched.

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

**Coverage.** Lidar covers part of the land only. Inside the close-up area 38%
of the finest pixels have no survey: the sea, and land no flight covered,
mostly the mountainsides at the edges. (In the first box it was 18%.) Those are
filled from the 30 m ground model, in both the surface and the ground archive.

**Reading the mosaic.** The two files are 150 GB and 160 GB and are read in
place. A read of the whole area in one request failed on a damaged answer, so
the script reads one row of the area at a time, four rows at once, and asks
again for a row that fails. Eight rows were asked for twice in this build.

### Close-up picture: District of Squamish, Aerial Photo 2024

| Item | Finding |
| --- | --- |
| Product | "Aerial Photo 2024", described by the publisher as "Squamish composite orthophoto 7.5cm & 15cm flown spring/summer, 2024". District of Squamish. |
| Record | The District's open data portal, https://data.squamish.ca/, item `e86a2b42f49046918c0c0c1d13f000a2`, category "Open Data", public |
| Licence on the record | "This data set is published under the terms of the Open Government Licence - Squamish." |
| Licence text | Open Government Licence – Squamish, version 2.0, read at https://squamish.ca/government-and-administration/maps-and-data/open-data/. It grants a "worldwide, royalty-free, perpetual, non-exclusive licence to use the Information, including for commercial purposes", asks for the statement "Contains information licensed under the Open Government Licence - Squamish.", gives no warranty, forbids implying endorsement, and does not cover personal information or third-party rights. |
| Access | The District's public image service, no account: `https://portal.squamish.ca/server/rest/services/Orthophoto_2024/ImageServer` |
| Grid | One grid of 0.075 units in EPSG:3857 for the whole photo. The service's catalogue lists three pieces, all with that finest pixel. It does not say where the photo was flown at 7.5 cm and where at 15 cm. |

The service was read politely: one request at a time, a second apart, each
answer kept on disk so nothing is asked for twice. The first builds made 686
requests of 4,096 by 4,096 pixels over the first box. The wider build added
280 small requests to find where the photo has a picture, a 256-pixel mask for
each of the 580 zoom-15 tiles of the area (500 of them new), and 2,095 more
blocks of 4,096 pixels, asked for only where the mask shows a picture. The
service's own record gives the pixel size as 0.075 in EPSG:3857 units; at
Squamish's latitude that is about 5 cm on the ground, which is why zoom 21
(about 4.8 cm) is the level that holds everything.

**Where the photo has a picture.** A coarse request for the whole extent shows
only part of the photo, because the service hides its pieces when asked for
large pixels. The reach was found by asking for each zoom-14 tile of the
service's extent on its own: 145 of 280 hold some picture. The close-up area
is those tiles, and the picture covers about 290 square kilometres of their
360 (288.4 of 361.9, measured from the masks).

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
| Found in the first box | 11 records. 9 are all-round photos by the contributor "49PL", taken on 2026-06-25, 11,904 by 5,952 pixels, 35 to 50 MB each. The files of the other 2 answered "not found" and are left out. |
| Kept | The original file of each photo, unchanged, with a SHA-256, beside the build output. The Site's copies are the same picture made smaller (4,096 and 8,192 pixels around) and the original itself. |

The archive blurs faces and number plates before it publishes a photo. Two
people are in view in these photos, with their faces blurred.

### Ground-level photos: KartaView

| Item | Finding |
| --- | --- |
| Archive | KartaView, street-level photos given by volunteers, run by Grab. Read through `https://api.kartaview.org/2.0/photo/`, no account. |
| Licence | Terms of use, section 4, read at https://kartaview.org/terms on 2026-11-19: the street images are licensed under "Creative Commons Attribution-ShareAlike 4.0 International". |
| Credit the terms ask for | "© Grab and KartaView Contributors". A record carries no photographer's name. |
| Found in the first box | 76,941 photos across the 32 drives that pass through it; 9,234 of them inside the box; 8,261 of those usable; 453 kept after thinning; 92 fetched so far. |
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

### Google Street View: a frame and a link, not a source

Nothing of Google's is copied, stored or changed. Google's page shows Google's
photos, in two ways.

**The link.** Google documents the address `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=<latitude>,<longitude>&heading=<degrees>`
(Maps URLs). It needs no account or key and costs nothing. Followed in a
browser on 2026-11-19, it opened Google's Street View at the spot asked for.
The view writes this address into an ordinary link. Where Google has no photo
near the spot, Google shows its map instead.

**The frame.** The address `https://www.google.com/maps/embed?origin=mfe&pb=!6m7!1m6!2m2!1d<latitude>!2d<longitude>!3f<heading>!4f0!5f1`
shows Street View at the panorama nearest a position, with no account and no
key. Loaded in a frame on 2026-11-20, with the map centred on Brackendale, it
showed Google's Street View on Government Road there, facing the way the map
faced, with Google's own controls and credit. It is the address
that Google's older documented form
(`https://maps.google.com/maps?layer=c&cbll=<latitude>,<longitude>&output=svembed`)
now redirects to.

What is known and not known about the frame:

- **It is not Google's documented way to put Street View on another site.**
  That is the Maps Embed API, which is free and needs a key from a Google
  account, with Google's terms accepted by the account's owner. The key-less
  address works today and Google may change or close it without notice. The
  prototype uses it because creating an account or a key is the owner's to do.
- **Google's terms apply to whoever looks.** The frame is Google's page. The
  reader's browser asks Google for it, so Google learns the reader's address
  and the spot asked for. The view sends no referrer with it.
- **Nothing loads until the reader presses the button.** Before that the page
  holds no frame, and no request goes to Google. "Close Street View" removes
  the frame.
- **The content security policy allows it only with the prototype flag.**
  `next.config.ts` adds `frame-src https://www.google.com` when
  `NEXT_PUBLIC_TERRAIN_PROTOTYPE=1`, and never on a place's embedded figure.
  No released build sets the flag, so the released policy has no `frame-src`
  and is the same as before (`tests/rendered-html.test.mjs` pins it).
- **The frame is held in a sandbox** that lets Google's page run its scripts
  and open Google Maps in a new tab. It cannot send the reader's Site page
  somewhere else, and, being another site's page, it cannot read it.
- **It follows the map only when asked.** The frame shows the spot the map was
  centred on when the button was last pressed. "Move Street View to the middle
  of the map" asks again.
- **Where Google has no panorama near the spot,** the frame stays empty or
  shows Google's own message. Away from roads that is most of the land.

### Checked and not used

- **Mapillary.** The largest open archive of street-level photos. Reading it
  needs an account and an access token, which is the owner's to create. Likely
  the best next step for photos the Site may keep: see "What a release would
  need".
- **Wikimedia Commons.** 123 photos carry a position inside the first box, but
  they are of mixed subjects (people at a table, vehicles, climbers), not a
  record of the land, and each has its own licence and author. Not taken.
- **Google's photos themselves.** Not free to copy or store. Shown by Google's
  own page only, as above.
- **More Panoramax photos in the wider area.** Searched on 2026-11-20 over the
  whole wider area: the same 11 records as in the first box, and no others.
- **More KartaView photos in the wider area.** Not searched. The archive's
  photo store has not answered this machine since 2026-11-20, so a wider
  search would list photos that cannot be fetched.

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

- `fetch-photo` downloads the air photo in blocks of 4,096 pixels. For each
  zoom-15 tile of the area it first asks for a 256-pixel mask of where the
  photo has a picture, and asks for the block only if the mask shows one. Then
  the finer blocks, zoom 16 over the area and zoom 17 where the finest level is
  kept, skipping any the photo does not reach;
- `elevation` reads the surface model and the ground model at 1 m, one row of
  the area at a time, copies the far tiles, and cuts zooms 12 to 16 for the
  close-up area (height rounded to a sixteenth of a metre), filling survey gaps
  from the 30 m window;
- `photo` cuts the blocks into 256-pixel WebP tiles: zooms 10 to 20 in one
  set (10 and 11 are there so the whole-place view shows the photo), and zoom
  21 in a set of its own, because a map draws nothing where a set
  has no tile and cannot fall back to a coarser one. It refuses to run while a
  block the masks call for is missing;
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
archives inside the first box (the script keeps its own bounds), keeps each original with its SHA-256,
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

Close-up area (the wider build of 2026-11-20):

| | |
| --- | --- |
| Area | 145 zoom-14 tiles in 20 rows, y 5563 to 5582, each row from its first to its last tile with a picture. Longitude −123.288574 to −122.980957, latitude 49.624946 to 49.908787. 361.9 square kilometres. |
| Remote surface file | `2_4-mosaic-1m-dsm.tif`, 159,701,620,349 bytes, ETag `ac37832e3b7f5637ce813fe702c27a77-595` |
| Remote ground file | `2_4-mosaic-1m-dtm.tif`, 152,736,011,515 bytes, ETag `3d6982efcf1c8c28b111e8128e67796d-569` |
| Elevation step | 2,670 s, most of it reading the mosaic. Peak memory 2.54 GB. Eight rows asked for twice. |
| Elevation tiles added, each archive | 3,109 (zoom 12: 15, zoom 13: 49, zoom 14: 145, zoom 15: 580, zoom 16: 2,320) on top of the 116 far tiles |
| Surface heights | −2.19 m to 1,709.71 m |
| Ground heights | −30.4 m to 1,709.38 m |
| Finest pixels with no survey | surface 233,795,898 and ground 233,922,049, of 608,174,080 (38%) |
| Photo download | 500 masks and 2,095 blocks in 4 hours 27 minutes, about 6 to 10 seconds a block; five answers dropped and asked for again. Then, for the finest level over the settled valley, 1,728 more zoom-17 blocks in 2 hours 29 minutes, one request at a time, about 5 seconds a block; one answer dropped and asked for again. With the 686 blocks of the first builds, 4,509 blocks are on disk: 525 at zoom 15, 1,872 at zoom 16 and 2,112 at zoom 17. 55 zoom-15 tiles have no picture and were not asked for. |
| Photo step | 1,547 s with six worker processes. The largest process held 0.91 GB; swap did not grow. |
| Photo tiles | 1,175,510: zooms 10 and 11, 9; zooms 12 to 19, 159,774; zoom 20, 475,523; zoom 21 (settled valley only), 540,204 |
| Picture | 288.4 of the 361.9 square kilometres, measured from the masks. 525 of 580 zoom-15 tiles hold some picture; 356 are wholly pictured. |
| Ground size of one photo pixel | 0.193 m at zoom 19, 0.096 m at zoom 20, 0.048 m at zoom 21 |
| Finest level, zoom 21 | 33 zoom-14 tiles in nine rows, y 5571 to 5579, each from x 2586 to 2588 or 2589, inside longitude −123.178711 to −123.09082 and latitude 49.667628 to 49.79545: about 82 square kilometres. An earlier build kept six tiles, about 15 square kilometres. |
| Height step | 186 s |
| Height tiles | 7,910 (zoom 12: 15, zoom 13: 42, zoom 14: 112, zoom 15: 407, zoom 16: 1,515, zoom 17: 5,819) |
| First box, for comparison | 20 zoom-14 tiles, 50 square kilometres, 206,500 photo tiles, 2.1 GB of archives |

Archives in `public/prototype/terrain/`:

| Archive | Bytes |
| --- | --- |
| `squamish-dtm.pmtiles` | 34,512,766 |
| `squamish-surface.pmtiles` | 634,469,074 |
| `squamish-ground.pmtiles` | 434,748,301 |
| `squamish-photo-2024.pmtiles` | 8,798,209,060 |
| `squamish-photo-2024-core.pmtiles` | 3,974,500,752 |
| `squamish-height.pmtiles` | 51,662,249 |
| Total | 13,928,102,202 |

The elevation and height archives were not rebuilt for the settled-valley
round: their build records name the script as it stood one commit earlier,
whose elevation and height steps are the same.

The downloaded photo blocks, kept beside the build output and not served, are
about 32 GB.

Ground-level photos in `public/prototype/terrain/ground/`:

| | |
| --- | --- |
| Photos in the index | 101: 9 all-round (Panoramax), 92 single (KartaView) |
| Files | 119 pictures and `index.json`, 529,734,215 bytes. The nine originals are about 400 MB of that. |
| KartaView search | 513 requests for lists, about 25 minutes, answers kept on disk |
| KartaView photos not fetched | 361 of 453. All ten of the archive's photo-store hosts stopped answering this machine partway through, on 2026-11-20, while its search and website kept answering. The script stops asking after five photos in a row fail. |
| Panoramax files not fetched | 2, "not found" |

Height above ground at the finest zoom, as a share of the pixels that have a
survey, rounded: under 2 m 19%, 2 to 10 m 20%, 10 to 20 m 26%, 20 to 30 m 22%,
30 to 40 m 10%, 40 m or more 2%.

## What was checked

On a production build with the flag on, served locally, in Chromium, on
2026-11-19 and 2026-11-20 (the wider area, the Street View frame and the
finest level over the settled valley on 2026-11-20):

- the flagged production build completes, and the view reaches its ready state
  in English and in French;
- all six archives are served with range requests (the largest is 8.80 GB);
- in the whole-place view, before any zoom, the photo is drawn along the
  valley (it was not, before zooms 10 and 11 were added);
- the dashed line follows the stepped edge of the wider area, and from far off
  the photo fills the valley from Howe Sound to north of Brackendale;
- in Brackendale, about 8 km north of downtown and outside the first box,
  looking straight down at the closest zoom, the zoom-20 tiles are drawn: a
  house, a parked car and a garden shed can be told apart;
- Go to the close-up, Whole place, Zoom in, Zoom out, Turn left, Turn right,
  Look straight down and Tilt the view each do what they say;
- Treetops and roofs and Bare ground swap the shape of the land; Air photo,
  Height above ground, Forest loss and Ground-level photos each switch their
  layer, and the height key appears with the height colouring and reads the
  same classes the tiles were built with;
- in Garibaldi Estates, about 5 km north of downtown and outside the earlier
  core, looking straight down at the closest zoom, the zoom-21 tiles are
  requested and drawn (29 requests of that archive, none failing): a boat on
  its trailer, a camper, a swimming pool and single cars in a driveway can be
  told apart. Google's frame, asked for there, showed Dales Place, the same
  cul-de-sac;
- looking straight down downtown, at the closest zoom, the zoom-21 tiles
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
- before "Show Google Street View here" is pressed the page holds no frame and
  asks nothing of Google. Pressed with the map over Brackendale, the frame
  showed Google's Street View on Government Road, facing the way the map
  faced. The frame stayed there while the map moved to the close-up; "Move
  Street View to the middle of the map" then took it to Totem Drive, below the
  Stawamus Chief. "Close Street View" removed the frame;
- the frame carries a title, a sandbox and no referrer, in both languages;
- a flagged build's pages answer with `frame-src https://www.google.com` in
  their content security policy, and a place's embedded figure does not;
- zoomed in outside the close-up area the land keeps its true height (the
  30 m model is used where the finer archive has no tile) and its shading, and
  the view stays in its ready state;
- at 375 px wide the frame fits, nothing scrolls sideways, every control and
  the Street View link is 44 px tall, an all-round photo loads only its
  4,096-pixel copy, and the Street View frame is 343 px wide with both its
  buttons 44 px tall;
- no request to the Site fails, and the console shows no
  content-security-policy, tile or WebGL errors. With the Street View frame
  open, two "not found" answers are logged from inside Google's own page; none
  is the Site's. MapLibre logs one advisory,
  that the surface and its shading share a source; that is deliberate, for the
  reason given at the top of `PlaceTerrain.tsx`;
- no middle dot separates pieces of text anywhere in the view;
- with the flag off, `terrainPrototype()` returns nothing, so the section is not
  rendered;
- `npm run lint`, `npm run typecheck`, the twelve static gates the change can
  touch (claims, style tokens, hex literals, year-range format, brand token,
  persistent identifiers, contrast, bilingual, loss vocabulary, CI coverage,
  source review, accessibility), 63 place-page and gate unit tests, and the
  whole unit suite (2,235 tests: 2,231 pass, 4 are skipped as before) pass.
  One of those tests,
  `tests/volume-source-redistribution.test.mjs`, reads every file under
  `public/` whole and cannot open one larger than 2 GiB, so on a machine that
  holds the two photo archives it fails with "file too large" until they are
  moved aside. It passes with them moved aside, and in a checkout without the
  archives. The checker was left as it is.

Not checked: a real phone or touch device (dragging a photo with a finger),
Safari or Firefox, a slow connection, a screen reader, keyboard-only use of the
map itself or of Google's frame, a device whose graphics memory cannot hold an
11,904-pixel picture, print, the Street View frame from any network but this
one, and every part of the wider area (the photo was looked at downtown, in
Brackendale and from far off).

## Limits a reader would need to know

- **The Site's own data does not reach Street View.** From above, the picture
  stops at the air photo's own grid, about 5 cm. From the ground, the Site
  holds photos at 101 spots, against Google's coverage of nearly every road.
  Street View detail is reached only by showing Google's own page in a frame.
  See "How close this gets to street level".
- **The Street View frame is Google's page, not the Site's.** It loads only
  when the reader asks, and then Google receives the request under Google's
  terms. Its address is one Google serves but does not document for other
  sites, and it may stop working. The Site does not check what it shows. Away
  from roads Google has nothing, and the frame stays empty. The frame does not
  follow the map by itself.
- **Ground-level photos are sparse, old and uneven.** One spot under the trees
  from 2026; road photos from 2016 and 2017 in this build. A road photo may
  show a place that has since changed. 361 more road photos are listed and not
  yet fetched.
- **Ground-level photos show people, vehicles and homes.** The archives blur
  faces and number plates by machine, which can miss some. Two people are in
  view in the all-round photos.
- **An all-round photo is large.** The original is 35 to 50 MB and is loaded
  whole on a wide screen, after a 3 MB copy.
- **The Street View link leaves the Site.** What it opens is Google's, on
  Google's terms, and is not checked by this Site. Away from roads Google may
  have nothing near and show its map instead.
- **The close-up covers one place.** It is everywhere the District of
  Squamish's photo reaches, about 360 square kilometres, and nowhere
  else: outside the dashed line the land is the 30 m ground with no picture.
  Air photos this fine exist only where a municipality publishes them. The
  other places on the Site, in all four provinces, have no close-up.
- **The photo does not fill the dashed line.** The line follows whole map
  tiles. The photo has a picture over about 290 square kilometres of them; the rest, at the ragged edge, is drawn without a picture.
- **The survey and the photo are different years.** The photo is 2024. The
  survey's year is not established and it is older. A tree in the photo may
  stand where the surface is bare, and the reverse.
- **Treetops look melted.** The photo is draped over a surface with a point
  every metre or so. A single tree becomes a cone and a forest edge a wall.
  "Bare ground" gives the cleanest picture; "Treetops and roofs" gives the
  truest shape.
- **Height above ground is trees and buildings alike.** The colouring does not
  tell a tree from a roof, and it is not a forest map.
- **38% of the close-up area has no survey.** No flight covered the higher
  mountainsides or the sea. There the ground is the 30 m model with the air
  photo laid over it, so the treetop surface and the height colouring stop at
  a visible edge and the photo looks smeared on steep ground.
- **The finest photo level covers the settled valley only,** about 82 square
  kilometres from Brackendale to the Stawamus Chief. Outside it (Paradise
  Valley, the Cheakamus, Britannia Beach, Furry Creek and the mountainsides)
  the photo is stored at about 10 cm, coarser than the 5 cm grid it is served
  on, although the photo is as sharp there. Storing the finest level over the
  whole photo would take roughly 7,000 more requests of the District's server
  and tens of gigabytes. The two photo archives are 12.8 GB together.
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
   by the Site, but it sends a reader to Google. The frame puts Google's page
   on the Site's page. Releasing the frame needs three things that are the
   owner's: a decision to allow `https://www.google.com` in the released
   content security policy (today only a flagged build allows it); a choice
   between the key-less address used here, which Google does not document for
   other sites, and the Maps Embed API, which is free, needs a key from the
   owner's Google account and Google's terms accepted; and wording in the
   Site's privacy notice, because a reader who presses the button is seen by
   Google. Without those, a release keeps the link and drops the frame.
4. **A Mapillary access token, if more ground-level photos are wanted.**
   Mapillary is the largest open archive and needs a free account, which is the
   owner's to create. Its photos are CC BY-SA 4.0, like the two used here.
5. **An established survey year,** or wording a reviewer accepts without one.
6. **Hosting for large archives.** One place is about 13.9 GB of archives
   and 0.5 GB of ground-level photos. Air photos this fine exist only where a
   municipality publishes them, so most places could have the 1 m shape and
   height but no picture. A province is a different size of job and needs its
   own measured run, bounded in memory like every other data job.
7. **A reviewed French text and an accessibility pass** (keyboard, screen
   reader, touch), which local tests do not close.
8. **A decision on where it belongs**: every place page, Explore, or neither.
