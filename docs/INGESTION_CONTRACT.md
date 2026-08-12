# Ingestion contract

This contract validates fixtures only. Every fixture has `status: "example"`
and uses `example.local`; it is not a production data claim and never fetches a
network source.

Before an event is accepted, its source contract must provide bilingual source
explanation, registered licence ID, field mapping, boundary edition, source and
retrieval versions, and a SHA-256 raw checksum. A normalized event must carry
an accepted category, authoritative organisation and role, date/year, source
version, valid polygon and hectares, matching provenance, confidence, and
coverage grade.

Official records remain retained even if they have no corresponding detected
change. The contract rejects corrupt geometry, invalid dates or years, invalid
areas, absent licence/checksum/localization, and any `Unknown 0` payload.
