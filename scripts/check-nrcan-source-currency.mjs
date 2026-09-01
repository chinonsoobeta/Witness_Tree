#!/usr/bin/env node
/**
 * Fail-closed gate on what the project knows about its own currency.
 *
 * The gate does not assert that the data is current. It cannot: currency is a
 * fact about NRCan, and no amount of checking in this repository establishes
 * it. What it asserts is narrower and actually checkable:
 *
 *   1. Somebody looked, recently, and the looking left evidence.
 *   2. The looking worked, proven by controls that could have failed.
 *   3. The years the reader may select are the years actually ingested.
 *   4. A later published year, or a publisher revision of a year already
 *      ingested, turns this red until a person says what they decided.
 *
 * Point four is the whole reason the file exists. Staleness is invisible by
 * construction: nothing changes on the page when a new year appears upstream.
 * A gate that goes red is the only way the absence of an event becomes an
 * event.
 *
 * The acknowledged-gap escape is not a way to switch the gate off. It requires
 * a dated owner decision naming the exact gap, and it goes stale the moment
 * the gap widens, so an old acknowledgement cannot cover a new year.
 *
 * Offline. It reads the committed record and the explore year constants and
 * touches no network, so CI can run it. Refreshing the record is
 * `npm run probe:nrcan-source-currency`, which needs the data root.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RECORD_PATH = "data/nrcan-source-currency.json";
export const PROBE_PATH = "scripts/probe-nrcan-source-currency.mjs";
export const YEARS_PATH = "lib/explore/types.ts";
export const RECORD_SCHEMA = "witness-tree/nrcan-source-currency/1";

/*
 * Six months. Long enough that a quiet repository is not punished for being
 * quiet, short enough that a coverage claim on the live site is never more
 * than half a year older than the last time anyone verified it.
 */
export const FRESHNESS_DAYS = 180;

export function exploreYearMax(text) {
  const match = text.match(/export const EXPLORE_YEAR_MAX = (\d+);/);
  return match ? Number(match[1]) : null;
}

export function ingestTable(probeText) {
  const table = [];
  const pattern = /id:\s*"([a-z0-9-]+)"[\s\S]*?ingestedThroughYear:\s*(\d{4})/g;
  for (const match of probeText.matchAll(pattern)) {
    table.push({ id: match[1], ingestedThroughYear: Number(match[2]) });
  }
  return table;
}

