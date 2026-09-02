import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRidingIntervalRelease,
  ridingIntervalMeasurements,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/riding-intervals.ts";
import {
  intervalAtWindowIndex,
  intervalWindowIndex,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/interval.ts";
import {
  validateIntervalRelease,
  validateServerOnly,
  spanOrder,
  windowIndex,
} from "../scripts/check-interval-release.mjs";

const release = JSON.parse(
  await (await import("node:fs/promises")).readFile(
    new URL("../data/phase3-riding-interval-measurements.json", import.meta.url),
    "utf8",
  ),
);
const REPO_ROOT = new URL("..", import.meta.url).pathname;

const clone = () => JSON.parse(JSON.stringify(release));

test("the shipped release passes its own contract", () => {
  assert.equal(validateIntervalRelease(release), 774);
  validateServerOnly(REPO_ROOT);
});

test("the release order and the reader's arithmetic agree on all 741 spans", () => {
  const order = spanOrder();
  assert.equal(order.length, 741);
  order.forEach((span: { fromYear: number; toYear: number }, index: number) => {
    assert.equal(windowIndex(span.fromYear, span.toYear), index);
    // The checker and the TypeScript derive the index separately. Comparing
    // them here is what makes a change to either one visible.
    assert.equal(intervalWindowIndex(span), index);
    assert.deepEqual(intervalAtWindowIndex(index), span);
  });
  assert.deepEqual(order[0], { fromYear: 1984, toYear: 1985 });
  assert.deepEqual(order[740], { fromYear: 2021, toYear: 2022 });
});

test("the annual span reproduces the annual product it was checked against", () => {
  const annual = ridingIntervalMeasurements({ fromYear: 2021, toYear: 2022 });
  assert.equal(annual.length, 774);
  const avalon = annual.find((row) => row.boundaryId === "CA-10001");
  assert.ok(avalon);
  assert.equal(avalon.fromYear, 2021);
  assert.equal(avalon.toYear, 2022);
  // One annual step, so nothing can be lost twice inside it.
  for (const row of annual) {
    assert.equal(row.summedLossHectares, row.knownObservedSubtotalHectares);
  }
});

test("a wider span never reports less than the years inside it, and never a share of the sum", () => {
  const narrow = ridingIntervalMeasurements({ fromYear: 2000, toYear: 2001 });
  const wide = ridingIntervalMeasurements({ fromYear: 2000, toYear: 2010 });
  assert.equal(narrow.length, wide.length);
  let recurring = 0;
  for (let index = 0; index < wide.length; index += 1) {
    assert.equal(narrow[index].boundaryId, wide[index].boundaryId);
    assert.ok(wide[index].knownObservedSubtotalHectares! >= narrow[index].knownObservedSubtotalHectares!);
    assert.ok(wide[index].summedLossHectares >= wide[index].knownObservedSubtotalHectares!);
    if (wide[index].summedLossHectares > wide[index].knownObservedSubtotalHectares!) recurring += 1;
    assert.equal("summedLossPercent" in wide[index], false);
  }
  // Ground lost more than once inside one span is the whole reason the two
  // quantities carry different names. If this ever reaches zero, the naming
  // distinction has stopped describing the data and should be revisited.
  assert.ok(recurring > 0, "no district lost the same ground twice in 2000 to 2010");
});

test("a district reports a share only where its whole area was mapped", () => {
  for (const span of [{ fromYear: 1984, toYear: 1985 }, { fromYear: 1990, toYear: 1998 }]) {
    for (const row of ridingIntervalMeasurements(span)) {
      const complete = row.coverage === "complete";
      assert.equal(complete, row.observedLossPercent !== null);
      assert.equal(complete, row.observedLossHectares !== null);
      if (complete) assert.ok(row.observedLossPercent! >= 0 && row.observedLossPercent! <= 100);
    }
  }
});

test("the loader fails closed on a broken envelope", () => {
  for (const [name, mutate] of [
    ["schema", (d: Record<string, unknown>) => { d.schema = "witness-tree/other/1"; }],
    ["span count", (d: Record<string, unknown>) => { d.spanCount = 740; }],
    ["cell size", (d: Record<string, unknown>) => { d.cellHectares = 0.09001; }],
    ["a promoted claim", (d: { claims: Record<string, boolean> }) => { d.claims.released = true; }],
    ["the summed-percentage rule", (d: Record<string, unknown>) => { d.summedPercentAllowed = true; }],
    ["net change", (d: Record<string, unknown>) => { d.netChangeIncluded = true; }],
    ["a missing jurisdiction", (d: { jurisdictions: unknown[] }) => { d.jurisdictions.pop(); }],
  ] as const) {
    const mutated = clone();
    mutate(mutated);
    assert.throws(() => parseRidingIntervalRelease(mutated), /invalid release envelope|unexpected jurisdiction/, name);
  }
});

test("the loader fails closed on a district that breaks a span invariant", () => {
  const short = clone();
  short.jurisdictions[0].districts[0].unionLossCellDeltas.pop();
  assert.throws(() => parseRidingIntervalRelease(short), /invalid contract/);

  const impossible = clone();
  const district = impossible.jurisdictions[0].districts[0];
  // A first difference larger than every annual count in its own span makes the
  // union exceed the sum, which means a cell was counted fewer times than once.
  district.unionLossCellDeltas[0] = district.knownForestCellsByStartYear[0] + 1;
  assert.throws(() => parseRidingIntervalRelease(impossible), /breaks a span invariant/);
});

test("the release checker rejects a document whose span order has drifted", () => {
  const drifted = clone();
  drifted.annualStepCount = 37;
  assert.throws(() => validateIntervalRelease(drifted), /741 spans over 38 annual steps/);

  const fabricated = clone();
  fabricated.inputs[0].sha256 = "not-a-checksum";
  assert.throws(() => validateIntervalRelease(fabricated), /by checksum/);

  const overcounted = clone();
  const target = overcounted.jurisdictions[0].districts[0];
  target.annualLossCells = target.annualLossCells.map(() => 0);
  target.unionLossCellDeltas[0] = 1;
  assert.throws(() => validateIntervalRelease(overcounted), /exceeds the yearly losses added together/);
});
