#!/usr/bin/env node
/**
 * Asks NRCan's open-data host, directly, which years of each source product it
 * currently publishes, and records the answer with the evidence for it.
 *
 * Why this exists. The site says it covers 1984 to 2022. That is either a fact
 * about the publisher or a fact about how long ago somebody last looked, and
 * from the page alone a reader cannot tell which. If NRCan publishes 2023 and
 * nobody notices, the site goes on presenting a stale range as the record, and
 * the staleness is invisible precisely because nothing changed.
 *
 * What it does NOT do. It downloads nothing, ingests nothing, and moves no
 * gate. Finding a later year published is not the same as having it: the
 * record says a later year exists and the product does not include it, which
 * is a true statement about a gap, not a claim to have closed it.
 *
 * Two controls, because a probe that cannot fail is not evidence.
 *
 *   Positive  The newest already-ingested year must answer 200 with a byte
 *             length. If the host reorganizes its paths, every future year
 *             starts answering "absent" and the watcher would report "no new
 *             data" forever while looking at nothing. The control turns that
 *             silence into a failure.
 *
 *   Negative  A year that cannot exist must answer something other than 200.
 *             Without it, a host that answers 200 for every path would look
 *             like a publisher that had released the next forty years.
 *
 * This host answers an absent archive with a 302 to a not-found page rather
 * than a 404, so "not 200" is the test and the redirect target is recorded.
 *
 * Revision detection. The probe also reads the byte length the host now serves
 * for every already-ingested year and compares it to the bytes actually on
 * disk. A publisher that silently reissues a year we already processed is a
 * different problem from a publisher that adds a year, and it is the more
 * dangerous of the two, because nothing about it looks new.
 */
import { createHash } from "node:crypto";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RECORD_PATH = "data/nrcan-source-currency.json";
export const RECORD_SCHEMA = "witness-tree/nrcan-source-currency/1";
const HOST = "https://opendata.nfis.org/downloads/forest_change";
const NOT_FOUND_MARKER = "notfound";
const IMPOSSIBLE_YEAR = 1900;

/**
 * The three archives this project actually reads. Each names the year that is
 * currently ingested, the directory the ingested bytes live in, and how a year
 * turns into a file name. Nothing here is derived from a file listing: a
 * pattern the project wrote down is a pattern the probe can be wrong about
 * out loud, where a pattern read back from our own directory would only ever
 * confirm itself.
 */
export const PRODUCTS = Object.freeze([
  {
    id: "annual-land-cover-vlce2",
    title: "Annual forest land cover (VLCE2)",
    fileName: (year) => `CA_forest_VLCE2_${year}.zip`,
    ingestedThroughYear: 2022,
    ingestDirectory: "raw/nrcan-annual-land-cover-v2/2026-08-12",
    perYearArchive: true,
  },
  {
    id: "forest-harvest",
    title: "Canada forest harvest",
    fileName: (year) => `CA_Forest_Harvest_1985-${year}.zip`,
    ingestedThroughYear: 2022,
    ingestDirectory: "raw/nrcan-ca-forest-harvest-1985-2022/2026-08-14",
    perYearArchive: false,
  },
  {
    id: "forest-wildfire",
    title: "Canada forest wildfire",
    fileName: (year) => `CA_Forest_Fire_1985-${year}.zip`,
    ingestedThroughYear: 2022,
    ingestDirectory: "raw/nrcan-ca-forest-wildfire-1985-2022/2026-08-14",
    perYearArchive: false,
  },
]);

const fail = (message) => {
  console.error(`NRCan source-currency probe stopped: ${message}`);
  process.exit(1);
};

async function head(url) {
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    headers: { accept: "*/*" },
    signal: AbortSignal.timeout(60_000),
  });
  const location = response.headers.get("location");
  return {
    url,
    status: response.status,
    location: location ?? null,
    contentLength: (() => {
      const raw = response.headers.get("content-length");
      const parsed = raw === null ? Number.NaN : Number(raw);
      return Number.isSafeInteger(parsed) ? parsed : null;
    })(),
    lastModified: response.headers.get("last-modified"),
    etag: response.headers.get("etag"),
  };
}

/** Present means 200 with a real byte length. Everything else is absent. */
export function classify(observation) {
  if (observation.status === 200 && typeof observation.contentLength === "number" && observation.contentLength > 0) {
    return "published";
  }
  if (observation.status >= 300 && observation.status < 400) {
    return (observation.location ?? "").includes(NOT_FOUND_MARKER) ? "absent" : "redirected-elsewhere";
  }
  if (observation.status === 404 || observation.status === 410) return "absent";
  return "unreadable";
}

function ingestedBytes(dataRoot, product) {
  const directory = path.join(dataRoot, product.ingestDirectory);
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    fail(`cannot read the ingested archive directory ${directory}`);
  }
  const measured = {};
  for (const entry of entries) {
    if (!entry.endsWith(".zip")) continue;
    measured[entry] = statSync(path.join(directory, entry)).size;
  }
  if (Object.keys(measured).length === 0) fail(`no ingested archives found in ${directory}`);
  return measured;
}

