# BC volume instrument admission

Status: vocabulary and publication boundary fixed for WP4 of
`docs/FALL_DOWN_ARTICLE_SUPPORT_PLAN.md`. This record does not admit, release or
promote any product. It fixes what three volume quantities are, which sources may
be published, and which derivations are prohibited, so that every later WP4 step
uses the same words.

Recorded 2026-09-12. Nothing here is owner review, publisher confirmation or a
licence grant. Rights findings below are read from public terms pages and are
recorded as found.

## Why this is a second instrument

Everything the site has published so far is an area instrument: 30 m cells that a
classifier called forest in one year and not in a later one. Volume is a different
instrument with different failure modes. The two may sit side by side. Neither
corrects the other.

## The three quantities

### Scaled harvest volume

What it is: the cubic metres a licensed scaler measured on logs that had already
been cut, billed through the Harvest Billing System (HBS).

What it supports: how much wood left the forest in a billing period, by the
grouping the report uses.

What it cannot support:

- It is not standing timber and says nothing about what remains.
- It is not an area. A year of low volume is not a year of little forest loss, and
  the reverse.
- Billing month is not cutting month. Scale can lag the harvest.
- HBS reports are restated. A value read on one date is that date's value.

### Stumpage

What it is: a price set by a published appraisal formula (the Interior Appraisal
Manual and the monthly Market Pricing System parameter sheets). It is a formula
output, not an observation of what the wood is worth.

What it supports: what the Crown charged, under the formula in force at the time.

What it cannot support: independent evidence about timber quality, cost or value
after July 2023. The formula changed then in a way that ties the price to the
harvest shortfall itself:

| Term | 2022 manual | 2024 manual |
|---|---|---|
| Harvest term | `+0.4001 × TOT_HARV_12MR` (twelve-month Interior harvest, million m³) | removed |
| Allowable-cut gap term | none | `−0.7584 × AAC_DELTA_12MR` (twelve-month allowable cut minus harvest) |
| Sawlog lumber pass-through | 0.4139 | 0.3117 |
| Chip pass-through | 0.2880 | 0.1656 |
| Constant | 42.30 | 59.77 |

The single substitution of the harvest term moved the estimated winning bid by
roughly $23 per cubic metre. After the break, a low appraised rate is partly an
effect of the unharvested allowable cut, so reading it as a cause of that gap is
circular. Any stumpage series the site ever shows must mark the break visibly at
July 2023. This package publishes no stumpage series.

These coefficients are cited as fact from Crown-copyright documents. The documents
themselves are not redistributed.

### Allowable annual cut (AAC)

What it is: an administrative determination by the Chief Forester under the
Forest Act. It is a policy number, not a measurement.

What it supports: the ceiling the province set, and the gap between that ceiling
and regulated harvest.

What it cannot support:

- It is not an estimate of wood that exists or could be cut profitably.
- A harvest below the AAC is not by itself evidence of scarcity, of surplus, or of
  mill demand. It is a gap between a measurement and a policy.
- Total AAC should be compared with harvest *regulated by* AACs, not total harvest.
  The indicator reports the unregulated remainder separately.

## Prohibited derivations

- **No cubic metres per hectare.** Dividing scaled volume by detected loss area
  joins two instruments whose boundaries, timing and definitions differ. The result
  looks like yield and is not. The same applies to any per-cell or per-riding
  volume built from area shares.
- No stumpage reading across the July 2023 break as one continuous series.
- No AAC described as timber supply, inventory or availability.
- No blank indicator cell rendered as zero.

## Sources and publication boundary

