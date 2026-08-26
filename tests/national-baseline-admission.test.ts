import assert from "node:assert/strict";
import test from "node:test";
import { admitVerifiedImmutableRaster, planNationalBaseline, VLCE2_SOURCE_ID }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/pipeline/national-baseline.ts";
import { RASTER_GRID_CRS_ID, RASTER_GRID_CRS_PROJ4 }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/grid/types.ts";
import type { ArchivePromotionManifest } from "../lib/archive-staging/types";

const header = (year: number) => ({ year, crsId: RASTER_GRID_CRS_ID, crsProj4: RASTER_GRID_CRS_PROJ4, geotransform: [-2660910.524, 30, 0, 2998848.1105, 0, -30] as const, width: 193936, height: 128340, bandCount: 1 as const, dataType: "Byte" as const, noDataValue: 255, resampled: false as const });

function manifest(year: number): ArchivePromotionManifest {
  const staged = { storageState: "local-staging" as const, immutableObjectStorage: false as const, production: false as const, sourceId: VLCE2_SOURCE_ID, sourceVersion: "v2", retrievedAt: "2026-08-12T17:07:15Z", byteLength: 100, sha256: "a".repeat(64), crc64nvme: "0123456789abcdef", originalFilename: `CA_forest_VLCE2_${year}.zip`, publisher: "Natural Resources Canada", catalogueUrl: "https://example.test/catalogue", requestedUrl: "https://example.test/archive", licenceId: "ogl-canada-2.0", licenceUrl: "https://example.test/licence", requiredAttribution: "Contains information licensed under the Open Government Licence – Canada.", changesNotice: "Unchanged." };
  const prefix = `raw/${staged.sourceId}/${staged.sourceVersion}/2026-08-12T17-07-15Z/${staged.sha256}`;
  return { status: "staging-promotion", snapshotId: `${staged.sourceId}:${staged.sourceVersion}:${staged.retrievedAt}:${staged.sha256}`, staged, payloadKey: `${prefix}/payload/${staged.originalFilename.toLowerCase()}`, manifestKey: `${prefix}/manifest.json`, promotion: { state: "remote-verified", reviewer: "Reviewer", reviewedAt: "2026-08-12T17:08:00Z" }, remote: { bucketId: "canadian-immutable-bucket", region: { countryCode: "CA", regionId: "ca-central-1", evidenceReference: "test evidence" }, payloadVersionId: "payload-version", manifestVersionId: "manifest-version", remoteByteLength: 100, remoteChecksum: { checksumType: "full-object", algorithm: "crc64nvme", digest: "0123456789abcdef" }, retentionMode: "compliance", retentionUntil: "2033-08-12T00:00:00Z" } };
}

const vat = (year: number) => ({ year, byteLength: 98, recordCount: 0, counts: {} });

test("only an immutable, remotely verified VLCE2 raster on the canonical grid is admitted", () => {
  const admitted = admitVerifiedImmutableRaster({ promotion: manifest(1991), header: header(1991), vat: vat(1991) });
  assert.equal(admitted.year, 1991);
  assert.equal(admitted.productionEligible, false);
  assert.equal(admitted.classList.kind, "unknown");
  assert.match(admitted.classList.kind === "unknown" ? admitted.classList.reason.en : "", /published empty/);

  const localOnly = manifest(1991);
  const rejected = { ...localOnly, promotion: { state: "uploaded" as const } };
  assert.throws(() => admitVerifiedImmutableRaster({ promotion: rejected, header: header(1991), vat: vat(1991) }), /remote-verified/);
  assert.throws(() => admitVerifiedImmutableRaster({ promotion: { ...manifest(1991), staged: { ...manifest(1991).staged, sourceId: "other-source" } }, header: header(1991), vat: vat(1991) }), /only accepts/);
  assert.throws(() => admitVerifiedImmutableRaster({ promotion: manifest(1991), header: { ...header(1991), width: 1 }, vat: vat(1991) }), /canonical VLCE2 grid/);
});

test("the 2005 VAT hazard remains Unknown and planning creates no public or production result", () => {
  const plan = planNationalBaseline([{ promotion: manifest(2005), header: header(2005), vat: vat(2005) }]);
  assert.equal(plan.status, "local-planning-only");
  assert.equal(plan.productionEligible, false);
  assert.deepEqual(plan.publicResults, []);
  assert.equal(plan.inputs[0]?.classList.kind, "unknown");
  assert.match(plan.limitation, /No raster pixels, boundaries, aggregates, tiles, downloads, or public results/);
});

test("each remaining admission guard refuses on its own", () => {
  // A 1992 archive presented as the 1991 raster would silently mislabel the series. The
  // promotion itself is internally consistent, so only the year guard can refuse it: the
  // upstream key contract checks the payload key against the filename, not against a year.
  const wrongYear = manifest(1992);
  assert.throws(
    () => admitVerifiedImmutableRaster({ promotion: wrongYear, header: header(1991), vat: vat(1991) }),
    /matching immutable VLCE2 archive filename/,
  );

  // A sidecar from another year would attach the wrong class list to the raster.
  assert.throws(
    () => admitVerifiedImmutableRaster({ promotion: manifest(1991), header: header(1991), vat: vat(1992) }),
    /does not match raster year/,
  );

  // A remote-verified promotion with no payload version ID is refused before this module
  // sees it: validateRemote already requires both provider version IDs for that state. The
  // missing-version-ID throw in admitVerifiedImmutableRaster is therefore unreachable through
  // this entry point and narrows an optional type rather than guarding real input. Asserting
  // it here would only prove the upstream contract, so this test states the boundary instead.
  const noVersion = manifest(1991);
  assert.throws(
    () => admitVerifiedImmutableRaster({ promotion: { ...noVersion, remote: { ...noVersion.remote!, payloadVersionId: undefined } }, header: header(1991), vat: vat(1991) }),
    /provider version IDs/,
  );

  // Two snapshots for one year would make the plan's year set ambiguous.
  const one = { promotion: manifest(1991), header: header(1991), vat: vat(1991) };
  assert.throws(() => planNationalBaseline([one, one]), /Only one immutable raster snapshot/);
});