async function probeProduct(product, dataRoot, throughYear) {
  const control = await head(`${HOST}/${product.fileName(product.ingestedThroughYear)}`);
  if (classify(control) !== "published") {
    fail(
      `${product.id} positive control failed: the already-ingested ${product.ingestedThroughYear} archive ` +
        `answered ${control.status}. Every later year would look absent, so this run reports nothing.`,
    );
  }
  const negative = await head(`${HOST}/${product.fileName(IMPOSSIBLE_YEAR)}`);
  if (classify(negative) === "published") {
    fail(`${product.id} negative control failed: the host published a ${IMPOSSIBLE_YEAR} archive`);
  }

  const candidates = [];
  for (let year = product.ingestedThroughYear + 1; year <= throughYear; year += 1) {
    const observation = await head(`${HOST}/${product.fileName(year)}`);
    const state = classify(observation);
    if (state === "unreadable" || state === "redirected-elsewhere") {
      fail(`${product.id} ${year} answered ${observation.status} toward ${observation.location ?? "nowhere"}; refusing to call that absent`);
    }
    candidates.push({ year, state, ...observation });
  }

  const published = candidates.filter((row) => row.state === "published").map((row) => row.year);
  const latestPublishedYear = published.length > 0 ? Math.max(...published) : product.ingestedThroughYear;

  const onDisk = ingestedBytes(dataRoot, product);
  const ingestedFile = product.fileName(product.ingestedThroughYear);
  const ingestedByteLength = onDisk[ingestedFile];
  if (typeof ingestedByteLength !== "number") {
    fail(`${product.id} has no ingested archive named ${ingestedFile}`);
  }
  const revised = ingestedByteLength !== control.contentLength;

  return {
    id: product.id,
    title: product.title,
    ingestedThroughYear: product.ingestedThroughYear,
    latestPublishedYear,
    behindByYears: latestPublishedYear - product.ingestedThroughYear,
    ingestedArchive: {
      fileName: ingestedFile,
      directory: product.ingestDirectory,
      byteLengthOnDisk: ingestedByteLength,
      byteLengthPublishedNow: control.contentLength,
      lastModifiedPublishedNow: control.lastModified,
      etagPublishedNow: control.etag,
      publisherRevisedSinceIngest: revised,
    },
    positiveControl: { year: product.ingestedThroughYear, status: control.status, contentLength: control.contentLength },
    negativeControl: { year: IMPOSSIBLE_YEAR, status: negative.status, location: negative.location },
    candidates,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dataRootIndex = args.indexOf("--data-root");
  const dataRoot = dataRootIndex >= 0 ? args[dataRootIndex + 1] : process.env.WITNESS_TREE_DATA_ROOT;
  if (!dataRoot) fail("pass --data-root or set WITNESS_TREE_DATA_ROOT; the ingested bytes are the comparison");
  const observedAt = new Date();
  // One year past today, so a publisher that releases early is still seen.
  const throughYear = observedAt.getUTCFullYear() + 1;

  const products = [];
  for (const product of PRODUCTS) {
    products.push(await probeProduct(product, dataRoot, throughYear));
  }

  const record = {
    schema: RECORD_SCHEMA,
    observedAt: observedAt.toISOString(),
    host: HOST,
    probedThroughYear: throughYear,
    impossibleControlYear: IMPOSSIBLE_YEAR,
    absentSignal: "HTTP 302 toward a not-found page; this host does not answer 404 for a missing archive",
    coverageClaim: {
      firstYear: 1984,
      lastYear: Math.min(...products.map((row) => row.ingestedThroughYear)),
      reason: "The site's coverage period is bounded by the ingested years, not by today's date.",
    },
    laterYearPublished: products.some((row) => row.behindByYears > 0),
    publisherRevisedAnIngestedYear: products.some((row) => row.ingestedArchive.publisherRevisedSinceIngest),
    claims: {
      dataIsCurrent: false,
      laterYearsIngested: false,
      publisherConfirmedNoLaterRelease: false,
    },
    products,
  };
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(path.join(REPO_ROOT, RECORD_PATH), serialized);
  const digest = createHash("sha256").update(serialized).digest("hex").slice(0, 12);
  for (const product of products) {
    console.log(
      `${product.id}: ingested through ${product.ingestedThroughYear}, published through ` +
        `${product.latestPublishedYear}${product.behindByYears > 0 ? ` (BEHIND BY ${product.behindByYears})` : ""}` +
        `${product.ingestedArchive.publisherRevisedSinceIngest ? " REVISED SINCE INGEST" : ""}`,
    );
  }
  console.log(`wrote ${RECORD_PATH} (${digest})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
