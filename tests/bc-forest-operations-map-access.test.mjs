import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateBcForestOperationsMapAccess } from "../scripts/check-bc-forest-operations-map-access.mjs";

const record = JSON.parse(readFileSync(new URL("../data/bc-forest-operations-map-access.json", import.meta.url), "utf8"));

test("BC Forest Operations Map records Access Only evidence without acquiring public-service data", () => {
  assert.equal(validateBcForestOperationsMapAccess(record), record);
  assert.equal(record.authoritativeService.observedLayer.featureCount, 47654);
  assert.equal(record.blocker.rawDownloadPerformed, false);
  assert.equal(record.blocker.productionEligible, false);
  assert.equal(record.permissionRequest.status, "form-submitted-clarification-replied-permission-pending");
  assert.equal(record.permissionRequest.authorizationOutcome, "pending-no-permission-or-access");
});

test("BC Forest Operations Map fails closed if access-only evidence is treated as staging or authorization", () => {
  assert.throws(() => validateBcForestOperationsMapAccess({ ...record, catalogue: { ...record.catalogue, licenceTitle: "Open Government Licence - British Columbia" } }), /Access Only/);
  assert.throws(() => validateBcForestOperationsMapAccess({ ...record, blocker: { ...record.blocker, rawDownloadPerformed: true } }), /must not claim acquisition/);
  assert.throws(() => validateBcForestOperationsMapAccess({ ...record, blocker: { ...record.blocker, productionEligible: true } }), /must not claim acquisition/);
  assert.throws(() => validateBcForestOperationsMapAccess({ ...record, permissionRequest: { ...record.permissionRequest, authorizationOutcome: "permission-granted" } }), /permission and access must remain pending/i);
  assert.throws(() => validateBcForestOperationsMapAccess({ ...record, permissionRequest: { ...record.permissionRequest, submittedCatalogueUrl: record.catalogue.url } }), /exact FOM form/i);
});
