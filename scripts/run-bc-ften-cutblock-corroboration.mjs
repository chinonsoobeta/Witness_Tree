#!/usr/bin/env node
// Bounded, internal corroboration of BC per-cell review candidates against the
// province's Forest Tenure Cutblock Polygons (FTA 4.0) WFS.
//
// This is NOT an acquisition and NOT an edition. The BC WFS declares
// PagingIsTransactionSafe=false and pages at 10,000 features, and its total
// feature count moves between observations, so no complete snapshot can be
// taken from it. Every query here is a per-candidate bounding box that returns
// far fewer than one page, and the result is recorded strictly as
// as-of-query-time. Nothing produced here is production-eligible, and none of
// it is published on the site.
//
// Semantics that bound what this can show: a cutblock polygon is a *tenure*
// record. Its presence means a harvesting authority covered that ground, not
// that harvest occurred there, and its absence is not evidence that no harvest
// occurred: private land and some licence types are not reported at all.
//
// Axis-order trap, determined empirically before this run and re-proved on
// every run by the positive control below: with `bbox=...,EPSG:4326` the
// service reads lon,lat, but with the URN form `urn:ogc:def:crs:EPSG::4326` it
// reads lat,lon. Passing lon,lat with the URN form returns zero matches with
// HTTP 200 and no warning, which would read as a clean disconfirmation. The
// control makes that failure loud instead of silent.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { fisherExactTwoTailed } from "./lib/two-proportion.mjs";

const WFS = "https://openmaps.gov.bc.ca/geo/pub/wfs";
const TYPE_NAME = "pub:WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW";
const PACKET = "../../Witness_Tree-data/derived/phase2-v21-review-packet-v2/packet.json";
const PACKET_SHA256 = "030ed48f271277436e991263c386626969cb027457155b224b43704b69330906";
const OUTPUT = "data/bc-ften-cutblock-corroboration.json";

// Half-width of the query box around a cell centre, in metres. A cell is 30 m,
// so its half-diagonal is about 21.2 m; the remainder is registration
// tolerance between the 30 m grid and the tenure polygons.
const BOX_HALF_METRES = 45;
const PAGE_LIMIT = 10000;
const REQUEST_SPACING_MS = 400;

// A box over the first feature the service returns, whose match count must be
// greater than zero. It proves the axis order and the service both still work.
const POSITIVE_CONTROL = {
  reason: "A box over known cutblock ground. Zero here means the query is wrong, not that the ground is clear.",
  bbox: [-121.9455, 52.711, -121.9445, 52.712],
};

function boxAround(longitude, latitude) {
  const dLat = BOX_HALF_METRES / 111320;
  const dLon = BOX_HALF_METRES / (111320 * Math.cos((latitude * Math.PI) / 180));
  return [longitude - dLon, latitude - dLat, longitude + dLon, latitude + dLat];
}

function query(bbox, extra = {}) {
  const url = new URL(WFS);
  const params = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: TYPE_NAME,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    bbox: `${bbox.join(",")},EPSG:4326`,
    ...extra,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`WFS returned HTTP ${response.status} for ${url}`);
  const body = await response.json();
  if (typeof body?.numberMatched !== "number") {
    throw new Error(`WFS response carried no numberMatched for ${url}`);
  }
  if (body.numberMatched >= PAGE_LIMIT) {
    throw new Error(
      `A bounding box matched ${body.numberMatched} features, at or over the ${PAGE_LIMIT} page limit. ` +
        "Paging on this service is not transaction safe, so the result cannot be trusted.",
    );
  }
  return body;
}

