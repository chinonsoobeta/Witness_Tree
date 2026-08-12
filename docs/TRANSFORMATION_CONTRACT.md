# Staged transformation decision contract

This is a pure TypeScript decision boundary for the staged geospatial vector archives enumerated in `STAGED_TRANSFORMATION_SOURCE_IDS`. It does not read files, change geometries, fetch data, write object storage, ingest records, or create a production release.

## What this boundary covers

The scope is those vector archives rather than every staged source, and this document states no count of them on purpose. Both admission tests are feature-level: one reads a profiled invalid-geometry count, and the other checks a policy that accounts for every profiled feature. An archive that carries no feature-level geometry profile, such as a raster archive, presents nothing for either test to read. A source outside the enumeration also has no expected checksum here, so it cannot reach a decision at this boundary at all.

Bringing a further source under this contract therefore means adding it to that enumeration and to the checksum table in `lib/transformation/decision.ts`. Because the scope is written as a pointer to the enumeration and not as a running total, staging a source elsewhere in the pipeline does not falsify this section.

Each decision is bound to the source ID, exact SHA-256 archive checksum, profiling decision, attribution state, and an explicit invalid-geometry count. An unknown count is rejected; it can never be silently converted to zero.

## The rule

The rule is general. It names no source, and it encodes no moment-in-time state of any source as a precondition.

A source is admitted to `ready-for-transformation-design` when both of the following hold:

- **Geometry is resolved.** Either the profiled invalid-geometry count is zero, or a deterministic, versioned repair-or-quarantine policy accounts for the profiled features. Accounting is checked arithmetically: repaired plus quarantined plus unchanged must equal the policy's feature count, and repaired plus quarantined must equal the invalid-geometry count the profile reported.
- **Attribution is verified.** The staged attribution state is `metadata-verified`.

Anything else is a returned `blocked` decision carrying its reasons. "Not ready" is an ordinary result, not a failure.

A thrown error means the input itself is malformed or self-contradictory: a checksum that is not SHA-256 or does not match the staged profile, an unknown invalid-geometry count, a profile claiming readiness while reporting invalid geometries, a profile claiming a geometry block while reporting none, or a policy that is unversioned, non-deterministic, or whose counts do not balance.

## What gates each source today

The Québec wildfire archive profiles zero invalid geometries and its attribution metadata is verified, so it is admitted to transformation design. Nothing further gates it at this boundary.

The Alberta AVI archive's attribution is verified: the Open Government Licence – Alberta version 2.2 requires its specified default attribution statement when the Information Provider publishes no dataset-specific one, and none is published, so the default statement applies. What still gates Alberta is geometry. Its profile reports invalid geometries, so it stays `blocked` unless a decision is made with a deterministic repair-or-quarantine policy whose counts account for every profiled feature. Without such a policy the decision remains `blocked`; supplying one that does not balance is rejected as malformed input.

Admission is to transformation **design** only. In every case `eligibleForIngestion` and `productionEligible` remain `false`, and no archive becomes ingested, immutable, or production eligible by way of this decision.

This contract deliberately makes no claim that a transformation has happened, or that any archive it admits is ready for public use.
