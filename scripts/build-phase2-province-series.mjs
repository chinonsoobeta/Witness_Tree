import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

/*
 * The lean series the application imports. It carries only what a reader
 * needs to see and is bound to the readback by digest, so the evidence record
 * stays the full one and the shipped payload stays small.
 *
 * Both denominators travel with their figures. A percentage in this file is
 * never meaningful without the basis beside it.
 */

const here = (file) => new URL(`../${file}`, import.meta.url);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

const readbackBytes = await readFile(here("data/phase2-province-series-readback.json"));
const readback = JSON.parse(readbackBytes);

const series = {
  schemaVersion: "witness-tree/phase2-province-series/1",
  status: "countable-unreviewed-minimum",
  productId: readback.productId,
  source: {
    path: "data/phase2-province-series-readback.json",
    byteLength: readbackBytes.byteLength,
    sha256: digest(readbackBytes),
  },
  firstYear: readback.firstYear,
  lastYear: readback.lastYear,
  intervalCount: readback.intervalCount,
  bases: readback.bases,
  claims: {
    countable: true,
    admitted: false,
    released: false,
    productionEligible: false,
    complete: false,
    expertReviewed: false,
  },
  completenessBasis: readback.completenessBasis,
  provinces: readback.provinces.map((province) => ({
    code: province.code,
    id: province.id,
    name: province.name,
    coverageGrade: province.coverageGrade,
    districtHectares: province.districtHectares,
    unknownRequiredInputHectares: province.unknownRequiredInputHectares,
    cumulative: {
      fromYear: province.cumulative.fromYear,
      toYear: province.cumulative.toYear,
      basis: province.cumulative.basis,
      observedLossHectares: province.cumulative.observedLossHectares,
      observedLossPercent: province.cumulative.observedLossPercent,
      known1984ForestHectares: province.cumulative.known1984ForestHectares,
      repeatLossCellHectares: province.cumulative.repeatLossCellHectares,
      maximumLossEventsInOneCell: province.cumulative.maximumLossEventsInOneCell,
    },
    reconciliation: province.reconciliation,
    intervals: province.intervals.map((interval) => ({
      fromYear: interval.fromYear,
      toYear: interval.toYear,
      basis: interval.basis,
      observedLossHectares: interval.observedLossHectares,
      knownForestedHectares: interval.knownForestedHectares,
    })),
  })),
};

const serialized = `${JSON.stringify(series, null, 2)}\n`;
await writeFile(here("data/phase2-province-series.json"), serialized);
console.log(
  `province series: ${series.provinces.length} provinces x ${series.intervalCount} intervals, ` +
    `${Buffer.byteLength(serialized).toLocaleString("en-CA")} bytes.`,
);
