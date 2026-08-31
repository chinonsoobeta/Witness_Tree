#!/usr/bin/env node
/**
 * Measures the same BC forest tenure feature classes through both official BC
 * endpoints and records what each one reports.
 *
 * Why this exists. data/bc-harvesting-authority-access-block.json records
 * serviceCount 46833 for FTEN_HARVEST_AUTH_POLY_SVW, observed on the ArcGIS
 * delivery service, and calls that service live and mutable. It is neither
 * obviously live nor obviously the same population as BC's WFS for the same
 * feature class, and that matters: the record uses the count to argue the layer
 * cannot be represented as an immutable snapshot. An argument resting on a
 * number should rest on a number whose meaning is known.
 *
 * This probe claims nothing about which endpoint is authoritative. BC publishes
 * both; deciding between them is the publisher's to state, not ours to infer.
 * It records counts, the time it read them, and a self-consistency control.
 *
 * The control is the lifecycle sum. Each endpoint is asked for its total and
 * for its PENDING, ACTIVE and RETIRED counts separately. If the three do not
 * add to the total, the endpoint is paging or capping the count and no
 * comparison it took part in means anything, so the run fails rather than
 * reporting numbers it cannot vouch for. This is the same discipline as the
 * axis-order positive control in the cutblock corroboration: prove the query
 * works before believing what it returns.
 *
 * Read-only over HTTP GET. It downloads no features, stages nothing, and moves
 * no gate.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCGIS = "https://delivery.maps.gov.bc.ca/arcgis/rest/services/whse/bcgw_pub_whse_forest_tenure/MapServer";
const WFS = "https://openmaps.gov.bc.ca/geo/pub/wfs";
const LIFECYCLE = ["PENDING", "ACTIVE", "RETIRED"];

const LAYERS = [
  { id: "ften-harvest-authority", featureClass: "WHSE_FOREST_TENURE.FTEN_HARVEST_AUTH_POLY_SVW", arcgisLayer: 12, title: "Forest Tenure Harvesting Authority Polygons" },
  { id: "ften-cutblock-fta4", featureClass: "WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW", arcgisLayer: 8, title: "Forest Tenure Cutblock Polygons (FTA 4.0)" },
];

const fail = (message) => { console.error(`BC endpoint divergence probe stopped: ${message}`); process.exit(1); };

async function text(url) {
  const response = await fetch(url, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) fail(`${url} answered HTTP ${response.status}`);
  return response.text();
}

async function arcgisCount(layer, where) {
  const url = `${ARCGIS}/${layer}/query?where=${encodeURIComponent(where)}&returnCountOnly=true&f=json`;
  const body = JSON.parse(await text(url));
  if (typeof body.count !== "number") fail(`${url} returned no count`);
  return body.count;
}

async function wfsCount(featureClass, cqlFilter) {
  const parameters = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: `pub:${featureClass}`, resultType: "hits" });
  if (cqlFilter) parameters.set("CQL_FILTER", cqlFilter);
  const body = await text(`${WFS}?${parameters}`);
  const matched = body.match(/numberMatched="(\d+)"/)?.[1];
  if (matched === undefined) fail(`WFS hits for ${featureClass} carried no numberMatched`);
  return { count: Number(matched), timeStamp: body.match(/timeStamp="([^"]+)"/)?.[1] ?? null };
}

// A total that does not equal the sum of its parts means the endpoint capped or
// paged the count, and nothing derived from it can be compared to anything.
function control(label, total, byStatus) {
  const summed = LIFECYCLE.reduce((running, status) => running + byStatus[status], 0);
  if (summed !== total) fail(`${label} reported ${total} in total but ${summed} across ${LIFECYCLE.join(", ")}; the count is capped or paged and cannot be compared.`);
  return { total, byStatus, sumsToTotal: true };
}

async function measure(layer) {
  const arcgisByStatus = {};
  const wfsByStatus = {};
  for (const status of LIFECYCLE) {
    arcgisByStatus[status] = await arcgisCount(layer.arcgisLayer, `LIFE_CYCLE_STATUS_CODE='${status}'`);
    wfsByStatus[status] = (await wfsCount(layer.featureClass, `LIFE_CYCLE_STATUS_CODE='${status}'`)).count;
  }
  const arcgisTotal = await arcgisCount(layer.arcgisLayer, "1=1");
  const wfs = await wfsCount(layer.featureClass);

  // The ArcGIS layer index must still name the feature class the WFS names, or
  // the two sides of the comparison are different data and the delta is noise.
  const described = JSON.parse(await text(`${ARCGIS}/${layer.arcgisLayer}?f=json`));
  if (!String(described.description ?? "").includes(layer.featureClass)) {
    fail(`ArcGIS layer ${layer.arcgisLayer} no longer describes ${layer.featureClass}; the layer index has moved.`);
  }
  if (described.definitionExpression) fail(`ArcGIS layer ${layer.arcgisLayer} carries a definition expression, so it is a filtered view rather than the feature class.`);

  return {
    id: layer.id,
    title: layer.title,
    featureClass: layer.featureClass,
    arcgis: { ...control(`ArcGIS layer ${layer.arcgisLayer}`, arcgisTotal, arcgisByStatus), layer: layer.arcgisLayer, definitionExpression: described.definitionExpression ?? null, maxRecordCount: described.maxRecordCount ?? null },
    wfs: { ...control(`WFS ${layer.featureClass}`, wfs.count, wfsByStatus), typeName: `pub:${layer.featureClass}`, serverTimeStamp: wfs.timeStamp },
    delta: { wfsMinusArcgis: wfs.count - arcgisTotal, byStatus: Object.fromEntries(LIFECYCLE.map((status) => [status, wfsByStatus[status] - arcgisByStatus[status]])) },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const value = (flag) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; };
  const evidencePath = value("--evidence-path");
  if (argv.includes("--write-evidence") && !evidencePath) fail("--write-evidence requires an explicit --evidence-path; a defaulted filename can name a date the run did not happen on.");

  const startedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const layers = [];
  for (const layer of LAYERS) layers.push(await measure(layer));
  const service = JSON.parse(await text(`${ARCGIS}?f=json`));

  const record = {
    schemaVersion: "witness-tree/bc-ften-endpoint-divergence/1",
    status: "as-of-query-time-observation",
    published: false,
    productionEligible: false,
    isEdition: false,
    isSnapshot: false,
    purpose: "Records what two official BC endpoints report for the same forest tenure feature classes, so that any argument resting on a feature count states which endpoint produced it. It resolves nothing about which endpoint is authoritative and moves no gate.",
    startedAt,
    completedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    endpoints: {
      arcgis: { url: ARCGIS, serviceDescription: service.serviceDescription ?? null, currentVersion: service.currentVersion ?? null },
      wfs: { url: WFS, version: "2.0.0" },
    },
    control: { rule: "Each endpoint's total must equal the sum of its PENDING, ACTIVE and RETIRED counts. A total that does not reconcile is capped or paged, and the run fails rather than reporting it.", held: true },
    layers,
    doesNotShow: "Which endpoint is authoritative, when either was last refreshed, or that either is complete. BC publishes both and states an as-of time for neither.",
  };

  const body = `${JSON.stringify(record, null, 2)}\n`;
  if (evidencePath) {
    if (path.isAbsolute(evidencePath) || evidencePath.includes("..")) fail("--evidence-path must be a repository-relative path.");
    writeFileSync(path.join(REPO_ROOT, evidencePath), body, { flag: "wx", mode: 0o600 });
    console.log(`Wrote ${evidencePath} (sha256 ${createHash("sha256").update(body).digest("hex")}).`);
  } else {
    console.log(body);
  }
  for (const layer of layers) {
    console.log(`${layer.id}: ArcGIS ${layer.arcgis.total}, WFS ${layer.wfs.total}, WFS minus ArcGIS ${layer.delta.wfsMinusArcgis}.`);
  }
}

await main();
