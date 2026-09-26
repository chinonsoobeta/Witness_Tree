#!/usr/bin/env node
// Harvest and fire by province and year, 1985 to 2022, for the four provinces.
//
// The inputs are the four WP2 provincial annual-series files on the data root
// (docs/FALL_DOWN_WP2_ANNUAL_SERIES_STAGING.md). Each holds the NTEMS harvest
// and wildfire change-year rasters cross-tabulated against VLCE2 land cover
// inside the Statistics Canada 2021 province boundary. Summing a joint table
// over its land-cover classes gives the number of cells whose recorded change
// year is that year. The checker re-derives the file with the same function
// whenever the data root is attached.
//
// Counts stay in cells; lib/harvest-fire turns them into hectares.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

export const CELL_HECTARES = 0.09;
export const FIRST_YEAR = 1985;
export const LAST_YEAR = 2022;
export const BASELINE_YEAR = 1984;
export const OUTPUT = "data/harvest-fire-province-annual-series.json";
export const DECISION = "docs/HARVEST_FIRE_SERIES_DECISION.md";
export const INPUT_DIRECTORY = "derived/provincial-annual-series-20260909";

export const PROVINCES = [
  { key: "british-columbia", id: "59", code: "BC", name: { en: "British Columbia", fr: "Colombie-Britannique" } },
  { key: "alberta", id: "48", code: "AB", name: { en: "Alberta", fr: "Alberta" } },
  { key: "ontario", id: "35", code: "ON", name: { en: "Ontario", fr: "Ontario" } },
  // The site writes Québec in both languages; the source file names it Quebec.
  { key: "quebec", id: "24", code: "QC", name: { en: "Québec", fr: "Québec" }, sourceName: "Quebec" },
];

export const inputPath = (key) => `${INPUT_DIRECTORY}/${key}-annual-series-1984-2022.json`;
export const manifestId = (key) => `wp2-provincial-annual-series-20260909--${key}-annual-series-1984-2022.json`;

const JOINT_AXES = "[landCoverYear][classIndex, 0..12 then 13=unmapped][disturbanceBin, 0=none]";
const UNCLASSIFIED = 0;
const UNMAPPED = 13;

// Coverage grades from lib/domain/coverage.ts: a year before 2000 is the
// extended record, as coverageGradeForPoint grades an observation before 2000.
const gradeFor = (year) => (year < 2000 ? "extended-record-sparse-official-matching" : "national-baseline");

/** Cells per disturbance year, from one land-cover year of a joint table. */
function marginal(joint, landCoverIndex, bins) {
  return bins.map((_, bin) => joint[landCoverIndex].reduce((sum, row) => sum + row[bin], 0));
}

/**
 * One province's rows. Throws rather than writing anything the source does not
 * support: a changed axis, a disturbance year counted differently in two
 * land-cover years, or any change recorded where the land cover is unmapped.
 */
