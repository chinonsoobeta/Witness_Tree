# Forest region shading on the Explore map

**Status:** Decided by the project owner on 2026-10-03.

## What is decided

The Explore map's forest-loss mode shades regions, not whole provinces. The
regions are the owner's, each built from whole Statistics Canada 2021 economic
regions (`lib/explore/forest-regions.ts`):

| Province | Region | Economic regions |
| --- | --- | --- |
| BC | Vancouver Island | 5910 |
| BC | Metro Vancouver, Sea-to-Sky and Sunshine Coast | 5920 |
| BC | Interior | 5930, 5940, 5950 |
| BC | North (Northwest, Northeast, Haida Gwaii) | 5960, 5970, 5980 |
| AB | South | 4810, 4830 |
| AB | Central | 4820, 4850, 4860 |
| AB | North | 4870, 4880 |
| AB | Rockies | 4840 |
| ON | Greater Toronto Area | 3530 |
| ON | Southwest | 3540, 3550, 3560, 3570, 3580 |
| ON | Central | 3520 |
| ON | Eastern Ontario | 3510, 3515 |
| ON | Northern Ontario | 3590, 3595 |
| QC | Greater Montréal Area | 2440, 2445 |
| QC | St. Lawrence River Corridor | 2420, 2425, 2430, 2433, 2435, 2450, 2470 |
| QC | Maritimes | 2410, 2415, 2480 |
| QC | Laurentians and the North | 2455, 2460, 2465, 2475, 2490 |

The economic regions are an approximation of the names: Statistics Canada's
Toronto region also holds Durham, York, Peel and Halton, for instance.

The colour rule is the mapped-forest share:

- Each region is coloured by the share of its **mapped** forest lost in the
  span, on the same breaks as the province legend.
- A region with 1% or more of its land unmapped (the regions' existing
  tolerance, 2026-09-27) is hatched and labelled "Partly mapped – a minimum".
- A region where no forest was mapped at all (the Greater Toronto Area and
  Greater Montréal Area) is grey, never the lightest band: no share was
  measured there.

Figures are summed on the server from the economic-region interval table, so
the 741-span table stays out of the browser.

## Approval

| Role | Decision | Reference | Date |
| --- | --- | --- | --- |
| Editorial decision authority: Chinonso Obeta, project owner | Mapped-forest share, hatch partly mapped, grey where nothing was mapped | Owner's answer "Mapped-forest share (Recommended)" in the implementing session | 2026-10-03 |
