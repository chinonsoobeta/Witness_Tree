import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/*
 * Turns two store artifacts into the readback record that lives in the
 * repository, so the province series can be checked without the data root
 * attached. Both artifacts are bound by digest, not by path.
 *
 * The two artifacts do not share a denominator, and that is deliberate rather
 * than a defect. Each annual row measures loss against its own from-year
 * forest mask, which moves as forest regrows. The cumulative row measures a
 * union against the fixed 1984 mask. Summing the annual rows therefore does
 * not reproduce the cumulative figure, and nothing downstream may present
 * them as if it did. This record carries both bases explicitly so the gate
 * can hold that line.
 */

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const ANNUAL = path.join(DATA_ROOT, "derived/phase2-annual-province-zonal-v2/annual-province-zonal-1984-2022.json");
const CUMULATIVE = path.join(DATA_ROOT, "derived/phase2-cumulative-province-zonal-v1/cumulative-province-zonal-1984-2022.json");
const ANNUAL_RUNNER = "scripts/phase2_annual_zonal_aggregate_v2.py";
const CUMULATIVE_RUNNER = "scripts/phase2_cumulative_zonal_aggregate.py";
const here = (file) => new URL(`../${file}`, import.meta.url);

const PROVINCES = [
  { code: "BC", id: "59", name: { en: "British Columbia", fr: "Colombie-Britannique" } },
  { code: "AB", id: "48", name: { en: "Alberta", fr: "Alberta" } },
  { code: "ON", id: "35", name: { en: "Ontario", fr: "Ontario" } },
  { code: "QC", id: "24", name: { en: "Quebec", fr: "Québec" } },
];

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const round2 = (value) => Number(value.toFixed(2));

const annualBytes = await readFile(ANNUAL);
const cumulativeBytes = await readFile(CUMULATIVE);
const annualRows = JSON.parse(annualBytes);
const cumulativeRows = JSON.parse(cumulativeBytes);

const receipt = JSON.parse(await readFile(here("data/phase2-annual-province-zonal-v2-receipt-2026-08-29.json"), "utf8"));
if (receipt.artifacts.annualJson.sha256 !== digest(annualBytes)) {
  throw new Error("the annual artifact does not match the digest its receipt binds");
}
if (receipt.artifacts.annualJson.byteLength !== annualBytes.byteLength) {
  throw new Error("the annual artifact length does not match the digest its receipt binds");
}

