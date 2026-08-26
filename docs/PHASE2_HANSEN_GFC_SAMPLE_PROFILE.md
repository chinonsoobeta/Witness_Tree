# Phase 2 Hansen GFC v1.12 sample profile

The checksum-bound sample record at [`data/phase2-hansen-gfc-v1.12-sample-profile.json`](../data/phase2-hansen-gfc-v1.12-sample-profile.json) retains one public `lossyear` tile intersecting each of BC, Alberta, Ontario and Québec. The official UMD download page identifies Global Forest Change version 1.12 as CC BY 4.0 and requires the display credit `Source: Hansen/UMD/Google/USGS/NASA`.

It is only a reproducible cross-check input. Hansen describes gross forest-cover loss, not harvest or fire attribution, and these tiles are samples rather than complete provincial coverage. No numbers, accuracy assertion, admission, release or production claim follows from staging them. Any later 2000–2022 comparison must limit the Hansen codes to 1–22 and record the matching forest mask, boundaries, resampling, area calculation and uncertainty.

Run `node scripts/check-phase2-hansen-gfc-v1.12-sample-profile.mjs` to recheck the four local artifacts.
