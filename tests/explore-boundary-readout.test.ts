import assert from "node:assert/strict";
import test from "node:test";
import {
  boundaryReadout,
  type BoundarySelection,
  type RidingBoundaryMeasurement,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/boundary-readout.ts";

const selection = (overlay: BoundarySelection["overlay"]): BoundarySelection => ({
  overlay,
  boundaryId: "35001",
  jurisdiction: "ON",
  name: "Example riding",
});
const complete: RidingBoundaryMeasurement = {
  overlay: "federal-ridings",
  boundaryId: "35001",
  jurisdiction: "ON",
  coverage: "complete",
  observedLossPercent: 1.25,
  observedLossHectares: 50,
};

test("riding readout joins on overlay, jurisdiction, and boundary id with share before hectares", () => {
  assert.deepEqual(boundaryReadout(selection("federal-ridings"), [complete], "en"), {
    kind: "riding-measurement",
    interval: "2021–2022",
    coverage: "Complete mapped coverage",
    normalizedShare: "1.25%",
    absoluteLoss: "50 ha",
  });
  assert.equal(boundaryReadout(selection("provincial-ridings"), [complete], "en").kind, "riding-measurement");
  const wrongJurisdiction = { ...complete, jurisdiction: "QC" };
  const unmatched = boundaryReadout(selection("federal-ridings"), [wrongJurisdiction], "en");
  assert.equal(unmatched.kind, "riding-measurement");
  assert.equal(unmatched.coverage, "No local riding measurement");
});

test("incomplete and unmapped riding coverage never turn unknown totals into zero", () => {
  for (const coverage of ["partial-with-unknown", "none-mapped"] as const) {
    const readout = boundaryReadout(selection("federal-ridings"), [{
      ...complete,
      coverage,
      observedLossPercent: null,
      observedLossHectares: null,
      knownObservedSubtotalHectares: 12.5,
    }], "en");
    assert.equal(readout.kind, "riding-measurement");
    assert.equal(readout.normalizedShare, "Unknown");
    assert.equal(readout.absoluteLoss, "Unknown");
    assert.equal(readout.knownObservedSubtotal, "12.5 ha");
    assert.doesNotMatch(`${readout.normalizedShare} ${readout.absoluteLoss}`, /0/);
  }
});

test("economic regions and watersheds remain boundary-only even when a matching riding record exists", () => {
  for (const overlay of ["economic-regions", "watersheds"] as const) {
    assert.deepEqual(boundaryReadout(selection(overlay), [complete], "en"), {
      kind: "boundary-only",
      note: "Reference boundary only. No forest-loss measurement is available for this geography.",
    });
  }
});

test("the contract rejects a fabricated complete value for incomplete coverage", () => {
  assert.throws(() => boundaryReadout(selection("federal-ridings"), [{
    ...complete,
    coverage: "partial-with-unknown",
  }], "en"), /Only complete riding coverage/);
});