| Source | On the data root | Rights found | Site may publish |
|---|---|---|---|
| Environmental Reporting BC, *Trends in Timber Harvesting* indicator workbooks (`bctimberharvest.xlsx`, `bctimbersupplyforecast.xlsx`) | `raw/bc-timber-harvesting-indicator/2026-09-12/` | BC Data Catalogue record lists Open Government Licence - British Columbia, version 2.0 | Yes, with the OGL-BC attribution statement. The harvest and AAC workbook is published; the forecast workbook is staged but not shown, because the retrieved record does not describe the forecast's basis. |
| Harvest Billing System scaling history reports (HBS3R441 and related) | `raw/bc-hbs-scaling-history*/` | No catalogue record and no licence statement. The gov.bc.ca Copyright page states all rights reserved and no reproduction or redistribution without prior written permission. | No. Local analysis only. Sidecar licence stamps were corrected on 2026-09-12 (see below). |
| BC Timber Sales auction results | `raw/bc-bcts-timber-sale-results/2026-09-12/html/` | Not verified. Pages name bidders, who can be individuals. | No. Aggregate findings may be stated as fact without names or client numbers. |
| Market Pricing System appraisal parameter sheets | `raw/bc-mps-appraisal-parameters/2026-09-12/` | Crown copyright; personal study or research only; redistribution needs a licence from the Intangible Property Program | No. Numbers may be cited as fact with attribution. |
| Interior Appraisal Manual editions | `raw/bc-interior-appraisal-manual/2026-09-12/` | Crown copyright | No. Formula terms may be cited as fact with attribution. |

The indicator workbook is itself derived from HBS. Publishing the provincially
published aggregate under its own open licence does not extend any right to the
underlying HBS reports.

`scripts/check-volume-source-redistribution.mjs` enforces the "No" rows against
`public/`, `data/`, `app/`, `components/`, `lib/` and any built `.next/` output.

### A finding stated without names

From the BC Timber Sales corpus (5,822 sale records with auction years 2003 to
2026), the share of auctioned sales attracting no bid fell from 59.5% in 2010
(370 sales) to 15.7% in 2025 (216 sales), while mean bidders per auctioned sale
rose from 1.41 to 2.51. Both are counted over every auctioned sale in the year,
whatever its later status. A thinning auction market does not explain recent low
prices. This is stated as an aggregate count. No bidder name, client number or
individual bid appears on the site.

## Corpus provenance at 2026-09-12

Read-only tree inventories with `scripts/verify-data-root-inventory.mjs --root`.
Digests are valid at their completion instant only. There is no backup of these
files, and no recovery has been demonstrated.

| Corpus | Files | Bytes | Tree SHA-256 |
|---|---:|---:|---|
| `bc-hbs-scaling-history` | 1,716 | 55,324,517 | `b71b949576265044a42203d763373fb85f69233410367fa282851a83b6c110cb` |
| `bc-hbs-scaling-history-grade` | 1,710 | 52,425,154 | `592de0108a0465c7ed9644f4cd60edb5fc4b5e0806543ba1f8c625ff9cd97295` |
| `bc-mps-appraisal-parameters` | 504 | 56,048,707 | `a3eea6e516672e9bd696cdef1ffd173daf830d3b2171d0dba1185f825de850cf` |
| `bc-interior-appraisal-manual` | 12 | 16,687,540 | `9db822c1a77f6dd6ceec9fc11b4b1886fd290c32b8531f54ca0d7474144568e5` |
| `bc-bcts-timber-sale-results` | 5,822 | 7,821,465 | `bced168b5d3237a7cd751116c11ebff0ec26324b366b5b77fb02271b78f51e70` |
| `bc-hbs-scaling-history-region` | 4,568 | 124,281,471 | `b71f5a19872f3d77a92ac469072f647669554bc46abccfeb8468469c14dabf07` |
| `bc-hbs-scaling-history-restatement-probe` | 108 | 3,294,795 | `f9701fb6b4a73382b2542613e69e285d7093f91beabc689b8412d1c136dc9849` |

The region and restatement-probe inventories were taken after the sidecar licence
correction below, so they bind the corrected sidecars.

## Sidecar licence correction

The HBS harvest scripts wrote `"licence": "Open Government Licence - British
Columbia"` into every region and restatement-probe metadata sidecar. That value
was a script default and was never verified. 1,548 sidecars were
corrected in place on the data root:

- the stamped value is preserved as `licenceAsStamped`;
- `licence` now says the terms are unverified and that the gov.bc.ca Copyright page
  reserves all rights;
- `redistributable` is `false`;
- `licenceVerification.state` is `stamp-corrected-unverified`.

The PDFs were not touched. Each sidecar's SHA-256 before and after is logged at
``derived/hbs-sidecar-licence-correction-20260913.json` (UTC date of the correction)`. The corrected value is not a rights determination either;
it records that no open licence was found.
