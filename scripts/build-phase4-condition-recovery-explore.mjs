#!/usr/bin/env node
// The figures Explore "Condition and recovery" would show, derived from the v2
// run output on the data root. The file this writes is not admitted: its claims
// say so, and lib/explore/condition-recovery.ts reads nothing from it until an
// admission record exists. The checker re-derives the file with the same
// function whenever the data root is attached.
//
// Rows are the four provinces and the 44 StatCan 2021 economic regions inside
// them, for the owner's headline set A (VLCE2 classes 210, 220, 230). A region
// row holds the cells of its own province only. The few border cells a province
// window places in a neighbouring province's region (at most 781 cells a row)
// stay in the province totals and are not displayed, as the v2 record says.
// Counts stay in cells; the module turns them into hectares and shares.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

export const CELL_HECTARES = 0.09;
export const MINIMUM_LOST_HECTARES = 500;
export const RUN_OUTPUT = "derived/phase4-condition-recovery-v2/condition-recovery-v2.json";
export const REGION_NAMES = "raw/statcan-economic-regions-2021/2026-08-29/ler_000a21s_e.geojson";
export const OUTPUT = "data/phase4-condition-recovery-explore.json";
export const TILES_MANIFEST = "derived/phase4-condition-recovery-tiles-v1/manifest.json";

const PROVINCES = [
  { key: "british-columbia", id: "59", code: "BC", name: { en: "British Columbia", fr: "Colombie-Britannique" } },
  { key: "alberta", id: "48", code: "AB", name: { en: "Alberta", fr: "Alberta" } },
  { key: "ontario", id: "35", code: "ON", name: { en: "Ontario", fr: "Ontario" } },
  { key: "quebec", id: "24", code: "QC", name: { en: "Quebec", fr: "Québec" } },
];
const DECADES = ["1985-1994", "1995-2004", "2005-2014", "2015-2022"];
const CAUSES = ["notRecorded", "fire", "harvest", "fireAndHarvest"];

// Losses in the last decade have had at most seven years to show three treed
// years in a row, and the 2020-2022 losses none at all. The 2005-2014 losses
// had eight to seventeen. Neither decade's recovery share is a final answer.
const DECADE_NOTES = {
  "2005-2014": { en: "Partial follow-up: 8 to 17 years to recover", fr: "Suivi partiel : de 8 à 17 ans pour se rétablir" },
  "2015-2022": { en: "Too recent to judge: 7 years or less to recover", fr: "Trop récent pour conclure : 7 ans ou moins pour se rétablir" },
};

// Coverage grades from lib/domain/coverage.ts. The whole product is the national
// land-cover series, so every row is a national baseline. A decade that starts
// before 2000 is graded as the extended record, as coverageGradeForPoint does
// for an observation year before 2000.
const ROW_GRADE = "national-baseline";
const decadeGrade = (decade) => (Number(decade.slice(0, 4)) < 2000 ? "extended-record-sparse-official-matching" : ROW_GRADE);

const floorCells = MINIMUM_LOST_HECTARES / CELL_HECTARES;
const belowFloor = (lostCells) => lostCells < floorCells;

/** Bilingual StatCan names ("Northeast / Nord-est") split into their two languages. */
export function splitRegionName(name) {
  const parts = name.split(" / ");
  if (parts.length > 2) throw new Error(`Unexpected region name ${name}`);
  return { en: parts[0], fr: parts[1] ?? parts[0] };
}

function emptyTotals() {
  return {
    maskCells: 0, unknownCells: 0, knownCells: 0, everTreedCells: 0, lostCells: 0,
    latestRecoveredCells: 0, anyRecoveredCells: 0, unconfirmedCells: 0,
    decades: Object.fromEntries(DECADES.map((d) => [d, { lostCells: 0, recoveredCells: 0, unconfirmedCells: 0 }])),
    causes: Object.fromEntries(CAUSES.map((c) => [c, { lostCells: 0, recoveredCells: 0 }])),
  };
}