const provinces = PROVINCES.map(({ code, id, name }) => {
  const annual = annualRows.filter((row) => row.province === code);
  const baseline = annual.find((row) => row.rowType === "baseline");
  const intervals = annual.filter((row) => row.rowType === "annual").sort((a, b) => a.fromYear - b.fromYear);
  const cumulative = cumulativeRows.find((row) => row.province === code);
  if (baseline === undefined) throw new Error(`${code} has no baseline row`);
  if (cumulative === undefined) throw new Error(`${code} has no cumulative row`);
  if (intervals.length !== 38) throw new Error(`${code} has ${intervals.length} intervals, expected 38`);
  if (cumulative.boundaryId !== id) throw new Error(`${code} cumulative boundary ${cumulative.boundaryId} is not ${id}`);
  if (baseline.boundaryId !== id) throw new Error(`${code} baseline boundary ${baseline.boundaryId} is not ${id}`);

  // The four coverage fields are invariant across the 39 source years, so a
  // drift between the two artifacts means one of them was rebuilt alone.
  for (const field of ["districtHectares", "unknownRequiredInputHectares", "unmappedByProductExtentHectares", "coverageGrade"]) {
    if (cumulative[field] !== baseline[field]) {
      throw new Error(`${code} ${field} differs between the annual baseline and the cumulative row`);
    }
  }
  if (cumulative.known1984ForestHectares !== baseline.knownForestedHectares) {
    throw new Error(`${code} cumulative 1984 denominator does not match the annual baseline snapshot`);
  }
  if (cumulative.known1984ForestHectares !== intervals[0].knownForestedHectares) {
    throw new Error(`${code} cumulative 1984 denominator does not match the first interval denominator`);
  }

  const naiveSumOfPublishedIntervals = round2(
    intervals.reduce((running, row) => running + row.knownObservedLossHectares, 0),
  );
  if (cumulative.cumulativeObservedLossHectares > naiveSumOfPublishedIntervals) {
    throw new Error(`${code} union exceeds the naive interval sum, which is arithmetically impossible`);
  }

  return {
    code,
    id,
    name,
    districtHectares: cumulative.districtHectares,
    unknownRequiredInputHectares: cumulative.unknownRequiredInputHectares,
    unmappedByProductExtentHectares: cumulative.unmappedByProductExtentHectares,
    coverageGrade: cumulative.coverageGrade,
    cumulative: {
      fromYear: cumulative.fromYear,
      toYear: cumulative.toYear,
      basis: "fixed-1984-forest-mask",
      observedLossHectares: cumulative.cumulativeObservedLossHectares,
      observedLossPercent: cumulative.cumulativeObservedLossPercent,
      known1984ForestHectares: cumulative.known1984ForestHectares,
      observedLossOutsideFirstYearForestHectares: cumulative.observedLossOutsideFirstYearForestHectares,
      repeatLossCellHectares: cumulative.repeatLossCellHectares,
      maximumLossEventsInOneCell: cumulative.maximumLossEventsInOneCell,
      // Renamed on the way in. The store field is called naiveAnnualSumHectares,
      // which reads as the sum of the published annual series and is not: it is
      // restricted to cells that were forest in 1984. The store artifact is run
      // output and is never rewritten, so the correction is made here.
      naiveSumOver1984ForestHectares: cumulative.naiveAnnualSumHectares,
      storeFieldName: "naiveAnnualSumHectares",
      doubleCountAvoidedOver1984ForestHectares: cumulative.doubleCountAvoidedHectares,
      temporalSemantics: cumulative.temporalSemantics,
    },
    reconciliation: {
      naiveSumOfPublishedIntervalsHectares: naiveSumOfPublishedIntervals,
      cumulativeObservedLossHectares: cumulative.cumulativeObservedLossHectares,
      differenceHectares: round2(naiveSumOfPublishedIntervals - cumulative.cumulativeObservedLossHectares),
      causes: [
        "A cell detected as lost in more than one interval is counted once in the cumulative union and once per interval in the sum.",
        "Each interval measures against its own from-year forest mask, so the sum includes loss of forest that regrew after 1984 and is outside the cumulative denominator.",
      ],
    },
    baseline: {
      year: baseline.baselineYear,
      knownForestedHectares: baseline.knownForestedHectares,
      temporalSemantics: baseline.temporalSemantics,
    },
    intervals: intervals.map((row) => ({
      fromYear: row.fromYear,
      toYear: row.toYear,
      basis: "moving-from-year-forest-mask",
      observedLossHectares: row.knownObservedLossHectares,
      knownForestedHectares: row.knownForestedHectares,
      observedLossOutsideFirstYearForestHectares: row.observedLossOutsideFirstYearForestHectares,
    })),
  };
});

const record = {
  schemaVersion: "witness-tree/phase2-province-series-readback/1",
  status: "exact-readback-passed",
  productId: "phase2-province-series-1984-2022-v1",
  method: "data/phase2-method-parameters.json",
  bases: {
    interval: "Each annual row measures loss against its own from-year forest mask, which moves as forest regrows.",
    cumulative: "The cumulative row is a per-cell union across all 38 intervals, measured against the fixed 1984 forest mask.",
    warning: "The two bases differ. Summing the interval rows does not reproduce the cumulative figure and must never be presented as if it did.",
  },
  sources: {
    annual: {
      path: "../Witness_Tree-data/derived/phase2-annual-province-zonal-v2/annual-province-zonal-1984-2022.json",
      byteLength: annualBytes.byteLength,
      sha256: digest(annualBytes),
      receipt: "data/phase2-annual-province-zonal-v2-receipt-2026-08-29.json",
      runner: { path: ANNUAL_RUNNER, sha256: digest(await readFile(here(ANNUAL_RUNNER))) },
    },
    cumulative: {
      path: "../Witness_Tree-data/derived/phase2-cumulative-province-zonal-v1/cumulative-province-zonal-1984-2022.json",
      byteLength: cumulativeBytes.byteLength,
      sha256: digest(cumulativeBytes),
      runner: { path: CUMULATIVE_RUNNER, sha256: digest(await readFile(here(CUMULATIVE_RUNNER))) },
    },
  },
  provinceCount: provinces.length,
  intervalCount: 38,
  firstYear: 1984,
  lastYear: 2022,
  admitted: false,
  released: false,
  productionEligible: false,
  expertReviewed: false,
  complete: false,
  completenessBasis: "Every province is partial-with-unknown: the product does not map the whole province, so every figure is a minimum and unknown is never zero.",
  provinces,
};

const serialized = `${JSON.stringify(record, null, 2)}\n`;
await writeFile(here("data/phase2-province-series-readback.json"), serialized);
console.log(
  `${record.provinceCount} provinces, ${record.intervalCount} intervals, 1984-2022. ` +
    `readback ${Buffer.byteLength(serialized).toLocaleString("en-CA")} bytes, sha256 ${digest(serialized)}.`,
);
