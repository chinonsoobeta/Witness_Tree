# Phase 2 method-parameter manifest

[`data/phase2-method-parameters.json`](../data/phase2-method-parameters.json) is the checked-in owner-independent method identity for Phase 2. `lib/pipeline/method-manifest.ts` validates it and defines its change gate. The manifest binds a method version to the matching, precedence, forest-mask, vectorization, aggregation, and boundary-intersection parameters. Its parameter object is serialized with recursively sorted object keys and hashed with SHA-256; array order remains meaningful, including precedence. The declared hash must match those canonical bytes.

The contract is deliberately unapproved and non-production. Its forest classes are labelled `synthetic-test-only`; they do not approve the unresolved production forest-class crosswalk. The manifest cannot authorize processing or close a Phase 2 gate. A changed canonical parameter hash requires a new method version plus a marker that binds the old and new hashes and requires both recomputation and a release note. An unchanged parameter set cannot be relabelled with a new method version or carry a change marker.

The executable fixture batch binds this exact file checksum, method version, and parameter hash. Its current vectorization capability is four-neighbour grouping with a one-pixel minimum, no simplification, and non-dissolved cell polygons; the checked parameters state exactly those limits.

The focused checks also lock the exact 50 percent matching boundary, deterministic input-order tie behavior, and fail-closed precedence inputs. These are pure policy checks; they do not process the national change spine, acquire data, create a release, or make a production claim.
