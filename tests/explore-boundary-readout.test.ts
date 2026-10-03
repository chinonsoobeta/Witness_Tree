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
    intervalLabel: "2021–2022",
    coverage: "Fully mapped",
    normalizedShare: "1.25%",
    absoluteLoss: "50 ha",
  });
  assert.equal(boundaryReadout(selection("provincial-ridings"), [complete], "en", SPAN).kind, "riding-measurement");
  const wrongJurisdiction = { ...complete, jurisdiction: "QC" };
  const unmatched = boundaryReadout(selection("federal-ridings"), [wrongJurisdiction], "en", SPAN);
  assert.equal(unmatched.kind, "riding-measurement");
  assert.equal(unmatched.coverage, "No figure for this area");
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

test("a complete figure stands alone, with no known subtotal beside it", () => {
  const withSubtotal = { ...complete, knownObservedSubtotalHectares: 50 };
  const riding = boundaryReadout(selection("federal-ridings"), [withSubtotal], "en", SPAN);
  assert.equal(riding.kind === "riding-measurement" && riding.knownObservedSubtotal, undefined);
  // An admitted economic region is complete coverage too, so the same holds there.
  const region = boundaryReadout(selection("economic-regions"), [{
    ...withSubtotal,
    overlay: "economic-regions",
    admittedUnknownPercent: 0.42,
  }], "en", SPAN);
  assert.equal(region.kind === "riding-measurement" && region.knownObservedSubtotal, undefined);
});

test("watersheds remain boundary-only even when a matching riding record exists", () => {
  assert.deepEqual(boundaryReadout(selection("watersheds"), [complete], "en", SPAN), {
    kind: "boundary-only",
    note: "Reference boundary only. There is no forest-loss figure for this area.",
  });
});

test("economic regions and census subdivisions join only their own overlay's figures", () => {
  for (const overlay of ["economic-regions", "census-subdivisions"] as const) {
    // A riding's figure never answers for a region that happens to share its id.
    const other = boundaryReadout(selection(overlay), [complete], "en", SPAN);
    assert.equal(other.kind === "riding-measurement" && other.coverage, "No figure for this area");
    const own = boundaryReadout(selection(overlay), [{ ...complete, overlay }], "en", SPAN);
    assert.equal(own.kind === "riding-measurement" && own.normalizedShare, "1.25%");
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
  assert.equal(readout.kind === "riding-measurement" && readout.intervalLabel, "1990–1998");
  const missing = boundaryReadout(selection("federal-ridings"), [], "fr", { fromYear: 1990, toYear: 1998 });
  assert.equal(missing.kind === "riding-measurement" && missing.intervalLabel, "1990–1998");
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

test("an admitted region or riding names its unmapped share, and only a complete one below 1% may admit one", () => {
  const region: RidingBoundaryMeasurement = { ...complete, overlay: "economic-regions", admittedUnknownPercent: 0.42 };
  const regionSelection = selection("economic-regions");
  assert.equal(
    boundaryReadout(regionSelection, [region], "en", SPAN).kind === "riding-measurement" &&
      (boundaryReadout(regionSelection, [region], "en", SPAN) as { coverage: string }).coverage,
    "Almost fully mapped; 0.42% of the forest has no satellite data",
  );
  const fr = boundaryReadout(regionSelection, [region], "fr", SPAN) as { coverage: string; normalizedShare: string };
  assert.match(fr.coverage, /^Presque entièrement cartographiée\u202F; 0,42\s?% de la forêt n’a aucune donnée satellitaire$/);
  assert.match(fr.normalizedShare, /^1,25\s?%$/);
  const riding = boundaryReadout(selection("federal-ridings"), [{ ...complete, admittedUnknownPercent: 0.42 }], "en", SPAN) as { coverage: string };
  assert.equal(riding.coverage, "Almost fully mapped; 0.42% of the forest has no satellite data");
  assert.throws(() => boundaryReadout(regionSelection, [{ ...region, admittedUnknownPercent: 1 }], "en", SPAN), /below 1%/);
  assert.throws(() => boundaryReadout(regionSelection, [{
    ...region,
    coverage: "partial-with-unknown",
    observedLossPercent: null,
    observedLossHectares: null,
  }], "en", SPAN), /complete area/);
});
