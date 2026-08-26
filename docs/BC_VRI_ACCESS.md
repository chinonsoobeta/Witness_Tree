# BC current VRI access block

The Phase 1 forest-condition candidate is the official **VRI - 2025 - Forest Vegetation Composite Polygons** record. Its catalogue record labels it **Access Only** and advertises the entire-province `VEG_COMP_POLY_AND_LAYER_2025.gdb.zip` FGDB in BC Environment Albers (described as 5.3 GB).

On 2026-08-14T19:38:42Z, a read-only HTTP HEAD request to that exact published URL returned `404 Not Found`. No body was downloaded and no file was staged.

BC's official [copyright terms](https://www2.gov.bc.ca/gov/content/home/copyright) say that Access Only data-catalogue material may not be reproduced or redistributed without written permission. That prevents an immutable internal archive, transformation, or any derived/public redistribution until the Province gives written permission. It also leaves no verified complete, versioned current artifact to checksum or profile.

This is vegetation-inventory context for pre-event forest condition only. It is not interchangeable with FTA 4.0 cutblocks, harvesting-authority polygons, Forest Operations Map planned cutblocks, or completed-harvest geometry. The separately published OGL-BC **historical** VRI 2002–2024 collection must not be silently substituted for the current 2025 inventory.

## Unsent permission/export request

Do not send this without separate owner instruction. Submit the official [BC copyright permission request form](https://forms.gov.bc.ca/copyright-permission-request/) asking the Ministry of Forests to:

1. Provide a functioning, complete, versioned 2025 VRI composite-polygon export and its edition/effective date and refresh cadence.
2. Permit retrieval and an internal immutable archival copy.
3. Permit internal transformation and analysis.
4. State whether derived or public outputs may be redistributed, and any required attribution.
5. Provide a correction/refresh contact and any use constraints.

Until all of those are written and the supplied artifact is integrity-checked and profiled, the admission booleans in [`bc-vri-access-block.json`](../data/bc-vri-access-block.json) remain false.