function add(into, g) {
  into.maskCells += g.maskCells;
  into.unknownCells += g.unknownCells;
  into.knownCells += g.knownCells;
  into.everTreedCells += g.everTreedCells;
  into.lostCells += g.lostCells;
  into.latestRecoveredCells += g.latestLoss.recoveredCells;
  into.anyRecoveredCells += g.anyLoss.recoveredCells;
  into.unconfirmedCells += g.latestLoss.unconfirmedCells;
  for (const d of DECADES) for (const k of ["lostCells", "recoveredCells", "unconfirmedCells"]) into.decades[d][k] += g.byLatestLossDecade[d][k];
  for (const c of CAUSES) for (const k of ["lostCells", "recoveredCells"]) into.causes[c][k] += g.causeOfLatestLoss[c][k];
}

/** Totals to a published row. Recovery is withheld, never zeroed, where the lost area is below the floor. */
function row(identity, t) {
  const withheld = belowFloor(t.lostCells);
  return {
    ...identity,
    coverageGrade: ROW_GRADE,
    maskCells: t.maskCells,
    unknownCells: t.unknownCells,
    knownCells: t.knownCells,
    everTreedCells: t.everTreedCells,
    lostCells: t.lostCells,
    belowFloor: withheld,
    latestRecoveredCells: withheld ? null : t.latestRecoveredCells,
    anyRecoveredCells: withheld ? null : t.anyRecoveredCells,
    unconfirmedCells: withheld ? null : t.unconfirmedCells,
    decades: DECADES.map((decade) => {
      const d = t.decades[decade];
      const low = belowFloor(d.lostCells);
      return {
        decade,
        coverageGrade: decadeGrade(decade),
        note: DECADE_NOTES[decade] ?? null,
        lostCells: d.lostCells,
        belowFloor: low,
        recoveredCells: low ? null : d.recoveredCells,
        unconfirmedCells: low ? null : d.unconfirmedCells,
      };
    }),
    causes: CAUSES.map((cause) => {
      const c = t.causes[cause];
      const low = belowFloor(c.lostCells);
      return { cause, lostCells: c.lostCells, belowFloor: low, recoveredCells: low ? null : c.recoveredCells };
    }),
  };
}

export function buildExploreFigures({ run, regionFeatures, causeAndCheck, runOutputSha256, tilesManifest }) {
  if (run.method !== "condition-recovery-vlce2-classes-v2") throw new Error("Not a v2 run output.");
  if (run.cellHectares !== CELL_HECTARES) throw new Error("Unexpected cell size.");
  if (JSON.stringify(run.treedClassSets.A) !== "[210,220,230]") throw new Error("Set A is not the owner's headline set.");

  const regionName = new Map();
  for (const feature of regionFeatures) {
    const { ERUID, ERNAME, PRUID } = feature.properties;
    if (PROVINCES.some((p) => p.id === PRUID)) regionName.set(ERUID, ERNAME);
  }
  if (regionName.size !== 44) throw new Error(`Expected 44 economic regions, found ${regionName.size}.`);

  const provinces = [];
  const regionTotals = new Map([...regionName.keys()].sort().map((id) => [id, emptyTotals()]));
  const four = emptyTotals();
  for (const p of PROVINCES) {
    const entry = run.provinces[p.key];
    if (String(entry.pruid) !== p.id) throw new Error(`${p.key} is not province ${p.id}.`);
    const a = entry.sets.A;
    const b = entry.sets.B;
    const t = emptyTotals();
    add(t, a.total);
    add(four, a.total);
    for (const [id, g] of Object.entries(a.regions)) {
      if (id === "none" || id.slice(0, 2) !== p.id) continue;
      const into = regionTotals.get(id);
      if (!into) throw new Error(`${p.key} holds cells in region ${id}, which is not one of its regions.`);
      add(into, g);
    }
    provinces.push({
      ...row({ id: p.id, kind: "province", code: p.code, name: p.name }, t),
      // Treed wetland (class 81) is outside set A. Its share of what set B calls
      // ever treed says how much treed land the headline leaves out.
      treedWetlandCells: b.total.everTreedCells - a.total.everTreedCells,
      setBEverTreedCells: b.total.everTreedCells,
    });
  }
  const regions = [...regionTotals].map(([id, t]) =>
    row({ id, kind: "region", provinceId: id.slice(0, 2), name: splitRegionName(regionName.get(id)) }, t));

  const check = causeAndCheck.resultsCheck.sets.A;
  if (!check || causeAndCheck.resultsCheck.targetMet !== false || causeAndCheck.resultsCheck.targetAgreement !== 0.8) throw new Error("The RESULTS check is not where it was.");

  return {
    schema: "witness-tree/phase4-condition-recovery-explore/1",
    status: "local-nonproduction",
    claims: { admitted: false, released: false, ownerReviewed: false, frenchReviewed: false, productionEligible: false },
    builtBy: "scripts/build-phase4-condition-recovery-explore.mjs",
    checkedBy: "scripts/check-phase4-condition-recovery-explore.mjs",
    basedOn: {
      record: "data/phase4-condition-recovery-v2.json",
      causeAndCheck: "data/phase4-condition-recovery-cause-and-check.json",
      output: RUN_OUTPUT,
      outputSha256: runOutputSha256,
      regionNames: REGION_NAMES,
    },
    set: "A",
    treedClasses: run.treedClassSets.A,
    cellHectares: CELL_HECTARES,
    minimumLostHectares: MINIMUM_LOST_HECTARES,
    rule: "Recovered means treed for at least three consecutive years after the loss. The headline is recovery after the latest loss; recovery after any loss is shown beside it. A row, decade or cause whose lost area is below the floor shows its lost area and withholds recovery. Unknown cells are counted in every row and never folded into a share.",
    decades: DECADES,
    causes: CAUSES,
    resultsAgreement: {
      agreement: check.agreement,
      eligiblePolygons: check.eligible,
      byReferenceClass: check.agreementByReferenceClass,
      target: 0.8,
      targetMet: false,
      note: {
        en: "In British Columbia, these recovery calls agreed with provincial silviculture surveys on 61% of stands, below the 80% target. They agreed on 96% of stands the surveys call not restocked and 46% of stands they call regenerated, so recovery is likely understated.",
        fr: "En Colombie-Britannique, ces constats de rétablissement concordent avec les relevés sylvicoles provinciaux pour 61 % des peuplements, sous la cible de 80 %. Ils concordent pour 96 % des peuplements que les relevés jugent non régénérés et 46 % de ceux qu'ils jugent régénérés : le rétablissement est donc probablement sous-estimé.",
      },
    },
    fourProvinces: row({ id: "four-provinces", kind: "four-provinces", name: { en: "Four provinces", fr: "Quatre provinces" } }, four),
    provinces,
    regions,
    perCellTiles: tilesManifest ? perCellTiles(tilesManifest) : null,
  };
}

