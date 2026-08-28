# Bulk downloads

The corrected bounded four-province 2020-2022 technical-preview v2 release is
publicly available as an immutable CSV and GeoPackage pair. It carries the
required bilingual modification notice and explicit bounded supersession
decision. A GitHub-hosted Linux runner, separate from the producing machine,
retrieved and hashed the exact CSV, GeoPackage, and public manifest. The durable
receipt is `data/bulk-download-publication.json`, and
`npm run check:bulk-download-publication` validates the complete chain.

The release contains province-level aggregates for Quebec, Ontario, Alberta,
and British Columbia. It is not per-cell forest-loss geometry and does not
complete the formal Phase 2 production gate. Other download contracts in the
test suite remain illustrative fixtures and do not acquire release status from
this bounded publication.
