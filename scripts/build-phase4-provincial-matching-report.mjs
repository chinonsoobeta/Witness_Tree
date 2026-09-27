#!/usr/bin/env node
// Writes data/phase4-provincial-matching-report.json from a finished matching
// run in the work directory. The report carries the whole-run rates the Phase 4
// gate asks for, the per-province and per-interval breakdown, the area-weighted
// context, the record sources and their checksums, and the independent recount.
//
// Its readiness flags are the truth as of the run: rights are verified
// (data/bc-harvest-source-rights-2026-09-26.json) and change geometry is
// materialized, but the owner has not yet admitted the source evidence, the
// transformation or the release. Until an owner admission record exists the
// report stays "computed-awaiting-owner-admission", which the gate checker does
// not accept as an admitted report.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { work: { type: "string" }, checks: { type: "string" }, admitted: { type: "boolean", default: false } } });
// --admitted writes the form the owner admitted on 2026-09-26: production status,
// every readiness flag true, and the repository inputs bound by checksum so the
// admission and the Phase 4 checker can hold the report to them.
const INPUTS = [
  "data/bc-harvest-source-rights-2026-09-26.json",
  "data/phase2-per-cell-four-province-admission-record-2026-09-19.json",
  "lib/pipeline/matching.ts",
  "lib/phase4/provincial-matching.ts",
  "scripts/phase4-match-provincial.mts",
  "scripts/phase4_rasterize_records.py",
];
const W = values.work;
// Work-directory paths as they sit on the data root once copied back.
const DERIVED = "derived/phase4-provincial-matching-2026-09-26";
const ON_DATA_ROOT = {
  "raw/bc-consolidated-cutblocks/Cut_Block_all_BC.zip": "raw/bc-consolidated-cutblocks/2026-09-26/Cut_Block_all_BC.zip",
  "raw/bc-fta-4-cutblocks-full/acquisition.json": "raw/bc-fta-4-cutblocks/2026-09-26/acquisition.json",
  "raw/bc-historical-fire-perimeters/bc-historical-fire-perimeters.gpkg": "raw/bc-historical-fire-perimeters/2026-09-26/bc-historical-fire-perimeters.gpkg",
};
const sha = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 1 << 24 })) hash.update(chunk);
  return hash.digest("hex");
};
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const summary = await json(path.join(W, "match/summary.json"));

const SOURCES = {
  BC: [
    { id: "bc-consolidated-cutblocks", title: "Harvested Areas of BC (Consolidated Cutblocks)", selection: "Data_Source RESULTS or VRI; satellite change-detection records excluded as circular; event year HARVEST_START_YEAR_CALENDAR", rights: "written permission 2026-09-18", raw: "raw/bc-consolidated-cutblocks/Cut_Block_all_BC.zip" },
    { id: "bc-fta-4-cutblocks", title: "Forest Tenure Cutblock Polygons (FTA 4.0)", selection: "records with a DISTURBANCE_START_DATE; event year is its year", rights: "OGL-BC", raw: "raw/bc-fta-4-cutblocks-full/acquisition.json" },
    { id: "bc-historical-fire-perimeters", title: "BC Wildfire Fire Perimeters - Historical", selection: "event year FIRE_YEAR", rights: "OGL-BC", raw: "raw/bc-historical-fire-perimeters/bc-historical-fire-perimeters.gpkg" },
  ],
  QC: [
    { id: "qc-current-ecoforest", title: "Carte écoforestière à jour", selection: "stand-origin code (origine) with its year (an_origine): BR fire; CHT windthrow; ES insect; cut codes beginning C, and RECUP, harvest; plantation, seeding and other treatments excluded", rights: "CC BY 4.0", raw: null },
    { id: "qc-historic-wildfire-detailed", title: "Feux de forêt (FEUX_PROV)", selection: "origine BR with its year", rights: "CC BY 4.0", raw: null },
  ],
};

const sources = {};
for (const [province, list] of Object.entries(SOURCES)) {
  const summaryFile = path.join(W, "runs", province, "records-summary.json");
  const recordSummary = await json(summaryFile);
  sources[province] = {
    recordLayer: { path: `${DERIVED}/records/records-${province}.gpkg`, sha256: await sha(path.join(W, "records", `records-${province}.gpkg`)) },
    records: recordSummary.records,
    sources: await Promise.all(list.map(async (source) => {
      const manifestFile = path.join(W, "runs", province, source.id, "manifest.json");
      const manifest = await json(manifestFile);
      return {
        ...source,
        records: recordSummary.sources[source.id].records,
        kinds: recordSummary.sources[source.id].kinds,
        eventYears: [recordSummary.sources[source.id].firstYear, recordSummary.sources[source.id].lastYear],
        rasterization: { manifest: `${DERIVED}/runs/${province}/${source.id}/manifest.json`, manifestSha256: await sha(manifestFile), rule: manifest.rule, seconds: manifest.seconds },
        raw: source.raw ? { path: ON_DATA_ROOT[source.raw], sha256: await sha(path.join(W, source.raw)) } : null,
      };
    })),
  };
}