/** The locally built tile archive, as its builder recorded it. Never uploaded. */
function perCellTiles(m) {
  if (m.method !== "condition-recovery-per-cell-tiles-v1" || m.uploaded !== false || m.set !== "A") throw new Error("Not the recorded tile build.");
  return {
    builder: "scripts/phase4_condition_recovery_tiles.py",
    builderSha256: m.builderSha256,
    manifest: TILES_MANIFEST,
    executedAt: m.executedAt,
    layer: m.layer,
    minZoom: m.minZoom,
    maxZoom: m.maxZoom,
    states: m.states,
    decades: m.decades,
    strips: m.strips,
    features: m.features,
    cellsByCode: m.cellsByCode,
    archive: { ...m.archive, path: TILES_MANIFEST.replace("manifest.json", m.archive.path) },
    uploaded: false,
    workers: m.workers,
    // A resumed run reused finished strips and a finished tiler stage, so its
    // elapsed time covers only the steps it ran.
    tilerResumed: m.tilerResumed === true,
    elapsedSeconds: m.elapsedSeconds,
  };
}

export function serialize(figures) {
  return `${JSON.stringify(figures, null, 1)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { createHash } = await import("node:crypto");
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const root = resolveDataRoot();
  const runBytes = readFileSync(resolve(root, RUN_OUTPUT));
  const figures = buildExploreFigures({
    run: JSON.parse(runBytes),
    regionFeatures: JSON.parse(readFileSync(resolve(root, REGION_NAMES))).features,
    causeAndCheck: JSON.parse(readFileSync(resolve(repoRoot, "data/phase4-condition-recovery-cause-and-check.json"))),
    runOutputSha256: createHash("sha256").update(runBytes).digest("hex"),
    tilesManifest: existsSync(resolve(root, TILES_MANIFEST)) ? JSON.parse(readFileSync(resolve(root, TILES_MANIFEST))) : undefined,
  });
  writeFileSync(resolve(repoRoot, OUTPUT), serialize(figures));
  console.log(`wrote ${OUTPUT}: ${figures.provinces.length} provinces, ${figures.regions.length} regions`);
}
