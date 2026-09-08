#!/usr/bin/env node
/**
 * Drives a real browser against the DEPLOYED Site and records what it observed.
 *
 * phase8 cdn-tile-validation is scoped to the deployed Site. Every other part of
 * it is already evidenced: immutable PMTiles in a private ca-central-1 bucket
 * behind CloudFront, directory and tile ranges at three zooms, decoded
 * province/value assertions, cache hits, CORS, origin isolation. What was
 * missing is browser-side proof taken from the deployed origin rather than from
 * a local build of an unmerged branch.
 *
 * This takes that measurement. It launches the Chromium headless shell already
 * present in the Playwright cache and speaks the DevTools Protocol over a
 * WebSocket, so nothing is added to the dependency tree and the run is
 * reproducible from the repository alone.
 *
 * It asserts four things, and records them whether they hold or not:
 *
 *   1. the PMTiles archive answered with HTTP 206 range responses;
 *   2. the published GeoJSON compatibility fallback was never fetched;
 *   3. the map region settled on data-state="ready" with data-map-source="pmtiles",
 *      and its status copy is the ready copy rather than either fallback copy;
 *   4. the composited canvas contains pixels on the loss ramp, so tiles were
 *      decoded and painted rather than merely requested.
 *
 * Read-only. It admits, releases, ingests and deploys nothing, and it writes no
 * evidence unless --write-evidence is given with an explicit --evidence-path.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_URL = "https://www.witnesstree.ca/en/explore";
const SHELL_CACHE = path.join(homedir(), "Library/Caches/ms-playwright");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseOptions(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    url: value("--url") ?? DEFAULT_URL,
    timeoutMs: Number(value("--timeout-ms") ?? 45000),
    writeEvidence: argv.includes("--write-evidence"),
    evidencePath: value("--evidence-path"),
    browser: value("--browser"),
  };
}

// The headless shell ships in the Playwright cache. Its exact build is recorded
// in the evidence so a later run can say whether it used the same binary.
function resolveBrowser(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) fail(`--browser does not exist: ${explicit}`);
    return explicit;
  }
  if (!existsSync(SHELL_CACHE)) fail(`no Playwright browser cache at ${SHELL_CACHE}; pass --browser`);
  const candidates = [];
  for (const entry of readdirSorted(SHELL_CACHE)) {
    for (const relative of [
      "chrome-headless-shell-mac-arm64/chrome-headless-shell",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    ]) {
      const candidate = path.join(SHELL_CACHE, entry, relative);
      if (existsSync(candidate)) candidates.push(candidate);
    }
  }
  if (candidates.length === 0) fail(`no Chromium found under ${SHELL_CACHE}; pass --browser`);
  return candidates[candidates.length - 1];
}

function readdirSorted(directory) {
  return readdirSync(directory).sort();
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP socket failed to open")), { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${message.error.message} (${entry.method})`));
      else entry.resolve(message.result);
      return;
    }
    for (const listener of listeners) listener(message);
  });

  return {
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
    },
    on(listener) {
      listeners.push(listener);
    },
    close() {
      socket.close();
    },
  };
}


// Minimal decoder for the truecolour PNGs Chrome emits, so the pixel sample
// needs no image dependency. Returns counts rather than the image itself.
function samplePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("screenshot is not a PNG");
  let offset = 8;
  let width = 0, height = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG: bitDepth ${bitDepth}, colorType ${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(height * stride);

  // Undo the per-scanline filters. Without this the sample reads filter deltas
  // rather than colours, which would silently invent a result.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prior = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    const current = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? current[x - channels] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= channels ? prior[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      current[x] = value & 0xff;
    }
  }

  let opaque = 0, ramp = 0;
  const samples = [];
  for (let i = 0; i < out.length; i += channels) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    const a = channels === 4 ? out[i + 3] : 255;
    if (a < 16) continue;
    opaque++;
    // The loss ramp is warm: a painted patch reads red well above blue.
    if (r > b + 20 && r > 40) {
      ramp++;
      if (samples.length < 8) samples.push([r, g, b, a]);
    }
  }
  return { context: true, width, height, opaquePixels: opaque, rampPixels: ramp, samples };
}

async function run(options) {
  const browserPath = resolveBrowser(options.browser);
  const userDataDir = path.join(process.env.TMPDIR ?? "/tmp", `wt-cdp-${process.pid}`);

  const child = spawn(
    browserPath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      // MapLibre needs WebGL. Software rasterization keeps the run headless and
      // machine independent; without it the canvas never composites.
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--hide-scrollbars",
      "--window-size=1280,900",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("browser did not report a DevTools endpoint")), 30000);
    child.stderr.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/ws:\/\/[^\s]+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`browser exited before listening (code ${code})`));
    });
  });

  const cdp = await connect(wsUrl);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

  const requests = [];
  const consoleErrors = [];
  cdp.on((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Network.responseReceived") {
      const { response, type } = message.params;
      requests.push({ url: response.url, status: response.status, type, fromCache: response.fromDiskCache === true });
    }
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(message.params.exceptionDetails?.exception?.description ?? "exception");
    }
  });

  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.navigate", { url: options.url }, sessionId);

  const evaluate = async (expression) => {
    const result = await cdp.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  // Wait for the map region to leave "loading". The component sets data-state
  // itself, so this reads the application's own opinion rather than guessing
  // from timing.
  const settled = await evaluate(`
    (async () => {
      const deadline = Date.now() + ${options.timeoutMs};
      while (Date.now() < deadline) {
        const region = document.querySelector('[data-state][data-map-source]');
        if (region && region.getAttribute('data-state') !== 'loading') {
          return {
            state: region.getAttribute('data-state'),
            source: region.getAttribute('data-map-source'),
            status: (document.getElementById('explore-map-status')?.textContent ?? '').trim(),
          };
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      const region = document.querySelector('[data-state][data-map-source]');
      return {
        state: region ? region.getAttribute('data-state') : 'no-region',
        source: region ? region.getAttribute('data-map-source') : null,
        status: (document.getElementById('explore-map-status')?.textContent ?? '').trim(),
        timedOut: true,
      };
    })()
  `);

  // Sample the composited surface. MapLibre creates its context without
  // preserveDrawingBuffer, so readPixels after a frame returns nothing. The
  // criterion asks about the composited canvas, and a screenshot is exactly
  // that: what the compositor actually painted.
  const geometry = await evaluate(`
    (() => {
      const node = document.querySelector('canvas.maplibregl-canvas') ?? document.querySelector('canvas');
      if (!node) return { present: false };
      const box = node.getBoundingClientRect();
      return { present: true, x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    })()
  `);

  let canvas = { present: false };
  if (geometry.present && geometry.width > 0 && geometry.height > 0) {
    const shot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", clip: { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, scale: 1 }, captureBeyondViewport: true },
      sessionId,
    );
    canvas = { ...samplePng(Buffer.from(shot.data, "base64")), present: true, box: geometry };
  }

  cdp.close();
  child.kill("SIGTERM");

  return { browserPath, requests, consoleErrors, settled, canvas };
}

const DEPLOYED_ORIGIN = "https://www.witnesstree.ca";

/**
 * Which claim this run is entitled to make. Only a run against the Site can say
 * the Site renders; anything else is a preview observation, and the record has
 * to say so itself rather than leaving the reader to compare origins.
 */
