// Builds the province span figures the Explore page ships to the browser.
//
// Item C of the 2026-09-18 admission ("admit and release") is the province span
// aggregate, data/phase3-province-interval-spans-1984-2022.json. That file is
// bound by checksum and is never edited; it also carries every input path and
// every per-year array, which a browser has no use for. This writes the four
// arrays the page reads, for each province, next to the checksums of the file
// they were copied from and of the admission that released it.
//
// Nothing is recomputed here. Every number is copied, and the invariants the
// page relies on are checked before anything is written.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "data/phase3-province-interval-spans-1984-2022.json";
const ADMISSION = "data/phase2-1984-2022-admission-record-2026-09-18.json";
export const OUTPUT = "data/phase3-province-span-release.json";
const PROVINCES = [
  { id: "59", code: "BC", name: { en: "British Columbia", fr: "Colombie-Britannique" } },
  { id: "48", code: "AB", name: { en: "Alberta", fr: "Alberta" } },
  { id: "35", code: "ON", name: { en: "Ontario", fr: "Ontario" } },
  { id: "24", code: "QC", name: { en: "Quebec", fr: "Québec" } },
];
const STEPS = 38;
const SPANS = (STEPS * (STEPS + 1)) / 2;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function buildRelease() {
  const sourceBytes = readFileSync(SOURCE);
  const admissionBytes = readFileSync(ADMISSION);
  const source = JSON.parse(sourceBytes);
  const admission = JSON.parse(admissionBytes);
  const bound = admission.bindingsRevalidated.entries.find((entry) => entry.path === SOURCE);
  if (!bound || bound.sha256 !== sha256(sourceBytes)) throw new Error(`${SOURCE} is not the file the admission bound`);
  if (admission.claims.admitted !== true || admission.claims.releaseApproved !== true) throw new Error("the admission does not approve release");
  if (source.intervalCount !== SPANS || source.firstYear !== 1984 || source.lastYear !== 2022) throw new Error("unexpected span layout");
  if (source.summedPercentAllowed !== false) throw new Error("the source must forbid a summed percentage");

  // The page reads spans by arithmetic; the source states its order. Compare them.
  let index = 0;
  for (let start = 0; start < STEPS; start += 1) {
    for (let end = start; end < STEPS; end += 1) {
      const span = source.intervalOrder[index];
      if (span.fromYear !== 1984 + start || span.toYear !== 1985 + end) throw new Error(`span ${index} is out of order`);
      index += 1;
    }
  }

  const provinces = PROVINCES.map((province) => {
    const entry = source.boundariesSummed.find((candidate) => candidate.boundaryId === province.id);
    if (!entry) throw new Error(`${province.code} is missing`);
    for (let i = 0; i < SPANS; i += 1) {
      const union = entry.intervalUnionLossCells[i];
      if (union > entry.intervalSummedLossCells[i] || union > entry.intervalKnownCells[i]) {
        throw new Error(`${province.code} span ${i} breaks the union invariant`);
      }
    }
    return {
      ...province,
      cells: entry.cells,
      unmappedCells: entry.unmappedCells,
      intervalKnownCells: entry.intervalKnownCells,
      intervalUnionLossCells: entry.intervalUnionLossCells,
      intervalUnknownCells: entry.intervalUnknownCells,
      intervalSummedLossCells: entry.intervalSummedLossCells,
    };
  });

  return {
    schema: "witness-tree/phase3-province-span-release/1",
    source: { path: SOURCE, sha256: sha256(sourceBytes), methodVersion: source.methodVersion },
    admission: { path: ADMISSION, sha256: sha256(admissionBytes), item: "C-province-span-aggregate", decisionId: admission.ownerDecision.decisionId },
    cellHectares: source.cellHectares,
    firstYear: source.firstYear,
    lastYear: source.lastYear,
    annualStepCount: STEPS,
    spanCount: SPANS,
    unionTerm: source.unionTerm,
    summedTerm: source.summedTerm,
    summedPercentAllowed: false,
    unknownPolicy: source.unknownPolicy,
    fourProvinceRule: "The four-province figure is the sum of the four provinces, which is exact because the provinces are disjoint by the same centre rule.",
    claims: {
      admitted: true,
      released: true,
      releasedMeaning: "Committed for the Explore page. It is live once the owner deploys the commit that carries it.",
      expertReviewed: false,
      complete: false,
    },
    provinces,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const release = buildRelease();
  writeFileSync(OUTPUT, `${JSON.stringify(release)}\n`);
  console.log(`Wrote ${OUTPUT}: ${release.provinces.length} provinces x ${release.spanCount} spans.`);
}
