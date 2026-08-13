# National baseline local admission

`lib/pipeline/national-baseline.ts` is a local planning boundary for the NTEMS VLCE2 annual land-cover series. It does not fetch, upload, read raster pixels, reproject, intersect, aggregate, create tiles, create downloads, write records, or render product data.

It can admit a raster only when the existing immutable-promotion contract accepts its exact archive as `remote-verified`: a matching whole-object checksum and byte length, provider payload and sidecar version IDs, Canadian-region evidence, and active compliance-mode retention are required. The input must also be a canonical-grid VLCE2 header and its archive filename must match the declared year. A local or merely uploaded archive is rejected.

No actual VLCE2 input is supplied by this module. The recorded VLCE2 work remains read-only local validation; it has not established immutable promotion for any of the 39 annual archives. Consequently `planNationalBaseline([])` is valid only as an empty local plan and produces no public or production result.

The 1991 and 2005 `.tif.vat.dbf` sidecars remain an upstream metadata hazard. Their class lists are represented as `Unknown` with a reason, never an empty list or numeric zero. Grid-conformant comparisons are a separate future step and do not make sidecar-derived class statistics available.

Before real processing can begin, each raster snapshot must independently pass immutable admission, and Phase 2 still requires documented pixel processing, verified boundaries, lineage, aggregates, validation samples, provincial statistics, method review, and a separately approved release.
