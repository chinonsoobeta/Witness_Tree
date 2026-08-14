# CPCAD acquisition block

On 2026-08-14, the official ECCC CPCAD MapServer layer was read as a point-in-time service snapshot. The Open Government catalogue record supplies the Open Government Licence – Canada; it does not provide a stable publisher edition marker in the layer metadata. The attempted snapshot is therefore identified only by its retrieval instant.

The service reported 22,438 unique, contiguous `OBJECTID` values from 1 to 22,438. Forty-five exact, ordered GeoJSON responses for IDs 1–21,532 and 21,751–22,000 were saved outside Git, totalling 631,532,464 bytes. They are deliberately not a CPCAD dataset snapshot: no canonical combined artifact or geometry profile was created.

The next range failed because `OBJECTID` 21563 is not retrievable with geometry. An attributes-only ArcGIS JSON request returned the feature (HTTP 200); the same feature with `returnGeometry=true` returned an ArcGIS error body with code 500, despite HTTP 200. A GeoJSON geometry request made two bounded 15-second attempts and received no bytes. This is a publisher-service geometry defect, not a missing ID or a licence issue.

[`data/cpcad-acquisition-block.json`](../data/cpcad-acquisition-block.json) hashes the external metadata, ID manifest, and diagnostic response bytes and is checked by `npm run check:cpcad-acquisition-block`. It must remain fail-closed until ECCC supplies a versioned complete artifact or confirms a repaired service geometry. No incomplete result may be combined, transformed, ingested, archived immutably, or made production eligible.
