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
  fromYear: 2021,
  toYear: 2022,
  observedLossPercent: 1.25,
  observedLossHectares: 50,
};

/** The span every fixture below is measured over, named once. */
const SPAN = { fromYear: 2021, toYear: 2022 };

test("riding readout joins on overlay, jurisdiction, and boundary id with share before hectares", () => {
  assert.deepEqual(boundaryReadout(selection("federal-ridings"), [complete], "en", SPAN), {
    kind: "riding-measurement",
    interval: "2021–2022",
    coverage: "Complete mapped coverage",
    normalizedShare: "1.25%",
    absoluteLoss: "50 ha",
  });
  assert.equal(boundaryReadout(selection("provincial-ridings"), [complete], "en", SPAN).kind, "riding-measurement");
  const wrongJurisdiction = { ...complete, jurisdiction: "QC" };
  const unmatched = boundaryReadout(selection("federal-ridings"), [wrongJurisdiction], "en", SPAN);
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
    }], "en", SPAN);
    assert.equal(readout.kind, "riding-measurement");
    assert.equal(readout.normalizedShare, "Unknown");
    assert.equal(readout.absoluteLoss, "Unknown");
    assert.equal(readout.knownObservedSubtotal, "12.5 ha");
    assert.doesNotMatch(`${readout.normalizedShare} ${readout.absoluteLoss}`, /0/);
  }
});

test("economic regions and watersheds remain boundary-only even when a matching riding record exists", () => {
  for (const overlay of ["economic-regions", "watersheds"] as const) {
    assert.deepEqual(boundaryReadout(selection(overlay), [complete], "en", SPAN), {
      kind: "boundary-only",
      note: "Reference boundary only. No forest-loss measurement is available for this geography.",
    });
  }
});

test("the contract rejects a fabricated complete value for incomplete coverage", () => {
  assert.throws(() => boundaryReadout(selection("federal-ridings"), [{
    ...complete,
    coverage: "partial-with-unknown",
  }], "en", SPAN), /Only complete riding coverage/);
});

test("a measurement from another span is refused rather than shown under the wrong years", () => {
  assert.throws(
    () => boundaryReadout(selection("federal-ridings"), [complete], "en", { fromYear: 1990, toYear: 1998 }),
    /different span than the one on display/,
  );
});

test("the readout names the span it was given, not a fixed pair of years", () => {
  const wide = { ...complete, fromYear: 1990, toYear: 1998 };
  const readout = boundaryReadout(selection("federal-ridings"), [wide], "en", { fromYear: 1990, toYear: 1998 });
  assert.equal(readout.kind === "riding-measurement" && readout.interval, "1990–1998");
  const missing = boundaryReadout(selection("federal-ridings"), [], "fr", { fromYear: 1990, toYear: 1998 });
  assert.equal(missing.kind === "riding-measurement" && missing.interval, "1990–1998");
});

test("the summed figure appears only where it exceeds the forest lost at least once", () => {
  const base = { ...complete, knownObservedSubtotalHectares: 50 };
  const equal = boundaryReadout(selection("federal-ridings"), [{ ...base, summedLossHectares: 50 }], "en", SPAN);
  assert.equal(equal.kind === "riding-measurement" && equal.summedLoss, undefined);
  const recurring = boundaryReadout(selection("federal-ridings"), [{ ...base, summedLossHectares: 62.5 }], "en", SPAN);
  assert.equal(recurring.kind === "riding-measurement" && recurring.summedLoss, "62.5 ha");
  assert.equal(
    recurring.kind === "riding-measurement" && recurring.summedLossLabel,
    "Yearly losses added together",
  );
  const french = boundaryReadout(selection("federal-ridings"), [{ ...base, summedLossHectares: 62.5 }], "fr", SPAN);
  assert.equal(
    french.kind === "riding-measurement" && french.summedLossLabel,
    "Pertes annuelles additionnées",
  );
});

test("a summed figure below the union is a window mismatch and is refused", () => {
  assert.throws(
    () => boundaryReadout(selection("federal-ridings"), [{
      ...complete,
      knownObservedSubtotalHectares: 50,
      summedLossHectares: 40,
    }], "en", SPAN),
    /cannot fall below the forest lost at least once/,
  );
});

test("a span that does not end after it starts is refused", () => {
  assert.throws(
    () => boundaryReadout(selection("federal-ridings"), [{ ...complete, toYear: 2021 }], "en", { fromYear: 2021, toYear: 2021 }),
    /span that ends after it starts/,
  );
});