const checks = values.checks ? await json(values.checks) : [];
const report = {
  schemaVersion: "witness-tree/phase4-provincial-matching-report/1",
  runId: "phase4-provincial-matching-2026-09-26",
  status: values.admitted ? "admitted-production" : "computed-awaiting-owner-admission",
  productionEligible: values.admitted,
  claims: { comparisonResultsExist: true, productionEligible: values.admitted, released: false },
  scope: { provinces: ["BC", "QC"] },
  dataRoot: { derived: DERIVED, note: "Paths are relative to the data root; the run was computed on the internal disk and copied back byte for byte." },
  readiness: {
    sourceRightsVerified: true,
    sourceEvidenceAdmitted: values.admitted,
    sourceTransformationApproved: values.admitted,
    sourceReleaseApproved: values.admitted,
    changeGeometryMaterialized: true,
  },
  readinessBasis: {
    sourceRightsVerified: "data/bc-harvest-source-rights-2026-09-26.json records BC rights; the Québec sources are CC BY 4.0.",
    changeGeometryMaterialized: "Detected changes are the per-cell loss patches of the admitted four-province store (data/phase2-per-cell-four-province-admission-record-2026-09-19.json).",
    ...(values.admitted
      ? { ownerApproval: "The owner admitted the source evidence, the record transformation and the release on 2026-09-26; see data/phase4-provincial-matching-admission-2026-09-26.json." }
      : { pending: "The owner has not yet admitted the source evidence, the record transformation, or the release." }),
  },
  inputBindings: await Promise.all(INPUTS.map(async (input) => ({ path: input, sha256: await sha(path.join(ROOT, input)) }))),
  method: {
    detectedChanges: "Every per-cell loss patch of the four-province store, 1984-1985 to 2021-2022, in the province holding most of its cells. The observation year is the interval's closing year.",
    officialRecords: "Official harvest, fire, insect and windthrow records, reprojected to the national 30 m EPSG:3978 grid and rasterized one source at a time by GDAL's cell-centre rule (scripts/phase4_rasterize_records.py).",
    candidates: "A record is a candidate for a patch when they share at least one cell and its event year is within 5 years of the observation year, so date mismatches are seen as rejections.",
    matching: "lib/pipeline/matching.ts: overlap of at least half the smaller area; within 2 years, or 3 before 1995; the best overlap wins. Non-match reasons from lib/phase4/provincial-matching.ts.",
    runner: { path: "scripts/phase4-match-provincial.mts", sha256: await sha(path.join(ROOT, "scripts/phase4-match-provincial.mts")) },
    pool: { path: "scripts/run-phase4-provincial-matching.mjs", sha256: await sha(path.join(ROOT, "scripts/run-phase4-provincial-matching.mjs")), workers: summary.workers, heapMegabytes: summary.heapMegabytes, seconds: summary.seconds, peakRssMegabytesPerTask: summary.peakRssMegabytes },
  },
  counts: summary.whole.counts,
  matchRate: summary.whole.matchRate,
  nonMatchRate: summary.whole.nonMatchRate,
  nonMatchReasonDistribution: summary.whole.nonMatchReasonDistribution,
  matchedByRecordKind: summary.whole.matchedByRecordKind,
  areaWeighted: summary.whole.areaWeighted,
  byProvince: summary.byProvince,
  intervals: summary.intervals.map((row) => ({
    province: row.province, interval: row.interval, assessedChanges: row.assessedChanges, matchedChanges: row.matchedChanges,
    assessedHectares: row.assessedHectares, matchedHectares: row.matchedHectares,
    nonMatchReasonDistribution: row.nonMatchReasonDistribution, matchedByRecordKind: row.matchedByRecordKind,
  })),
  sources,
  independentChecks: checks,
  limits: [
    "Most unmatched changes are small: by count 11% of changes match, by area 56%. Small patches rarely have a record of their own.",
    "A change with no candidate record is not evidence that no harvest or fire occurred; records can be missing, unpublished, outside a reporting boundary, or on private land.",
    "The non-match reasons are tolerance failures, not causes. They do not say why a record is absent.",
    "Within one source, overlapping records of the same year share cells: BC's 2010 fire perimeters cover 9% less area on the grid than their summed polygon areas.",
    "Québec disturbance codes were grouped by their stratification-standard families; the few codes whose meaning was not confirmed are under 2% of records.",
  ],
};
await writeFile(path.join(ROOT, "data/phase4-provincial-matching-report.json"), `${JSON.stringify(report, null, 1)}\n`);
console.log(report.counts, report.matchRate, report.areaWeighted);
