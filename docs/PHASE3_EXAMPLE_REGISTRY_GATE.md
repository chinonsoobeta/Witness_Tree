# Phase 3 example registry gate

The current Phase 3 registry is deliberately synthetic **Big Four test coverage**, not the required real national registry. It has **32** place records: the exact cross-product of the eight specified place types and BC, AB, ON, and QC. Each has one deterministic example location record. Route generation therefore has **128** localized static page instances: `(32 places + 32 locations) × English/French`.

`tests/phase3-example-registry.test.tsx` is included by the repository's `test:unit` glob, which is a required CI step. The test and `validatePhase3ExampleRegistry` fail if a province/type pair is absent or duplicated, a location loses containment, a record ceases to be an example, provenance is incomplete, or an Unknown loses either language, gains a number, or renders as zero.

This is a structural and bilingual-release gate only. It does not turn fixtures into real data, establish production admission, validate real geometry, complete external usability or accessibility work, or authorize deployment.
