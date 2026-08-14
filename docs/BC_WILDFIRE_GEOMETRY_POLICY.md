# BC wildfire current-perimeter geometry policy

The exact raw snapshot has two invalid `MULTIPOLYGON` features: `G70362` and `V10755`, both reported by GEOS as nested shells. A read-only `ST_MakeValid` trial produced valid, nonempty polygonal output and retained both IDs, but the relative area deltas were `0.0000019830365765251236` and `0.03167100456325357`. The latter exceeds the 0.01% tolerance by a wide margin.

The defensible current policy is quarantine: no repaired closed join or derived release is produced. Geometry-dependent coverage excludes these two of 217 features until an owner authorizes a source-specific exception or replacement policy. The raw archive is unchanged; it may be preserved as raw provenance but remains not admitted, not immutable-promoted by this policy, not transformed, not ingested, and not production eligible.
