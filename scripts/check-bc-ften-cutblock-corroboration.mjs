#!/usr/bin/env node
// Fail-closed check on the internal BC FTEN cutblock corroboration.
//
// The record it guards is deliberately weak evidence: an as-of-query-time look
// at a mutable provincial service, not an edition and not review. The job here
// is to keep it weak. Every assertion below exists to stop the record from
// being read, or edited, into something stronger than it is.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { fisherExactTwoTailed } from "./lib/two-proportion.mjs";

const RECORD = "data/bc-ften-cutblock-corroboration.json";
const RETIREMENT = "data/phase2-expert-review-retirement-2026-08-30.json";
const SCHEMA = "witness-tree/bc-ften-cutblock-corroboration/1";
const PAGE_LIMIT = 10000;
const EXPECTED_CANDIDATES = 100;

function fail(message) {
  throw new Error(message);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function validateBcFtenCutblockCorroboration() {
  const record = await readJson(RECORD);

  if (record.schemaVersion !== SCHEMA) {
    fail(`${RECORD} declares schema ${record.schemaVersion}, expected ${SCHEMA}.`);
  }
  if (record.status !== "as-of-query-time-corroboration") {
    fail(`${RECORD} status drifted to ${record.status}. This record has only one legitimate status.`);
  }

  // The four flags that keep this out of the product. None may ever be true.
  for (const flag of ["published", "productionEligible", "isEdition", "isSnapshot"]) {
    if (record[flag] !== false) {
      fail(`${RECORD} sets ${flag} to ${record[flag]}. A bounded query against a mutable service is none of these.`);
    }
  }
  const claims = record.claims ?? {};
  const requiredClaims = [
    "corroboratesGroundTruth",
    "constitutesReview",
    "provesHarvestOccurred",
    "absenceProvesNoHarvest",
    "isPublisherEdition",
    "movesAnyGate",
  ];
  for (const claim of requiredClaims) {
    if (claims[claim] !== false) {
      fail(`${RECORD} claims ${claim}. Nothing in this record supports that.`);
    }
  }
  if (Object.keys(claims).length !== requiredClaims.length) {
    fail(`${RECORD} carries claims outside the declared set, which this check cannot evaluate.`);
  }

  // The axis-order trap. A run whose control matched nothing produced zeros for
  // a reason that has nothing to do with the ground.
  const control = record.method?.positiveControl;
  if (!control || !(control.numberMatched > 0)) {
    fail(
      `${RECORD} records a positive control that matched ${control?.numberMatched}. ` +
        "Without a control that fires, every zero in this record is unreadable.",
    );
  }
  if (record.method?.pagingTransactionSafe !== false) {
    fail(`${RECORD} claims the WFS paging is transaction safe. The publisher declares it is not.`);
  }
  if (record.method?.pageLimit !== PAGE_LIMIT) {
    fail(`${RECORD} declares a page limit of ${record.method?.pageLimit}, expected ${PAGE_LIMIT}.`);
  }

  // Cross-bind to the same review packet the retirement record names, so the
  // two cannot come to describe different candidate sets.
  const retirement = await readJson(RETIREMENT);
  const packetSha = retirement.stateAtRetirement?.packet?.sha256;
  if (!packetSha) fail(`${RETIREMENT} carries no packet checksum to bind against.`);
  if (record.packet?.sha256 !== packetSha) {
    fail(
      `${RECORD} was run against packet ${record.packet?.sha256}, but ${RETIREMENT} names ${packetSha}. ` +
        "These must be the same candidates.",
    );
  }
  const packetBytes = await readFile(record.packet.path).catch(() => null);
  if (packetBytes) {
    const digest = createHash("sha256").update(packetBytes).digest("hex");
    if (digest !== packetSha) fail(`The review packet on disk digests to ${digest}, not ${packetSha}.`);
  }

  const results = record.results;
  if (!Array.isArray(results) || results.length !== EXPECTED_CANDIDATES) {
    fail(`${RECORD} holds ${results?.length} results, expected ${EXPECTED_CANDIDATES}.`);
  }
  const ids = new Set();
  for (const entry of results) {
    if (ids.has(entry.id)) fail(`${RECORD} repeats candidate ${entry.id}.`);
    ids.add(entry.id);
    if (!Number.isInteger(entry.cutblocksIntersecting) || entry.cutblocksIntersecting < 0) {
      fail(`${entry.id} records a nonsensical cutblock count ${entry.cutblocksIntersecting}.`);
    }
    if (entry.cutblocksIntersecting >= PAGE_LIMIT) {
      fail(`${entry.id} matched ${entry.cutblocksIntersecting} features, at or over the page limit.`);
    }
    const parts = entry.inInterval + entry.outsideInterval + entry.datesMissing;
    if (parts > entry.cutblocksIntersecting) {
      fail(
        `${entry.id} classifies ${parts} cutblocks but only ${entry.cutblocksIntersecting} were matched.`,
      );
    }
    if (entry.inInterval > 0 && entry.cutblocksIntersecting === 0) {
      fail(`${entry.id} reports an in-interval cutblock with no cutblock matched.`);
    }
  }

  // The summary must be a consequence of the results, never a separate claim.
  for (const [key, observedClass] of [
    ["lossObserved", "loss-observed"],
    ["knownNoLoss", "known-no-loss"],
  ]) {
    const subset = results.filter((entry) => entry.observedClass === observedClass);
    const summary = record.summary?.[key];
    if (!summary) fail(`${RECORD} carries no summary for ${observedClass}.`);
    const withAny = subset.filter((entry) => entry.cutblocksIntersecting > 0).length;
    const withInInterval = subset.filter((entry) => entry.inInterval > 0).length;
    if (summary.candidates !== subset.length) {
      fail(`${observedClass} summary counts ${summary.candidates} candidates, results hold ${subset.length}.`);
    }
    if (summary.withAnyCutblock !== withAny) {
      fail(`${observedClass} summary says ${summary.withAnyCutblock} with a cutblock, results give ${withAny}.`);
    }
    if (summary.withCutblockInInterval !== withInInterval) {
      fail(
        `${observedClass} summary says ${summary.withCutblockInInterval} in interval, results give ${withInInterval}.`,
      );
    }
    const anyRate = Number((withAny / subset.length).toFixed(4));
    const inRate = Number((withInInterval / subset.length).toFixed(4));
    if (summary.anyCutblockRate !== anyRate || summary.inIntervalRate !== inRate) {
      fail(`${observedClass} summary rates do not follow from its own counts.`);
    }
  }

  // And the p values must follow from the summary.
  const contrast = record.summary?.contrast;
  if (!contrast) fail(`${RECORD} carries no contrast between the two strata.`);
  for (const [key, field] of [
    ["anyCutblock", "withAnyCutblock"],
    ["cutblockInInterval", "withCutblockInInterval"],
  ]) {
    const loss = record.summary.lossObserved;
    const clear = record.summary.knownNoLoss;
    const expected = Number(
      fisherExactTwoTailed(
        loss[field],
        loss.candidates - loss[field],
        clear[field],
        clear.candidates - clear[field],
      ).toPrecision(4),
    );
    if (contrast[key]?.fisherExactTwoTailedP !== expected) {
      fail(
        `The ${key} p value is recorded as ${contrast[key]?.fisherExactTwoTailedP} but recomputes to ${expected}.`,
      );
    }
    if (contrast[key]?.lossObserved !== `${loss[field]}/${loss.candidates}`) {
      fail(`The ${key} contrast restates the loss-observed counts differently from the summary.`);
    }
    if (contrast[key]?.knownNoLoss !== `${clear[field]}/${clear.candidates}`) {
      fail(`The ${key} contrast restates the known-no-loss counts differently from the summary.`);
    }
  }

  // The caveats are load bearing. Losing one is how a tenure record turns into
  // a harvest record.
  const limits = record.limits ?? [];
  const required = [
    /harvesting authority, not a completed harvest/i,
    /private land/i,
    /mutable and unversioned/i,
    /proxy for containment/i,
    /fire is out of scope/i,
  ];
  for (const pattern of required) {
    if (!limits.some((limit) => pattern.test(limit))) {
      fail(`${RECORD} has lost the limit matching ${pattern}.`);
    }
  }
  if (record.source?.licence?.id !== "ogl-british-columbia") {
    fail(`${RECORD} does not carry the Open Government Licence - British Columbia identifier.`);
  }
  if (!/Open Government Licence - British Columbia/.test(record.source?.attribution ?? "")) {
    fail(`${RECORD} does not carry the required attribution string.`);
  }

  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await validateBcFtenCutblockCorroboration();
  process.stdout.write("BC FTEN cutblock corroboration is internally consistent and claims nothing further.\n");
}
