# Superseded unsent owner reply draft for FOR-2026-056834

Status: **SUPERSEDED. THIS DRAFT WAS NEVER SENT.**

The owner sent a different reply on 2026-09-01 at 08:21:13 PDT. The sent reply confirmed successful retrieval of both complete provincial layers, described the timestamp limitation as feedback and expressly not as a continued request, and did not explicitly authorize withdrawal. The verified non-sensitive send facts are recorded in data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json.

Historical response deadline: **2026-09-01.**

Subject: FOI Request FOR-2026-056834 - public export verification and remaining timestamp question

Hello,

Thank you for identifying the BC Data Catalogue records for:

- WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW
- WHSE_FOREST_TENURE.FTEN_HARVEST_AUTH_POLY_SVW

I verified that both records are published under the Open Government Licence - British Columbia. I also completed a read-only WFS 2.0 profile of the exact public views in EPSG:3005, using JSON pages of 10,000 records sorted by OBJECTID.

The public WFS returned 222,618 cutblock records and 71,876 harvesting-authority records. For each view, the result count was unchanged before and after paging and matched both the retrieved feature count and distinct OBJECTID count, with zero duplicate IDs and zero missing records. The DescribeFeatureType definitions matched the catalogue schema exactly for both views. The extract contained the published attribute set and geometries, with province-wide extents and all 23 reported administrative districts. Two cutblocks and 25 harvesting authorities had null geometry; the latter comprised 21 retired and 4 active records. The profile establishes exact schema equality, but does not independently prove that every declared column was non-null somewhere in the extract.

This substantially satisfies the substance of the request for complete machine-readable records, attributes, geometry, and provincial coverage. It does not verify the requested one-timestamp coherence. The 31 WFS pages carried 31 distinct response timestamps, from 2026-09-01T15:04:49.139Z through 2026-09-01T15:10:41.229Z. The catalogue Custom Download resource is indirect and exposes no direct package URL, so I could not verify a direct full-province package or a coherent extract captured at one stated timestamp.

Could the ministry please:

1. provide one extract of both exact views captured at a single stated timestamp; or
2. confirm that no one-timestamp extract exists and that the separately timestamped public WFS pages are the most coherent complete export available?

Until that point is clarified, I am not confirming withdrawal of FOR-2026-056834.

Regards,

[Owner name]

## Historical boundary

Do not send this draft. It is retained only to distinguish the prepared wording from the materially different reply the owner actually sent.
