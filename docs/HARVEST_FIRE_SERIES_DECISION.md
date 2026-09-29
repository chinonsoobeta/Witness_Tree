# Harvest and fire series: publication and multi-year totals

Recorded 2026-09-25. Decided by the owner.

## Decision

1. Publish the four provincial harvest and fire series, 1985 to 2022, on the
   site. The record is `data/harvest-fire-province-annual-series.json`, built by
   `scripts/build-harvest-fire-province-series.mjs` and checked by
   `npm run check:harvest-fire-province-series`.
2. Show them on a new Data page, "Harvest and fire by province"
   (`/en/data/harvest-and-fire`, `/fr/donnees/recolte-et-incendies`), where a
   reader can build a chart for any province, span and interval length, and
   download it as a PNG or its rows as CSV. The Explore "Recorded harvest" and
   "Wildfire" modes show the same figures for the selected years and link to
   the page.
3. In the harvest and fire view only, years may be added into multi-year
   totals. This relaxes rule 1 of
   [the Fall-Down article support plan](FALL_DOWN_ARTICLE_SUPPORT_PLAN.md) and
   the WP2 publication boundary for this view. Everywhere else the rule stands.

The series is not expert reviewed, not checked against the ground, not a
formal release and not production eligible. The French text is a draft awaiting
bilingual review.

## Why totals are safe here

The no-summing rule exists because the detected-loss series is annual: a place
lost in two years is counted in both, so adding years counts it twice. The
national harvest and wildfire products are different. Each 30 m cell carries
at most one change year per product, so adding years within harvest, or within
fire, counts each cell once. A total is the area whose recorded change year
falls in the chosen years.

## Conditions on every total

- It names its first and last year.
- An interval with fewer years than its nominal length, such as 2020 to 2022 in
  five-year steps, is marked as shorter.
- Harvest and fire are never added to each other. One cell can carry both a
  harvest year and a fire year, so their sum could count it twice.
- It is described as the area whose recorded change year falls in those years.
  A stand that burned twice, or was cut twice, appears once.

## What the series may assert

Per province and year, the area of forested land whose change Natural
Resources Canada's national satellite record dates to that year and attributes
to harvest or to fire, and the sum of those areas over a span of years. It is
stand-replacing change, not official burned or harvested area, and not
permanent forest loss. It does not assert who harvested, why a fire started,
whether a stand regrew, or any legal or compliance finding.

## What the checks established

- The four inputs are the WP2 staged files, held to their staging entries by
  SHA-256 and byte length.
- In every province, each disturbance year's count is identical in all 39
  land-cover years, and the counts account for every land cell.
- No harvest or fire is dated where the land cover is unmapped. The unmapped
  part is the same in every year and equals the province span release's
  unmapped cells: 45,503 cells in British Columbia, 170,800,264 in Alberta,
  98,262,741 in Ontario and 246,721,691 in Quebec. It is reported as Unknown.
- 1984 has no datable change, because a change is dated against the year
  before. It is Unknown, never zero.

## Limits a reader must see beside the figures

- The year is when the change first appears in an image taken around 1 August,
  give or take 30 days, so late-season fires can fall in the following year.
- A burned stand later salvage-logged is usually counted as fire.
- Change near farmland may be missing, because farmland was masked out.
- The record ends in 2022; later fire seasons, including 2023, are not in it.