function scopeOf(url) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = null;
  }
  return origin === DEPLOYED_ORIGIN ? "deployed-site" : "branch-deployment";
}

/** The commit the working tree is on, so a preview record names what was deployed. */
function currentRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function summarize(observed, options) {
  const style = readFileSync(path.join(REPO_ROOT, "lib/explore/map-style.ts"), "utf8");
  const pmtilesUrl = style.match(/url:\s*"(https:\/\/[^"]+\.pmtiles)"/)?.[1];
  const geojsonUrl = style.match(/"(https:\/\/[^"]+\.geojson)"/)?.[1];
  if (!pmtilesUrl || !geojsonUrl) fail("could not read the PMTiles and GeoJSON URLs from lib/explore/map-style.ts");

  const pmtilesResponses = observed.requests.filter((entry) => entry.url === pmtilesUrl);
  const rangeResponses = pmtilesResponses.filter((entry) => entry.status === 206);
  const fallbackFetches = observed.requests.filter((entry) => entry.url === geojsonUrl);

  const checks = [
    {
      id: "pmtiles-range-responses",
      requirement: "The deployed page fetched the immutable PMTiles archive and the origin answered with HTTP 206 range responses.",
      observed: `${rangeResponses.length} of ${pmtilesResponses.length} responses were 206`,
      pass: rangeResponses.length > 0,
    },
    {
      id: "no-geojson-fallback",
      requirement: "The published GeoJSON compatibility fallback was never fetched.",
      observed: `${fallbackFetches.length} fallback fetches`,
      pass: fallbackFetches.length === 0,
    },
    {
      id: "ready-from-pmtiles",
      requirement: 'The map region settled on data-state="ready" with data-map-source="pmtiles".',
      observed: `state=${observed.settled.state} source=${observed.settled.source}`,
      pass: observed.settled.state === "ready" && observed.settled.source === "pmtiles",
    },
    {
      id: "status-copy-is-not-a-fallback",
      requirement: "The status copy is the ready copy, not either compatibility fallback copy.",
      observed: observed.settled.status.slice(0, 120),
      pass: observed.settled.status.length > 0 && !/compatibility fallback/i.test(observed.settled.status),
    },
    {
      id: "canvas-painted-loss-ramp",
      requirement: "The composited canvas contains pixels on the loss ramp, so tiles were decoded and painted.",
      observed: `${observed.canvas.rampPixels ?? 0} ramp pixels of ${observed.canvas.opaquePixels ?? 0} opaque`,
      pass: (observed.canvas.rampPixels ?? 0) > 0,
    },
  ];

  // Bind the files that determine what this measurement means. If the archive
  // URL or the client changes, the record no longer describes the deployed page
  // and the checker must say so rather than pass on a stale observation. This is
  // the same staleness that let #84 sit on main.
  const sources = ["lib/explore/map-style.ts", "components/explore/ExploreMapClient.tsx"].map((relative) => ({
    path: relative,
    sha256: createHash("sha256").update(readFileSync(path.join(REPO_ROOT, relative))).digest("hex"),
  }));

  const scope = scopeOf(options.url);

  return {
    schemaVersion: "witness-tree/deployed-map-render-evidence/1",
    status: scope === "deployed-site" ? "deployed-site-browser-observation" : "branch-deployment-browser-observation",
    scope,
    // A preview run measures the client where it was served from, which is not
    // the Site. The record carries that distinction itself so it can never be
    // filed as the stronger claim.
    siteObservationOwed: scope !== "deployed-site",
    // This records a measurement taken against a running deployment. It is not
    // an admission, a release, or a production-eligibility record.
    published: false,
    productionEligible: false,
    admissionClaim: false,
    productionAdmission: false,
    observedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    url: options.url,
    revision: currentRevision(),
    browser: { path: observed.browserPath, build: path.basename(path.dirname(path.dirname(observed.browserPath))) },
    archives: { pmtilesUrl, geojsonUrl },
    sources,
    settled: observed.settled,
    canvas: { ...observed.canvas, samples: observed.canvas.samples ?? [] },
    requestCounts: {
      total: observed.requests.length,
      pmtiles: pmtilesResponses.length,
      pmtilesRange: rangeResponses.length,
      geojsonFallback: fallbackFetches.length,
    },
    consoleErrors: observed.consoleErrors,
    checks,
    allChecksPassed: checks.every((entry) => entry.pass),
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const observed = await run(options);
  const record = summarize(observed, options);

  if (options.writeEvidence) {
    if (!options.evidencePath) fail("--write-evidence requires an explicit --evidence-path; a defaulted filename can name a date the run did not happen on.");
    if (path.isAbsolute(options.evidencePath) || options.evidencePath.includes("..")) fail("--evidence-path must be a repository-relative path.");
    const destination = path.join(REPO_ROOT, options.evidencePath);
    writeFileSync(destination, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    record.evidencePath = options.evidencePath;
  }

  console.log(JSON.stringify(record, null, 2));
  if (!record.allChecksPassed) process.exit(1);
}

export { summarize, scopeOf };

if (import.meta.url === `file://${process.argv[1]}`) await main();
