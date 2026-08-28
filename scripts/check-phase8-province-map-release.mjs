import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
const release = load("phase8-province-map-release.json");
const delivery = load("phase8-public-delivery-evidence.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const repoBytes = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url));

assert.equal(release.status, "published-verified-technical-preview");
assert.deepEqual(release.scope.provinceIds, ["24", "35", "48", "59"]);
assert.equal(release.scope.featureCount, 4);
assert.equal(
  sha256(repoBytes(release.inputs.admissionRecord.path)),
  release.inputs.admissionRecord.sha256,
);
assert.equal(
  sha256(repoBytes(release.inputs.zonalEvidence.path)),
  release.inputs.zonalEvidence.sha256,
);
const admission = JSON.parse(repoBytes(release.inputs.admissionRecord.path));
const zonal = JSON.parse(repoBytes(release.inputs.zonalEvidence.path));
assert.equal(
  admission.evidenceBindings.zonalAggregate.sha256,
  release.inputs.zonalEvidence.sha256,
);
assert.equal(zonal.artifacts.output.sha256, release.inputs.aggregate.sha256);
assert.equal(
  release.inputs.zonalEvidence.outputSha256,
  release.inputs.aggregate.sha256,
);
assert.equal(release.output.sha256, delivery.object.sha256);
assert.equal(
  release.output.sha256,
  delivery.externalVerification.fullReadbackSha256,
);
assert.equal(release.output.byteLength, delivery.object.byteLength);
assert.equal(release.output.byteLength, 289166);
assert.equal(
  release.browserCompatibilityOutput.sha256,
  delivery.browserCompatibilityObject.sha256,
);
assert.equal(
  release.browserCompatibilityOutput.byteLength,
  delivery.browserCompatibilityObject.byteLength,
);
assert.equal(release.browserCompatibilityOutput.featureCount, 4);
assert.equal(
  release.browserCompatibilityOutput.displayGeometry.purpose,
  "display-only province boundaries",
);
assert.equal(
  release.browserCompatibilityOutput.displayGeometry.parentSha256,
  "aec8513a57c2360bf5a4c6faecc750155ba16f16f588b28773414cebde1cbd11",
);
assert.equal(
  release.browserCompatibilityOutput.displayGeometry
    .parentSimplifyToleranceMetres,
  5000,
);
assert.equal(
  release.browserCompatibilityOutput.displayGeometry
    .minimumExteriorRingAreaSquareDegrees,
  0.001,
);
assert.equal(
  release.browserCompatibilityOutput.displayGeometry.smallIslandsOmitted,
  true,
);
assert.equal(
  delivery.browserCompatibilityObject.fullReadbackSha256,
  release.browserCompatibilityOutput.sha256,
);
assert.equal(release.claims.exactInputsVerified, true);
assert.equal(release.claims.archiveStructureVerified, true);
assert.equal(release.claims.fullPublicReadbackChecksumVerified, true);
assert.equal(release.claims.technicalPreviewEligible, true);
assert.equal(release.claims.phase2ProductionGateComplete, false);
assert.equal(release.claims.perCellGeometryMaterialized, false);
assert.match(release.claimLimit, /not per-cell|does not complete/i);
assert.equal(delivery.region, "ca-central-1");
assert.equal(new URL(delivery.publicUrl).protocol, "https:");
assert.equal(delivery.publicUrl.includes(delivery.object.sha256), true);
assert.equal(delivery.externalVerification.rangeStatus, 206);
assert.equal(
  delivery.externalVerification.contentRange,
  `bytes 0-16383/${release.output.byteLength}`,
);
assert.equal(delivery.externalVerification.directS3ExactObjectStatus, 403);
assert.equal(delivery.externalVerification.pmtilesVerifyPassed, true);
assert.equal(delivery.separation.rawArchiveBucketIsOrigin, false);
assert.equal(delivery.separation.deliveryBucketDirectPublicRead, false);
assert.equal(delivery.separation.cloudFrontOriginAccessControl, true);
assert.equal(delivery.separation.releasePutRequiresIfNoneMatch, true);
assert.equal(delivery.separation.unconditionalExistingKeyPutDenied, true);
assert.equal(
  delivery.separation.conditionalExistingKeyPutPreconditionFailed,
  true,
);
assert.equal(delivery.separation.releaseDeleteDenied, true);

if (process.argv.includes("--verify-external")) {
  const rootIndex = process.argv.indexOf("--data-root");
  assert.notEqual(rootIndex, -1, "--verify-external requires --data-root");
  const dataRoot = process.argv[rootIndex + 1];
  assert.ok(dataRoot, "--data-root value is required");
  assert.equal(
    sha256(
      readFileSync(
        `${dataRoot}/${release.inputs.externalManifest.relativePath}`,
      ),
    ),
    release.inputs.externalManifest.sha256,
  );
  assert.equal(
    sha256(
      readFileSync(
        `${dataRoot}/${release.inputs.browserCompatibilityManifest.relativePath}`,
      ),
    ),
    release.inputs.browserCompatibilityManifest.sha256,
  );
}

if (process.argv.includes("--verify-live")) {
  const range = await fetch(delivery.publicUrl, {
    headers: {
      Range: delivery.externalVerification.rangeRequested,
      Origin: delivery.externalVerification.origin,
    },
  });
  assert.equal(range.status, 206);
  assert.equal(
    range.headers.get("content-range"),
    delivery.externalVerification.contentRange,
  );
  assert.equal(
    range.headers.get("access-control-allow-origin"),
    delivery.externalVerification.accessControlAllowOrigin,
  );
  assert.equal(
    (await range.arrayBuffer()).byteLength,
    delivery.externalVerification.contentLength,
  );
  const full = await fetch(delivery.publicUrl);
  assert.equal(full.status, 200);
  assert.equal(
    sha256(Buffer.from(await full.arrayBuffer())),
    release.output.sha256,
  );
  const compatible = await fetch(
    delivery.browserCompatibilityObject.publicUrl,
    { headers: { Origin: delivery.externalVerification.origin } },
  );
  assert.equal(compatible.status, 200);
  assert.equal(compatible.headers.get("access-control-allow-origin"), "*");
  assert.equal(
    sha256(Buffer.from(await compatible.arrayBuffer())),
    release.browserCompatibilityOutput.sha256,
  );
}
console.log("Phase 8 province map release and delivery evidence passed.");
