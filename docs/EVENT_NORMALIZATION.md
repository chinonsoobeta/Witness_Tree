# Event normalization

This module contains example fixtures only. It maps FTA lifecycle status to
neutral public categories: `PENDING` becomes Planned/Planifié, `ACTIVE` becomes
Authorised/Autorisé, and `RETIRED` becomes Recorded harvest/Récolte consignée.

Tenure is always Crown, private, federal, reserve, or unknown. Subtype is
salvage, partial-cut, thinning, or undetermined when the source does not say.
Reserve records are retained but never rankable.

Every province summary records the boundary edition used to calculate it. To
reproduce an earlier result after another boundary edition loads, compute again
with that recorded edition. The normalizer rejects corrupt IDs and years,
non-positive hectares, unsupported lifecycle/tenure/subtype values, and
duplicate records.
