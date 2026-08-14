# BC BEC Map v13.1 snapshot block

This record addresses the Phase 1 inventory row `bc-old-growth-bec`, selecting the required BEC ecosystem context only. It does not select any Old Growth Technical Advisory Panel (TAP) layer; TAP records are separate **Access Only** products with separate terms.

The official [BEC Map catalogue record](https://catalogue.data.gov.bc.ca/dataset/f358a53b-ffde-4830-a325-a5a03ff672c3) identifies the current detailed provincial map as version 13.1, dated 2026-07-08, and assigns the Open Government Licence - British Columbia. The record directs GIS analysis to this map. The linked official WFS declares EPSG:3005, `updateSequence=2188590`, SHAPE-ZIP output, and 17,870 matched features.

On 2026-08-14, one read-only SHAPE-ZIP request explicitly asking for all 17,870 features returned a valid ZIP but only 10,000 features. Its SHA-256 is recorded solely as an **excluded diagnostic**. It is not staged, immutable, transformed, ingested, or production eligible.

The WFS declares `PagingIsTransactionSafe` false and `ImplementsFeatureVersioning` false. Combining pages could cross an update boundary and cannot prove a complete, internally consistent v13.1 snapshot. Do not page around the cap or silently substitute the map for VRI forest-condition attributes, FTA cutblocks, harvesting authorities, or TAP old-growth layers.

## Unsent export request

Do not send this without separate owner instruction. Ask DataBC at `datamaps@gov.bc.ca` for a complete immutable BEC Map v13.1 vector export, publisher checksum, edition/effective-date statement, refresh/correction contact, and—if a WFS export is the intended channel—documented consistent-snapshot semantics.