export function validateSourceCurrency(record, probeText, yearsText, now) {
  const problems = [];
  const note = (message) => problems.push(message);

  if (record?.schema !== RECORD_SCHEMA) {
    note(`record schema must be ${RECORD_SCHEMA}`);
    return problems;
  }
  const products = Array.isArray(record.products) ? record.products : [];
  if (products.length === 0) note("record names no source products");

  const observedAt = Date.parse(record.observedAt ?? "");
  if (!Number.isFinite(observedAt)) {
    note("observedAt must be an ISO timestamp");
  } else if (observedAt > now) {
    note("observedAt is in the future");
  } else {
    const ageDays = (now - observedAt) / 86_400_000;
    if (ageDays > FRESHNESS_DAYS) {
      note(
        `the last look at the publisher was ${Math.floor(ageDays)} days ago, past the ${FRESHNESS_DAYS}-day window; ` +
          "run npm run probe:nrcan-source-currency",
      );
    }
  }

  for (const [key, expected] of Object.entries({
    dataIsCurrent: false,
    laterYearsIngested: false,
    publisherConfirmedNoLaterRelease: false,
  })) {
    if (record.claims?.[key] !== expected) note(`claims.${key} must be ${expected}; this record establishes no such thing`);
  }

  const declared = ingestTable(probeText);
  if (declared.length !== products.length) {
    note(`the probe declares ${declared.length} products but the record carries ${products.length}`);
  }
  for (const entry of declared) {
    const product = products.find((row) => row.id === entry.id);
    if (!product) {
      note(`record is missing ${entry.id}, which the probe declares`);
      continue;
    }
    if (product.ingestedThroughYear !== entry.ingestedThroughYear) {
      note(
        `${entry.id} is ingested through ${entry.ingestedThroughYear} in the probe but ` +
          `${product.ingestedThroughYear} in the record; re-probe rather than edit the record`,
      );
    }
  }

  for (const product of products) {
    const label = product.id ?? "unnamed product";
    if (product.positiveControl?.status !== 200 || !(product.positiveControl?.contentLength > 0)) {
      note(`${label} positive control did not pass, so its result is not evidence of anything`);
    }
    if (product.negativeControl?.status === 200) {
      note(`${label} negative control did not pass; the host answers 200 for a year that cannot exist`);
    }
    const behind = product.latestPublishedYear - product.ingestedThroughYear;
    if (product.behindByYears !== behind) note(`${label} behindByYears does not match its own years`);
    if (behind < 0) note(`${label} claims to have ingested a year the publisher does not publish`);
  }

  const ingestedLastYear = products.length > 0 ? Math.min(...products.map((row) => row.ingestedThroughYear)) : null;
  if (record.coverageClaim?.lastYear !== ingestedLastYear) {
    note(`coverageClaim.lastYear must be ${ingestedLastYear}, the earliest year any source stops at`);
  }
  const yearMax = exploreYearMax(yearsText);
  if (yearMax === null) {
    note(`cannot read EXPLORE_YEAR_MAX from ${YEARS_PATH}`);
  } else if (yearMax !== ingestedLastYear) {
    note(
      `the reader may select up to ${yearMax} but the archives stop at ${ingestedLastYear}; ` +
        "a selectable year the record cannot answer is a fabricated year",
    );
  }

  const gaps = products.filter((row) => row.behindByYears > 0);
  const revisions = products.filter((row) => row.ingestedArchive?.publisherRevisedSinceIngest === true);
  if (record.laterYearPublished !== gaps.length > 0) note("laterYearPublished does not match the per-product years");
  if (record.publisherRevisedAnIngestedYear !== revisions.length > 0) {
    note("publisherRevisedAnIngestedYear does not match the per-product archives");
  }

  const acknowledged = record.acknowledgedGap ?? null;
  const outstanding = [
    ...gaps.map((row) => `${row.id} published through ${row.latestPublishedYear}, ingested through ${row.ingestedThroughYear}`),
    ...revisions.map((row) => `${row.id} archive ${row.ingestedArchive.fileName} was reissued by the publisher since ingest`),
  ];
  if (outstanding.length > 0) {
    if (!acknowledged) {
      note(
        `the publisher has moved and this project has not: ${outstanding.join("; ")}. ` +
          "Ingest the later years, or record an acknowledgedGap block naming this exact gap and who decided to leave it.",
      );
    } else {
      if (!acknowledged.decidedOn || !acknowledged.decidedBy) {
        note("acknowledgedGap must carry decidedOn and decidedBy");
      }
      const covered = Array.isArray(acknowledged.gaps) ? acknowledged.gaps : [];
      for (const item of outstanding) {
        if (!covered.includes(item)) {
          note(`acknowledgedGap does not cover: ${item}`);
        }
      }
      for (const item of covered) {
        if (!outstanding.includes(item)) {
          note(`acknowledgedGap names a gap that no longer exists: ${item}`);
        }
      }
    }
  } else if (acknowledged) {
    note("acknowledgedGap is present but there is no gap; remove it rather than leave a standing waiver");
  }

  return problems;
}

function main() {
  const record = JSON.parse(readFileSync(path.join(REPO_ROOT, RECORD_PATH), "utf8"));
  const probeText = readFileSync(path.join(REPO_ROOT, PROBE_PATH), "utf8");
  const yearsText = readFileSync(path.join(REPO_ROOT, YEARS_PATH), "utf8");
  const problems = validateSourceCurrency(record, probeText, yearsText, Date.now());
  if (problems.length > 0) {
    console.error("NRCan source currency gate failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const summary = record.products
    .map((row) => `${row.id} through ${row.latestPublishedYear}`)
    .join(", ");
  console.log(
    `${RECORD_PATH}: publisher checked ${record.observedAt.slice(0, 10)}; ${summary}; ` +
      `readers may select through ${exploreYearMax(readFileSync(path.join(REPO_ROOT, YEARS_PATH), "utf8"))}.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
