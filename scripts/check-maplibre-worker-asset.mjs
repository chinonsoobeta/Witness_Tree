#!/usr/bin/env node
/**
 * Proves the vendored MapLibre worker assets under `public/maplibre/<version>/`
 * are byte-identical to the installed `maplibre-gl` distribution, and that the
 * Explore client points at exactly those files.
 *
 * Why these files exist at all. MapLibre resolves its worker as
 * `new URL("./maplibre-gl-worker.mjs", import.meta.url)`, relative to its own
 * bundled chunk. The bundler emits the main chunk but not that sibling module,
 * so the default URL resolves to a path that does not exist and the map fails
 * before any tile request is issued. Serving a version-pinned copy from
 * `public/` and calling `setWorkerUrl` is the smallest fix that keeps the
 * worker byte-identical to the installed package.
 *
 * The worker imports `./maplibre-gl-shared.mjs` as a sibling, so both files
 * must be published together in the same directory.
 *
 * This checker is repository-only. It performs no network access and writes
 * nothing. It is fail-closed: a missing file, a drifted byte, a version
 * mismatch, or a client that references a different path all exit non-zero.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REQUIRED_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
const CLIENT_PATH = "components/explore/ExploreMapClient.tsx";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const readOrNull = async (file) => {
  try {
    return await readFile(file);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
};

export const checkMaplibreWorkerAsset = async (repoRoot) => {
  const failures = [];
  const observed = { version: null, files: [] };

  const packageJsonPath = path.join(
    repoRoot,
    "node_modules",
    "maplibre-gl",
    "package.json",
  );
  const packageRaw = await readOrNull(packageJsonPath);
  if (!packageRaw) {
    failures.push(
      `maplibre-gl is not installed at ${packageJsonPath}. Install dependencies before running this check.`,
    );
    return { ok: false, failures, observed };
  }

  let installedVersion = null;
  try {
    installedVersion = JSON.parse(packageRaw.toString("utf8")).version;
  } catch {
    failures.push(`${packageJsonPath} is not valid JSON.`);
    return { ok: false, failures, observed };
  }
  if (typeof installedVersion !== "string" || installedVersion.length === 0) {
    failures.push(`${packageJsonPath} does not declare a version string.`);
    return { ok: false, failures, observed };
  }
  observed.version = installedVersion;

  const publishedDir = path.join(repoRoot, "public", "maplibre", installedVersion);

  for (const name of REQUIRED_FILES) {
    const distFile = path.join(
      repoRoot,
      "node_modules",
      "maplibre-gl",
      "dist",
      name,
    );
    const publishedFile = path.join(publishedDir, name);

    const distBytes = await readOrNull(distFile);
    if (!distBytes) {
      failures.push(
        `The installed maplibre-gl distribution does not contain ${name} at ${distFile}.`,
      );
      continue;
    }

    const publishedBytes = await readOrNull(publishedFile);
    if (!publishedBytes) {
      failures.push(
        `Missing published worker asset public/maplibre/${installedVersion}/${name}. ` +
          `Copy it from node_modules/maplibre-gl/dist/${name} without modification.`,
      );
      continue;
    }

    const distDigest = sha256(distBytes);
    const publishedDigest = sha256(publishedBytes);
    observed.files.push({
      name,
      publishedPath: `public/maplibre/${installedVersion}/${name}`,
      byteLength: publishedBytes.byteLength,
      sha256: publishedDigest,
    });

    if (distDigest !== publishedDigest) {
      failures.push(
        `public/maplibre/${installedVersion}/${name} is not byte-identical to the installed package. ` +
          `Installed ${distDigest}, published ${publishedDigest}. The published copy must never be edited.`,
      );
    }
  }

  const clientFile = path.join(repoRoot, CLIENT_PATH);
  const clientRaw = await readOrNull(clientFile);
  if (!clientRaw) {
    failures.push(`Missing ${CLIENT_PATH}.`);
    return { ok: failures.length === 0, failures, observed };
  }
  const client = clientRaw.toString("utf8");

  const versionMatch = client.match(
    /const MAPLIBRE_WORKER_VERSION = "([^"]+)";/,
  );
  if (!versionMatch) {
    failures.push(
      `${CLIENT_PATH} does not declare MAPLIBRE_WORKER_VERSION. The client must pin the worker version it serves.`,
    );
  } else if (versionMatch[1] !== installedVersion) {
    failures.push(
      `${CLIENT_PATH} pins MAPLIBRE_WORKER_VERSION "${versionMatch[1]}" but maplibre-gl ${installedVersion} is installed. ` +
        `Republish public/maplibre/${installedVersion}/ and update the constant together.`,
    );
  }

  if (!client.includes("setWorkerUrl(MAPLIBRE_WORKER_URL)")) {
    failures.push(
      `${CLIENT_PATH} does not call setWorkerUrl(MAPLIBRE_WORKER_URL) before constructing the map. ` +
        `Without it MapLibre resolves a worker URL the bundler never emits and the map fails silently.`,
    );
  }

  if (
    !client.includes(
      "`/maplibre/${MAPLIBRE_WORKER_VERSION}/maplibre-gl-worker.mjs`",
    )
  ) {
    failures.push(
      `${CLIENT_PATH} does not build the worker URL from MAPLIBRE_WORKER_VERSION. ` +
        `The served path and the pinned version must not be able to drift apart.`,
    );
  }

  return { ok: failures.length === 0, failures, observed };
};

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const result = await checkMaplibreWorkerAsset(repoRoot);
  if (!result.ok) {
    console.error("FAIL: vendored MapLibre worker assets are not verified.");
    for (const failure of result.failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `PASS: MapLibre ${result.observed.version} worker assets are byte-identical to the installed package and pinned by the Explore client.`,
  );
  for (const file of result.observed.files) {
    console.log(`  ${file.publishedPath} ${file.byteLength} bytes ${file.sha256}`);
  }
}