export function provinceSeries(province, source) {
  if (source.province !== (province.sourceName ?? province.name.en) || String(source.pruid) !== province.id) throw new Error(`${province.key}: not province ${province.id}.`);
  if (source.haPerCell !== CELL_HECTARES) throw new Error(`${province.key}: unexpected cell size.`);
  if (source.jointAxes !== JOINT_AXES) throw new Error(`${province.key}: the joint axes changed.`);
  const expectedBins = ["none", ...Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => String(FIRST_YEAR + i))];
  if (JSON.stringify(source.disturbanceBins) !== JSON.stringify(expectedBins)) throw new Error(`${province.key}: disturbance years are not 1985 to 2022.`);
  if (source.years[0] !== BASELINE_YEAR || source.years.at(-1) !== LAST_YEAR) throw new Error(`${province.key}: land-cover years are not 1984 to 2022.`);
  if (source.unmappedCellYears !== 0) throw new Error(`${province.key}: cells outside the land-cover grid.`);

  const counts = {};
  for (const [kind, joint] of [["harvest", source.jointLandCoverByHarvestYear], ["fire", source.jointLandCoverByFireYear]]) {
    const first = marginal(joint, 0, expectedBins);
    for (let i = 1; i < source.years.length; i += 1) {
      if (JSON.stringify(marginal(joint, i, expectedBins)) !== JSON.stringify(first)) {
        throw new Error(`${province.key}: ${kind} years differ between land-cover years ${source.years[0]} and ${source.years[i]}.`);
      }
    }
    if (first.reduce((a, b) => a + b, 0) !== source.landCells) throw new Error(`${province.key}: ${kind} does not account for every land cell.`);
    // The disturbance products share the land-cover product's composites, so
    // nothing may be dated where the land cover is unmapped. If something were,
    // the unknown area would not be the whole of what the series cannot see.
    for (let i = 0; i < source.years.length; i += 1) {
      for (const classIndex of [UNCLASSIFIED, UNMAPPED]) {
        if (joint[i][classIndex].slice(1).some((n) => n !== 0)) throw new Error(`${province.key}: ${kind} recorded in unmapped land cover.`);
      }
    }
    counts[kind] = first;
  }

  // The unmapped part is fixed: every land-cover year reports the same
  // Unclassified count, and it is where no change can be dated.
  const unknownCells = source.jointLandCoverByHarvestYear[0][UNCLASSIFIED].reduce((a, b) => a + b, 0);
  for (let i = 0; i < source.years.length; i += 1) {
    if (source.jointLandCoverByHarvestYear[i][UNCLASSIFIED].reduce((a, b) => a + b, 0) !== unknownCells) throw new Error(`${province.key}: the unmapped part moves between years.`);
  }

  return {
    id: province.id,
    code: province.code,
    key: province.key,
    name: province.name,
    landCells: source.landCells,
    unknownCells,
    years: [
      {
        year: BASELINE_YEAR,
        harvestCells: null,
        fireCells: null,
        unknownReason: {
          en: "1984 is the first image in the record. A change is dated by comparing a year with the year before it, so no harvest or fire can be dated to 1984.",
          fr: "1984 est la première image de la série. Un changement est daté en comparant une année à la précédente; aucune récolte ni aucun incendie ne peut donc être daté de 1984.",
        },
      },
      ...expectedBins.slice(1).map((bin, i) => ({
        year: Number(bin),
        coverageGrade: gradeFor(Number(bin)),
        harvestCells: counts.harvest[i + 1],
        fireCells: counts.fire[i + 1],
      })),
    ],
  };
}