// `resultType=hits` is answered in XML whatever outputFormat asks for, so the
// count has to be read out of the envelope rather than parsed as JSON.
async function fetchHits(url) {
  const response = await fetch(url, { headers: { accept: "application/xml" } });
  if (!response.ok) throw new Error(`WFS returned HTTP ${response.status} for ${url}`);
  const body = await response.text();
  const match = /numberMatched="(\d+)"/.exec(body);
  if (!match) throw new Error(`WFS hits response carried no numberMatched for ${url}`);
  return Number(match[1]);
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Dates arrive as "2021-01-31Z". Anything unparseable stays null rather than
// becoming a zero or a guess.
function year(value) {
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(String(value ?? ""));
  return match ? Number(match[1]) : null;
}

function intervalBounds(interval) {
  const match = /^(\d{4})-(\d{4})$/.exec(interval);
  if (!match) throw new Error(`Unrecognised interval ${interval}`);
  return { start: Number(match[1]), end: Number(match[2]) };
}

// A cutblock corroborates the interval when its disturbance window overlaps the
// interval at all. A block whose dates are missing is counted separately and is
// never silently treated as either a match or a miss.
function classify(features, interval) {
  const { start, end } = intervalBounds(interval);
  let inInterval = 0;
  let outsideInterval = 0;
  let datesMissing = 0;
  for (const feature of features) {
    const properties = feature?.properties ?? {};
    const from = year(properties.DISTURBANCE_START_DATE);
    const to = year(properties.DISTURBANCE_END_DATE) ?? from;
    if (from === null) {
      datesMissing += 1;
      continue;
    }
    if (from <= end && to >= start) inInterval += 1;
    else outsideInterval += 1;
  }
  return { inInterval, outsideInterval, datesMissing };
}

async function main() {
  const raw = await readFile(PACKET);
  const digest = createHash("sha256").update(raw).digest("hex");
  if (digest !== PACKET_SHA256) {
    throw new Error(`Review packet digest drifted: expected ${PACKET_SHA256}, read ${digest}.`);
  }
  const packet = JSON.parse(raw.toString("utf8"));
  const candidates = packet.samples
    .filter((sample) => sample.province === "BC")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (candidates.length !== 100) {
    throw new Error(`Expected 100 BC candidates, found ${candidates.length}.`);
  }

  const startedAt = new Date().toISOString();

  const controlMatched = await fetchHits(query(POSITIVE_CONTROL.bbox, { resultType: "hits", count: "1" }));
  if (controlMatched <= 0) {
    throw new Error(
      "The positive control matched zero cutblocks. Either the service changed or the bounding box " +
        "axis order is being read the other way round. Refusing to record a corroboration that " +
        "would read as a disconfirmation.",
    );
  }

  const wholeLayerMatched = await fetchHits(
    (() => {
      const url = new URL(WFS);
      for (const [key, value] of Object.entries({
        service: "WFS",
        version: "2.0.0",
        request: "GetFeature",
        typeNames: TYPE_NAME,
        resultType: "hits",
        count: "1",
      })) {
        url.searchParams.set(key, value);
      }
      return url;
    })(),
  );

  const results = [];
  for (const candidate of candidates) {
    const bbox = boxAround(candidate.cell.longitude, candidate.cell.latitude);
    const body = await fetchJson(query(bbox, { count: String(PAGE_LIMIT) }));
    const features = body.features ?? [];
    results.push({
      id: candidate.id,
      interval: candidate.interval,
      observedClass: candidate.observedClass,
      stratum: candidate.stratum,
      cell: { longitude: candidate.cell.longitude, latitude: candidate.cell.latitude },
      bbox,
      cutblocksIntersecting: body.numberMatched,
      ...classify(features, candidate.interval),
      lifeCycleStatusCodes: [
        ...new Set(features.map((feature) => feature?.properties?.LIFE_CYCLE_STATUS_CODE).filter(Boolean)),
      ].sort(),
    });
    process.stderr.write(
      `${results.length}/100 ${candidate.id} ${candidate.observedClass} -> ${body.numberMatched}\n`,
    );
    await pause(REQUEST_SPACING_MS);
  }

  const completedAt = new Date().toISOString();

  const summarise = (observedClass) => {
    const subset = results.filter((entry) => entry.observedClass === observedClass);
    const withAny = subset.filter((entry) => entry.cutblocksIntersecting > 0).length;
    const withInInterval = subset.filter((entry) => entry.inInterval > 0).length;
    return {
      candidates: subset.length,
      withAnyCutblock: withAny,
      withCutblockInInterval: withInInterval,
      anyCutblockRate: Number((withAny / subset.length).toFixed(4)),
      inIntervalRate: Number((withInInterval / subset.length).toFixed(4)),
    };
  };

  // The contrast between the two strata is the only thing here that carries
  // information. Loss-observed and known-no-loss cells were drawn from the same
  // province by the same sampler, so a difference between them is about the
  // detection, not about British Columbia. It is still not ground truth.
  const strata = { lossObserved: summarise("loss-observed"), knownNoLoss: summarise("known-no-loss") };
  const contrastOf = (key) => {
    const loss = strata.lossObserved;
    const clear = strata.knownNoLoss;
    const a = loss[key];
    const c = clear[key];
    return {
      lossObserved: `${a}/${loss.candidates}`,
      knownNoLoss: `${c}/${clear.candidates}`,
      fisherExactTwoTailedP: Number(
        fisherExactTwoTailed(a, loss.candidates - a, c, clear.candidates - c).toPrecision(4),
      ),
    };
  };
  const contrast = {
    anyCutblock: contrastOf("withAnyCutblock"),
    cutblockInInterval: contrastOf("withCutblockInInterval"),
    reading:
      "Tenure ground stays tenure ground for decades, so the any-cutblock contrast is the weaker of " +
      "the two and should not be leaned on. The in-interval contrast is the one that speaks to timing.",
    doesNotShow:
      "A p value here says the two strata differ. It does not say the detection is correct, does not " +
      "measure an error rate, and cannot stand in for inspection of the imagery.",
  };

  const record = {
    schemaVersion: "witness-tree/bc-ften-cutblock-corroboration/1",
    status: "as-of-query-time-corroboration",
    published: false,
    productionEligible: false,
    isEdition: false,
    isSnapshot: false,
    purpose:
      "An internal check on whether the per-cell detected-loss candidates in British Columbia line up " +
      "with the province's own forest tenure record. It exists to inform engineering judgement. It is " +
      "not shown on the site, does not stand in for review, and moves no gate.",
    source: {
      sourceId: "bc-fta-4-cutblocks",
      title: "Forest Tenure Cutblock Polygons (FTA 4.0)",
      publisher: "Province of British Columbia, Forest Tenures Branch",
      catalogueUrl: "https://catalogue.data.gov.bc.ca/dataset/dfb8b498-fa4b-4286-b3ec-58db88aca1cf",
      wfsEndpoint: WFS,
      typeName: TYPE_NAME,
      licence: {
        id: "ogl-british-columbia",
        title: "Open Government Licence - British Columbia",
        url: "https://www2.gov.bc.ca/gov/content?id=A519A56BC2BF44E4A008B33FCF527F61",
      },
      attribution: "Contains information licensed under the Open Government Licence - British Columbia.",
    },
    queryTime: { startedAt, completedAt },
    layerObservation: {
      numberMatchedWholeLayer: wholeLayerMatched,
      note:
        "Recorded only to show that the layer moves. It was 222,198 on 2026-08-14 and is not a stable " +
        "edition marker. Nothing downstream may treat this number as a version.",
    },
    method: {
      boxHalfMetres: BOX_HALF_METRES,
      pageLimit: PAGE_LIMIT,
      pagingTransactionSafe: false,
      whyBounded:
        "Every query returns far fewer features than one page, so unsafe paging is never exercised. " +
        "A box that reached the page limit would abort the run rather than record a partial count.",
      axisOrder:
        "bbox is sent as minLon,minLat,maxLon,maxLat with the short EPSG:4326 form, which this service " +
        "reads lon,lat. The URN form reads lat,lon and silently returns zero for the same numbers.",
      positiveControl: { ...POSITIVE_CONTROL, numberMatched: controlMatched },
      intervalRule:
        "A cutblock corroborates an interval when its disturbance window overlaps that interval at all. " +
        "Blocks with no parseable start date are counted separately and treated as neither match nor miss.",
    },
    packet: { path: PACKET, sha256: PACKET_SHA256, byteLength: raw.byteLength },
    summary: { ...strata, contrast },
    results,
    claims: {
      corroboratesGroundTruth: false,
      constitutesReview: false,
      provesHarvestOccurred: false,
      absenceProvesNoHarvest: false,
      isPublisherEdition: false,
      movesAnyGate: false,
    },
    limits: [
      "A cutblock polygon records a harvesting authority, not a completed harvest.",
      "Private land and some licence types are never reported to this layer, so an absent cutblock is not evidence that nothing happened.",
      "The layer is mutable and unversioned; a rerun on another day may return different counts for the same ground.",
      "A bounding-box intersection is a proxy for containment. A polygon that clips the tolerance ring counts as an intersection.",
      "Fire is out of scope entirely: this layer records tenure, so it can say nothing about the fire-attributed cells.",
    ],
  };

  await writeFile(OUTPUT, `${JSON.stringify(record, null, 2)}\n`);
  process.stderr.write(
    `\nloss-observed  ${record.summary.lossObserved.withAnyCutblock}/${record.summary.lossObserved.candidates} any, ` +
      `${record.summary.lossObserved.withCutblockInInterval} in interval\n` +
      `known-no-loss  ${record.summary.knownNoLoss.withAnyCutblock}/${record.summary.knownNoLoss.candidates} any, ` +
      `${record.summary.knownNoLoss.withCutblockInInterval} in interval\n`,
  );
}

await main();
