import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROUTES = [
  ["place", "en", "/en/places/bc-province?view=table"], ["place", "fr", "/fr/lieux/bc-province?view=table"],
  ["location", "en", "/en/location/lat-p48d000000-lon-n124d000000"], ["location", "fr", "/fr/emplacement/lat-p48d000000-lon-n124d000000"],
  ["methods", "en", "/en/methods"], ["methods", "fr", "/fr/methodes"],
  ["data", "en", "/en/data"], ["data", "fr", "/fr/donnees"],
  ["glossary", "en", "/en/glossary"], ["glossary", "fr", "/fr/glossaire"],
  ["corrections", "en", "/en/corrections"], ["corrections", "fr", "/fr/corrections"],
  ["search", "en", "/en/search?q=British%20Columbia"], ["search", "fr", "/fr/recherche?q=Colombie-Britannique"],
];
const NETWORK = Object.freeze({ name: "declared-simulated-4g", latencyMs: 150, downloadBitsPerSecond: 1_600_000, uploadBitsPerSecond: 750_000, cpuThrottling: false });
const LCP_LIMIT_MS = 2_500;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function chromePath() {
  const candidates = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("A local Chrome/Chromium executable is required for the Phase 3 browser audit.");
  return found;
}

async function waitForFile(file, child, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before its DevTools endpoint was ready (${child.exitCode}).`);
    try { return await readFile(file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await delay(50);
  }
  throw new Error("Chrome DevTools endpoint did not become ready.");
}

async function waitForServer(url, child, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Built app server exited before audit (${child.exitCode}).`);
    try { const response = await fetch(url); if (response.ok) return; } catch { /* The server may still be starting. */ }
    await delay(100);
  }
  throw new Error("Built app server did not become ready.");
}

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.waiters = new Map(); }
  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const waiters = this.waiters.get(message.method) ?? [];
      this.waiters.delete(message.method);
      for (const resolve of waiters) resolve(message.params);
    });
  }
  command(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  event(method, timeoutMs = 20_000) {
    return Promise.race([
      new Promise((resolve) => this.waiters.set(method, [...(this.waiters.get(method) ?? []), resolve])),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${method}.`)), timeoutMs)),
    ]);
  }
  close() { this.socket.close(); }
}

async function evaluate(cdp, expression, { awaitPromise = false } = {}) {
  const result = await cdp.command("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function key(cdp, type, keyValue, code, windowsVirtualKeyCode) {
  await cdp.command("Input.dispatchKeyEvent", { type, key: keyValue, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
}

async function press(cdp, keyValue, code, keyCode) {
  await key(cdp, "rawKeyDown", keyValue, code, keyCode);
  await key(cdp, "keyUp", keyValue, code, keyCode);
}

async function auditRoute(cdp, baseUrl, [template, locale, route], axeSource) {
  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.command("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await cdp.command("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "forced-colors", value: "none" }] });
  await cdp.command("Network.clearBrowserCache");
  const loaded = cdp.event("Page.loadEventFired");
  const navigation = await cdp.command("Page.navigate", { url: `${baseUrl}${route}` });
  if (navigation.errorText) throw new Error(`${route}: navigation failed: ${navigation.errorText}.`);
  await loaded;
  await delay(1_000);
  const status = await evaluate(cdp, "document.readyState === 'complete' ? 200 : 0");
  if (status !== 200) throw new Error(`${route}: built page did not finish loading.`);
  const lcp = await evaluate(cdp, `(() => { const entry = window.__phase3Lcp?.at(-1); return entry ? { milliseconds: Number(entry.startTime.toFixed(2)), element: entry.element?.tagName?.toLowerCase() ?? null } : null; })()`);
  if (!lcp || lcp.milliseconds <= 0 || lcp.milliseconds > LCP_LIMIT_MS) throw new Error(`${route}: LCP ${lcp?.milliseconds ?? "unavailable"}/${LCP_LIMIT_MS} ms under the declared simulated-4G profile.`);

  await evaluate(cdp, `${axeSource}\n//# sourceURL=axe.min.js`);
  const axe = await evaluate(cdp, `axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }).then(result => ({ version: axe.version, violations: result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })) }))`, { awaitPromise: true });
  if (axe.violations.length) throw new Error(`${route}: axe violations: ${axe.violations.map(({ id, nodes }) => `${id}(${nodes})`).join(", ")}.`);

  const structure = await evaluate(cdp, `(() => { const visible = element => { const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden"; }; const name = element => element.getAttribute("aria-label") || (element.getAttribute("aria-labelledby") ? document.getElementById(element.getAttribute("aria-labelledby"))?.textContent : "") || element.labels?.[0]?.textContent || element.textContent || element.getAttribute("title") || ""; const interactive = [...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter(visible); const main = document.querySelector("main"); return { documentLang: document.documentElement.lang, contentLang: main?.closest("[lang]")?.lang ?? "", main: document.querySelectorAll("main").length, banner: document.querySelectorAll("body header").length > 0, contentinfo: document.querySelectorAll("body footer").length > 0, navigations: document.querySelectorAll("nav").length, headings: document.querySelectorAll("h1").length, interactive: interactive.length, unnamed: interactive.filter(element => !name(element).trim()).length }; })()`);
  if (structure.contentLang !== locale || structure.main !== 1 || !structure.banner || !structure.contentinfo || structure.navigations < 2 || structure.headings !== 1 || structure.interactive < 1 || structure.unnamed !== 0) throw new Error(`${route}: accessible names or landmark structure failed: ${JSON.stringify(structure)}.`);

  await evaluate(cdp, `document.activeElement?.blur(); scrollTo(0, 0); history.replaceState(null, "", location.pathname + location.search);`);
  await press(cdp, "Tab", "Tab", 9);
  const skip = await evaluate(cdp, `(() => { const element = document.activeElement; const style = getComputedStyle(element); return { className: element.className, href: element.getAttribute("href"), visible: style.transform === "none" || !style.transform.includes("-160") }; })()`);
  if (!String(skip.className).includes("skip-link") || skip.href !== "#main" || !skip.visible) throw new Error(`${route}: first Tab does not expose the skip link.`);
  await press(cdp, "Enter", "Enter", 13);
  await delay(50);
  const skipTarget = await evaluate(cdp, `({ hash: location.hash, activeId: document.activeElement?.id ?? "" })`);
  if (skipTarget.hash !== "#main" || skipTarget.activeId !== "main") throw new Error(`${route}: skip link does not move focus to #main.`);
  const tabNames = [];
  for (let index = 0; index < 10; index++) { await press(cdp, "Tab", "Tab", 9); tabNames.push(await evaluate(cdp, `document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute("title") || ""`)); }
  if (tabNames.some((name) => !name)) throw new Error(`${route}: keyboard tab order reached an unnamed control.`);

  await cdp.command("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "forced-colors", value: "active" }] });
  const forcedColors = await evaluate(cdp, `({ active: matchMedia("(forced-colors: active)").matches, blocked: [...document.querySelectorAll("*")].filter(element => getComputedStyle(element).forcedColorAdjust === "none").length })`);
  if (!forcedColors.active || forcedColors.blocked !== 0) throw new Error(`${route}: forced-colors emulation is blocked.`);

  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 640, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.command("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  const reflow = await evaluate(cdp, `(() => { const width = document.documentElement.clientWidth; return { viewportWidth: innerWidth, visualScale: visualViewport?.scale ?? 1, overflowPixels: Math.max(0, document.documentElement.scrollWidth - width), offenders: [...document.querySelectorAll("body *")].filter(element => element.getBoundingClientRect().right > width + 1).slice(0, 5).map(element => ({ tag: element.tagName.toLowerCase(), className: String(element.className), right: Math.round(element.getBoundingClientRect().right), text: element.textContent?.trim().slice(0, 40) })) }; })()`);
  if (reflow.visualScale < 1.99 || reflow.overflowPixels !== 0) throw new Error(`${route}: 200% zoom/reflow has ${reflow.overflowPixels}px horizontal overflow: ${JSON.stringify(reflow.offenders)}.`);

  return { template, locale, route, lcpMs: lcp.milliseconds, lcpElement: lcp.element, axe, keyboard: { firstTab: "skip-link", skipTarget: "main", sampledTabStops: tabNames.length, unnamed: 0 }, landmarks: structure, forcedColors, reflow };
}

export async function auditPhase3Browser({ outputPath = argument("--output"), port = Number(argument("--port") ?? 4174) } = {}) {
  const root = path.resolve(new URL("..", import.meta.url).pathname);
  const baseUrl = `http://127.0.0.1:${port}`;
  const profile = await mkdtemp(path.join(os.tmpdir(), "phase3-browser-"));
  const server = spawn(path.resolve(root, "node_modules/.bin/vinext"), ["start", "--port", String(port)], { cwd: root, env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" }, stdio: ["ignore", "pipe", "pipe"] });
  let chrome;
  let cdp;
  try {
    await waitForServer(`${baseUrl}/en/methods`, server);
    chrome = spawn(chromePath(), ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-background-networking", "--remote-debugging-port=0", "--remote-allow-origins=*", `--user-data-dir=${profile}`, "--window-size=1280,900", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    const [portText] = (await waitForFile(path.join(profile, "DevToolsActivePort"), chrome)).trim().split("\n");
    const devtoolsPort = Number(portText);
    const version = await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`).then((response) => response.json());
    const target = await fetch(`http://127.0.0.1:${devtoolsPort}/json/new?about:blank`, { method: "PUT" }).then((response) => response.json());
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all([cdp.command("Page.enable"), cdp.command("Runtime.enable"), cdp.command("Network.enable")]);
    await cdp.command("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.command("Network.emulateNetworkConditions", { offline: false, latency: NETWORK.latencyMs, downloadThroughput: NETWORK.downloadBitsPerSecond / 8, uploadThroughput: NETWORK.uploadBitsPerSecond / 8, connectionType: "cellular4g" });
    await cdp.command("Page.addScriptToEvaluateOnNewDocument", { source: `window.__phase3Lcp = []; new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__phase3Lcp.push(entry); }).observe({ type: "largest-contentful-paint", buffered: true });` });
    const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
    const routes = [];
    for (const route of ROUTES) routes.push(await auditRoute(cdp, baseUrl, route, axeSource));
    const evidence = { schemaVersion: "witness-tree/phase3-browser-audit/1", status: "example", reviewStatus: "unapproved", productionEligible: false, browser: { product: version.Browser, protocolVersion: version["Protocol-Version"] }, axeVersion: routes[0]?.axe.version, profile: NETWORK, thresholds: { lcpMs: LCP_LIMIT_MS, axeViolations: 0, horizontalOverflowPixels: 0 }, routes, summary: { routes: routes.length, maxLcpMs: Math.max(...routes.map(({ lcpMs }) => lcpMs)), axeViolations: 0, forcedColorsFailures: 0, reflowFailures: 0, keyboardFailures: 0 }, excluded: ["screen-reader output", "human visual review", "field performance", "user-specific browser extensions"] };
    if (outputPath) await writeFile(path.resolve(root, outputPath), `${JSON.stringify(evidence, null, 2)}\n`);
    return evidence;
  } finally {
    cdp?.close();
    chrome?.kill("SIGTERM");
    server.kill("SIGTERM");
    await rm(profile, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const evidence = await auditPhase3Browser();
  console.log(`Phase 3 browser audit passed: ${evidence.summary.routes} routes, max simulated-4G LCP ${evidence.summary.maxLcpMs} ms, zero axe/keyboard/forced-colors/reflow failures.`);
}
