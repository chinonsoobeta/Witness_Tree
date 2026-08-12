# Records contract

`lib/records` defines runtime validation for example-labelled normalized source records, forest events, boundary editions, and aggregates. It imports existing policy types for evidence, confidence, coverage, licences, place types, and the NFI definition version. It does not acquire, store, or claim production data.

Events require source lineage and ingest ID, original and normalized geometry with CRS, finite area and positional confidence, complete observation dates, lifecycle/subtype/tenure, forest context, optional organisation and recovery detail, bilingual display/limitations, and a method version. Aggregates require an auditable nonempty event-ID set and denominator/range/version/coverage/boundary references.