export function buildSeries({ sources, inputs }) {
  return {
    schema: "witness-tree/harvest-fire-province-annual-series/1",
    status: "owner-published-unreviewed",
    claims: { ownerPublished: true, expertReviewed: false, frenchReviewed: false, groundTruthed: false, released: false, productionEligible: false },
    ownerDecision: {
      decidedAt: "2026-09-25",
      decidedBy: "owner",
      decision: "Publish these four provincial series on the site, and allow years to be added into multi-year totals in the harvest and fire view only.",
      record: DECISION,
    },
    builtBy: "scripts/build-harvest-fire-province-series.mjs",
    checkedBy: "scripts/check-harvest-fire-province-series.mjs",
    cellHectares: CELL_HECTARES,
    firstYear: FIRST_YEAR,
    lastYear: LAST_YEAR,
    baselineYear: BASELINE_YEAR,
    measure: {
      en: "Area of forested land whose change the national satellite record dates to a year and attributes to harvest or to fire. It is stand-replacing change, not official burned or harvested area, and not permanent forest loss.",
      fr: "Superficie de terres forestières dont le changement est daté d’une année et attribué à la récolte ou au feu par le registre satellitaire national. Il s’agit d’un changement qui remplace le peuplement, et non de la superficie brûlée ou récoltée officielle, ni d’une perte forestière permanente.",
    },
    sumRule: {
      allowed: "within-one-product",
      en: "Years may be added within harvest, or within fire. Each cell carries at most one change year per product, so a total counts each cell once. Harvest and fire are never added to each other, because one cell can carry both.",
      fr: "Les années peuvent être additionnées pour la récolte, ou pour le feu. Chaque cellule porte au plus une année de changement par produit, de sorte qu’un total compte chaque cellule une seule fois. La récolte et le feu ne sont jamais additionnés, car une même cellule peut porter les deux.",
      record: DECISION,
    },
    unknownPolicy: "1984 has no datable change and is Unknown, never zero. The land the land-cover product leaves unmapped is Unknown for every year and is reported per province; no harvest or fire is dated there.",
    limits: [
      {
        en: "The year is when the change first appears in an image taken around 1 August, give or take 30 days. Fires that burn later in the season can be dated to the following year.",
        fr: "L’année est celle où le changement apparaît pour la première fois sur une image prise vers le 1er août, à 30 jours près. Les incendies qui brûlent plus tard dans la saison peuvent être datés de l’année suivante.",
      },
      {
        en: "Each 30 m cell carries one change year per product, so a stand that burned twice, or was cut twice, appears once.",
        fr: "Chaque cellule de 30 m porte une seule année de changement par produit : un peuplement brûlé deux fois, ou coupé deux fois, n’apparaît qu’une fois.",
      },
      {
        en: "A burned stand that was later salvage-logged is usually counted as fire.",
        fr: "Un peuplement brûlé puis soumis à une coupe de récupération est habituellement compté comme feu.",
      },
      {
        en: "Change near farmland may be missing, because farmland was masked out during change detection.",
        fr: "Des changements près des terres agricoles peuvent manquer, car celles-ci ont été masquées lors de la détection.",
      },
      {
        en: "The record ends in 2022. Later fire seasons, including 2023, are not in it.",
        fr: "La série se termine en 2022. Les saisons des feux suivantes, dont celle de 2023, n’y figurent pas.",
      },
    ],
    sources: {
      harvest: {
        title: "CA Forest Harvest 1985-2022",
        publisher: "Natural Resources Canada, Canadian Forest Service, National Terrestrial Ecosystem Monitoring System (NTEMS)",
        url: "https://opendata.nfis.org/downloads/forest_change/CA_Forest_Harvest_1985-2022.zip",
      },
      fire: {
        title: "Wildfire change year 1985-2022",
        publisher: "Natural Resources Canada, Canadian Forest Service, National Terrestrial Ecosystem Monitoring System (NTEMS)",
        url: "https://opendata.nfis.org/downloads/forest_change/CA_Forest_Fire_1985-2022.zip",
      },
      citation: "Hermosilla, T., M.A. Wulder, J.C. White, N.C. Coops, G.W. Hobart, L.B. Campbell, 2016. Mass data processing of time series Landsat imagery: pixels to data products for forest monitoring. International Journal of Digital Earth 9(11), 1035-1054. https://doi.org/10.1080/17538947.2016.1187673.",
      boundary: "Statistics Canada, 2021 Census Province/Territory Cartographic Boundary File, reference date January 1, 2021.",
      licenceId: "ogl-canada-2.0",
      licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
      attribution: {
        en: "Contains information licensed under the Open Government Licence - Canada. Adapted from Natural Resources Canada, CA Forest Harvest 1985-2022 and Wildfire change year 1985-2022, and from Statistics Canada, 2021 Census Province/Territory Cartographic Boundary File. This does not constitute an endorsement by Natural Resources Canada or Statistics Canada.",
        fr: "Contient de l’information visée par la Licence du gouvernement ouvert – Canada. Adapté de Ressources naturelles Canada, CA Forest Harvest 1985-2022 et Wildfire change year 1985-2022, et de Statistique Canada, Fichier des limites cartographiques des provinces et territoires, Recensement de 2021. Cela ne constitue pas une approbation de Ressources naturelles Canada ni de Statistique Canada.",
      },
      inputs,
    },
    provinces: PROVINCES.map((province) => provinceSeries(province, sources[province.key])),
  };
}

export function serialize(series) {
  return `${JSON.stringify(series, null, 1)}\n`;
}

/** Reads the four inputs and refuses any whose bytes differ from the staging manifest. */
export function readInputs(root, manifest) {
  const sources = {};
  const inputs = [];
  for (const province of PROVINCES) {
    const bytes = readFileSync(resolve(root, inputPath(province.key)));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const entry = manifest.entries.find((candidate) => candidate.id === manifestId(province.key));
    if (!entry) throw new Error(`${province.key}: no staging entry ${manifestId(province.key)}.`);
    if (entry.sha256 !== sha256 || entry.byteLength !== bytes.length) throw new Error(`${province.key}: the input differs from its staging entry.`);
    sources[province.key] = JSON.parse(bytes);
    inputs.push({ province: province.id, path: inputPath(province.key), manifestId: entry.id, sha256, byteLength: bytes.length });
  }
  return { sources, inputs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "data/staged-acquisitions.json")));
  const series = buildSeries(readInputs(resolveDataRoot(), manifest));
  writeFileSync(resolve(repoRoot, OUTPUT), serialize(series));
  console.log(`wrote ${OUTPUT}: ${series.provinces.length} provinces, ${FIRST_YEAR}-${LAST_YEAR}`);
}
