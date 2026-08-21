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
const LCP_LIMIT_MS = 2_000;
const REFLOW_WIDTH_CSS_PX = 320;
const AXE_VERSION = require("axe-core/package.json").version;
const EXCLUDED = Object.freeze(["screen-reader output", "human visual review", "human forced-colours and CVD review", "field performance", "user-specific browser extensions"]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function validateBrowserEvidence(evidence) {
  if (evidence.schemaVersion !== "witness-tree/phase3-browser-audit/3" || evidence.status !== "example" || evidence.reviewStatus !== "unapproved" || evidence.productionEligible !== false) throw new Error("Browser evidence boundary is invalid.");
  if (!/^Chrome\/\d+(?:\.\d+){3}$/.test(evidence.browser?.product ?? "") || !/^\d+\.\d+$/.test(evidence.browser?.protocolVersion ?? "") || evidence.axeVersion !== AXE_VERSION) throw new Error("Browser or axe metadata is missing or invalid.");
  if (JSON.stringify(evidence.profile) !== JSON.stringify(NETWORK)) throw new Error("Browser evidence network profile does not match the declared simulated-4G profile.");
  if (evidence.thresholds?.lcpMsExclusive !== LCP_LIMIT_MS || evidence.thresholds?.reflowWidthCssPixels !== REFLOW_WIDTH_CSS_PX || evidence.thresholds?.axeViolations !== 0 || evidence.thresholds?.horizontalOverflowPixels !== 0) throw new Error("Browser evidence thresholds do not match the normative gate.");
  if (!Array.isArray(evidence.routes) || evidence.routes.length !== ROUTES.length) throw new Error("Browser evidence route set is incomplete.");
  for (const [index, row] of evidence.routes.entries()) {
    const [template, locale, route] = ROUTES[index];
    if (row.template !== template || row.locale !== locale || row.route !== route) throw new Error(`${route}: template, locale and route identity are not exact.`);
    if (row.landmarks?.documentLang !== row.locale || row.landmarks?.contentLang !== row.locale) throw new Error(`${row.route}: document/content language mismatch.`);
    if (row.landmarks?.main !== 1 || row.landmarks?.banner !== true || row.landmarks?.contentinfo !== true || row.landmarks?.navigations !== 2 || row.landmarks?.headings !== 1 || !Number.isInteger(row.landmarks?.interactive) || row.landmarks.interactive < 1 || row.landmarks?.unnamed !== 0) throw new Error(`${row.route}: landmark evidence is invalid.`);
    if (!Array.isArray(row.lcpRuns) || row.lcpRuns.length !== (row.template === "place" ? 2 : 1) || row.lcpRuns.some((value) => !Number.isFinite(value) || value <= 0 || value >= LCP_LIMIT_MS) || row.lcpMs !== Math.max(...row.lcpRuns)) throw new Error(`${row.route}: LCP runs do not meet the strict normative limit.`);
    if (!/^[a-z][a-z0-9-]*$/.test(row.lcpElement ?? "")) throw new Error(`${row.route}: LCP element evidence is missing or invalid.`);
    if (row.axe?.version !== evidence.axeVersion || !Array.isArray(row.axe?.violations) || row.axe.violations.length !== 0) throw new Error(`${row.route}: axe metadata or results are invalid.`);
    if (row.keyboard?.firstTab !== "skip-link" || row.keyboard?.skipTarget !== "main" || row.keyboard?.order !== "complete-dom-order" || row.keyboard?.wrappedOnce !== true || !Number.isInteger(row.keyboard?.totalTabStops) || row.keyboard.totalTabStops < 2 || row.keyboard?.traversedTabStops !== row.keyboard.totalTabStops || row.keyboard.totalTabStops !== row.landmarks.interactive || !Number.isInteger(row.keyboard?.unfocusedWrapTransitions) || row.keyboard.unfocusedWrapTransitions < 0 || row.keyboard.unfocusedWrapTransitions > 1 || row.keyboard?.unnamed !== 0) throw new Error(`${row.route}: complete keyboard traversal evidence is invalid or inconsistent with landmarks.`);
    const cueRoute = template === "place" || template === "location";
    const variantsValid = (variants, minimum) => Array.isArray(variants) && variants.length >= minimum && variants.every((value) => typeof value === "string" && value.length > 0) && new Set(variants).size === variants.length;
    const patternsValid = (patterns, variants) => Array.isArray(patterns) && patterns.length === variants?.length && patterns.every((value) => typeof value === "string" && value.length > 0) && new Set(patterns).size === patterns.length;
    if (row.forcedColors?.active !== true || row.forcedColors?.blocked !== 0 || row.forcedColors?.contentCharacters < 1 || row.forcedColors?.textDistinguishable !== true || row.forcedColors?.links < 1 || row.forcedColors?.linkFailures !== 0 || !Number.isInteger(row.forcedColors?.evidenceCues) || row.forcedColors.evidenceCues < 0 || row.forcedColors?.evidenceFailures !== 0 || row.forcedColors?.evidenceVariantFailures !== 0 || !Number.isInteger(row.forcedColors?.confidenceCues) || row.forcedColors.confidenceCues < 0 || row.forcedColors?.confidenceFailures !== 0 || row.forcedColors?.confidenceVariantFailures !== 0 || (cueRoute && (row.forcedColors.evidenceCues < 2 || row.forcedColors.confidenceCues < 2 || !variantsValid(row.forcedColors.evidenceVariants, 2) || !patternsValid(row.forcedColors.evidenceVariantGlyphs, row.forcedColors.evidenceVariants) || !variantsValid(row.forcedColors.confidenceVariants, 1) || !patternsValid(row.forcedColors.confidenceVariantPatterns, row.forcedColors.confidenceVariants))) || (!cueRoute && (row.forcedColors.evidenceCues !== 0 || row.forcedColors.confidenceCues !== 0 || row.forcedColors.evidenceVariants?.length !== 0 || row.forcedColors.evidenceVariantGlyphs?.length !== 0 || row.forcedColors.confidenceVariants?.length !== 0 || row.forcedColors.confidenceVariantPatterns?.length !== 0))) throw new Error(`${row.route}: forced-colors semantic evidence is invalid: ${JSON.stringify(row.forcedColors)}.`);
    const expectedLocalScrollRegions = template === "place" ? 2 : 1;
    if (row.reflow?.viewportWidth !== REFLOW_WIDTH_CSS_PX || row.reflow?.visualScale !== 1 || row.reflow?.overflowPixels !== 0 || row.reflow?.localScrollRegions !== expectedLocalScrollRegions) throw new Error(`${row.route}: true 320 CSS-pixel reflow evidence is invalid.`);
  }
  for (let index = 0; index < evidence.routes.length; index += 2) {
    const english = evidence.routes[index]; const french = evidence.routes[index + 1];
    if (english.locale !== "en" || french.locale !== "fr" || english.template !== french.template || JSON.stringify(english.forcedColors.evidenceVariants) !== JSON.stringify(french.forcedColors.evidenceVariants) || JSON.stringify(english.forcedColors.evidenceVariantGlyphs) !== JSON.stringify(french.forcedColors.evidenceVariantGlyphs) || JSON.stringify(english.forcedColors.confidenceVariants) !== JSON.stringify(french.forcedColors.confidenceVariants) || JSON.stringify(english.forcedColors.confidenceVariantPatterns) !== JSON.stringify(french.forcedColors.confidenceVariantPatterns) || english.forcedColors.evidenceCues !== french.forcedColors.evidenceCues || english.forcedColors.confidenceCues !== french.forcedColors.confidenceCues) throw new Error(`${english.template}: paired English/French evidence is inconsistent.`);
  }
  if (JSON.stringify(evidence.excluded) !== JSON.stringify(EXCLUDED)) throw new Error("Browser evidence exclusions are missing or altered.");
  if (evidence.summary?.routes !== ROUTES.length || evidence.summary?.placeLcpRuns !== 4 || evidence.summary?.maxLcpMs !== Math.max(...evidence.routes.map(({ lcpMs }) => lcpMs)) || [evidence.summary.axeViolations, evidence.summary.forcedColorsFailures, evidence.summary.reflowFailures, evidence.summary.keyboardFailures].some((value) => value !== 0)) throw new Error("Browser evidence summary is inconsistent.");
  return evidence;
}

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
  const lcpRuns = [];
  for (let run = 0; run < (template === "place" ? 2 : 1); run++) {
    await cdp.command("Network.clearBrowserCache");
    const loaded = cdp.event("Page.loadEventFired");
    const navigation = await cdp.command("Page.navigate", { url: `${baseUrl}${route}` });
    if (navigation.errorText) throw new Error(`${route}: navigation failed: ${navigation.errorText}.`);
    await loaded;
    await delay(1_000);
    const status = await evaluate(cdp, "document.readyState === 'complete' ? 200 : 0");
    if (status !== 200) throw new Error(`${route}: built page did not finish loading.`);
    const lcp = await evaluate(cdp, `(() => { const entry = window.__phase3Lcp?.at(-1); return entry ? { milliseconds: Number(entry.startTime.toFixed(2)), element: entry.element?.tagName?.toLowerCase() ?? null } : null; })()`);
    if (!lcp || lcp.milliseconds <= 0 || lcp.milliseconds >= LCP_LIMIT_MS) throw new Error(`${route}: LCP ${lcp?.milliseconds ?? "unavailable"} ms is not strictly under ${LCP_LIMIT_MS} ms under the declared simulated-4G profile.`);
    lcpRuns.push(lcp);
  }
  const lcp = lcpRuns.reduce((slowest, result) => result.milliseconds > slowest.milliseconds ? result : slowest);

  await evaluate(cdp, `${axeSource}\n//# sourceURL=axe.min.js`);
  const axe = await evaluate(cdp, `axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }).then(result => ({ version: axe.version, violations: result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })) }))`, { awaitPromise: true });
  if (axe.violations.length) throw new Error(`${route}: axe violations: ${axe.violations.map(({ id, nodes }) => `${id}(${nodes})`).join(", ")}.`);

  const structure = await evaluate(cdp, `(() => { const visible = element => { const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden"; }; const name = element => element.getAttribute("aria-label") || (element.getAttribute("aria-labelledby") ? document.getElementById(element.getAttribute("aria-labelledby"))?.textContent : "") || element.labels?.[0]?.textContent || element.textContent || element.getAttribute("title") || ""; const interactive = [...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter(visible); const main = document.querySelector("main"); return { documentLang: document.documentElement.lang, contentLang: main?.closest("[lang]")?.lang ?? "", main: document.querySelectorAll("main").length, banner: document.querySelectorAll("body header").length > 0, contentinfo: document.querySelectorAll("body footer").length > 0, navigations: document.querySelectorAll("nav").length, headings: document.querySelectorAll("h1").length, interactive: interactive.length, unnamed: interactive.filter(element => !name(element).trim()).length }; })()`);
  if (structure.documentLang !== locale || structure.contentLang !== locale || structure.main !== 1 || !structure.banner || !structure.contentinfo || structure.navigations < 2 || structure.headings !== 1 || structure.interactive < 1 || structure.unnamed !== 0) throw new Error(`${route}: localized language, accessible names or landmark structure failed: ${JSON.stringify(structure)}.`);

  await evaluate(cdp, `document.activeElement?.blur(); scrollTo(0, 0); history.replaceState(null, "", location.pathname + location.search);`);
  await press(cdp, "Tab", "Tab", 9);
  const skip = await evaluate(cdp, `(() => { const element = document.activeElement; const style = getComputedStyle(element); return { className: element.className, href: element.getAttribute("href"), visible: style.transform === "none" || !style.transform.includes("-160") }; })()`);
  if (!String(skip.className).includes("skip-link") || skip.href !== "#main" || !skip.visible) throw new Error(`${route}: first Tab does not expose the skip link.`);
  await press(cdp, "Enter", "Enter", 13);
  await delay(50);
  const skipTarget = await evaluate(cdp, `({ hash: location.hash, activeId: document.activeElement?.id ?? "" })`);
  if (skipTarget.hash !== "#main" || skipTarget.activeId !== "main") throw new Error(`${route}: skip link does not move focus to #main.`);
  const focusPlan = await evaluate(cdp, `(() => { const visible = element => { const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden" && !element.hidden; }; const focusables = [...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter(element => visible(element) && !element.disabled); const main = document.querySelector("main"); const following = focusables.map((element, index) => ({ element, index })).filter(({ element }) => Boolean(main.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)); const preceding = focusables.map((element, index) => ({ element, index })).filter(({ element }) => !Boolean(main.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)); return { total: focusables.length, positiveTabIndex: focusables.filter(element => Number(element.getAttribute("tabindex")) > 0).length, expected: [...following, ...preceding].map(({ index }) => index) }; })()`);
  if (!focusPlan.total || focusPlan.positiveTabIndex !== 0 || focusPlan.expected.length !== focusPlan.total) throw new Error(`${route}: complete keyboard focus plan is invalid: ${JSON.stringify(focusPlan)}.`);
  const visited = [];
  const tabNames = [];
  let unfocusedTransitions = 0;
  for (let attempts = 0; visited.length < focusPlan.total && attempts <= focusPlan.total + 1; attempts++) {
    await press(cdp, "Tab", "Tab", 9);
    const stop = await evaluate(cdp, `(() => { const visible = element => { const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden" && !element.hidden; }; const focusables = [...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter(element => visible(element) && !element.disabled); const element = document.activeElement; return { index: focusables.indexOf(element), name: element?.getAttribute("aria-label") || element?.labels?.[0]?.textContent || element?.textContent?.trim() || element?.getAttribute("title") || "" }; })()`);
    if (stop.index === -1) { unfocusedTransitions++; continue; }
    visited.push(stop.index); tabNames.push(stop.name);
  }
  if (unfocusedTransitions > 1 || tabNames.some((name) => !name) || JSON.stringify(visited) !== JSON.stringify(focusPlan.expected)) throw new Error(`${route}: complete keyboard traversal diverges from DOM order or reaches an unnamed control: ${JSON.stringify({ expected: focusPlan.expected, visited, unfocusedTransitions, unnamedAt: tabNames.findIndex((name) => !name) })}.`);
  await press(cdp, "Tab", "Tab", 9);
  const wrappedIndex = await evaluate(cdp, `(() => { const visible = element => { const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden" && !element.hidden; }; const focusables = [...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter(element => visible(element) && !element.disabled); return focusables.indexOf(document.activeElement); })()`);
  if (wrappedIndex !== focusPlan.expected[0]) throw new Error(`${route}: complete keyboard traversal does not wrap once to its first expected stop.`);

  await cdp.command("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "forced-colors", value: "active" }] });
  const forcedColors = await evaluate(cdp, `(() => { const visible = element => { if (!element) return false; const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && !element.hidden && rect.width > 0 && rect.height > 0; }; const variants = (elements, attribute, selector) => { const grouped = new Map(); for (const element of elements) { const variant = element.dataset[attribute]; const pattern = element.querySelector(selector)?.textContent?.trim() ?? ""; if (!grouped.has(variant)) grouped.set(variant, new Set()); grouped.get(variant).add(pattern); } const rows = [...grouped].sort(([left], [right]) => left.localeCompare(right)); return { names: rows.map(([name]) => name), patterns: rows.map(([, patterns]) => [...patterns][0] ?? ""), failures: rows.filter(([, patterns]) => patterns.size !== 1).length }; }; const main = document.querySelector("main"); const bodyStyle = getComputedStyle(document.body); const mainStyle = getComputedStyle(main); const links = [...document.querySelectorAll("a[href]")].filter(visible); const evidence = [...document.querySelectorAll("[data-evidence]")].filter(visible); const confidence = [...document.querySelectorAll("[data-confidence]")].filter(visible); const evidenceFailures = evidence.filter(element => { const shape = element.querySelector("[data-evidence-shape]"); const label = element.querySelector("[data-evidence-label]"); return !element.dataset.evidence || !visible(shape) || !shape.textContent?.trim() || !visible(label) || !label.textContent?.trim(); }).length; const confidenceFailures = confidence.filter(element => { const label = element.querySelector("[data-confidence-label]"); const bars = element.querySelector("[data-confidence-bars]"); return !element.dataset.confidence || !visible(label) || !label.textContent?.trim() || !visible(bars) || !bars.textContent?.trim(); }).length; const evidenceVariantRows = variants(evidence, "evidence", "[data-evidence-shape]"); const confidenceVariantRows = variants(confidence, "confidence", "[data-confidence-bars]"); const linkFailures = links.filter(element => { const style = getComputedStyle(element); const surroundingStyle = getComputedStyle(element.parentElement ?? document.body); const decorated = style.textDecorationLine.includes("underline") || style.borderBottomStyle !== "none"; return !element.textContent?.trim() || (style.color === surroundingStyle.color && !decorated); }).length; return { active: matchMedia("(forced-colors: active)").matches, blocked: [...document.querySelectorAll("*")].filter(element => getComputedStyle(element).forcedColorAdjust === "none").length, contentCharacters: main?.innerText.trim().length ?? 0, textDistinguishable: mainStyle.color !== bodyStyle.backgroundColor, links: links.length, linkFailures, evidenceCues: evidence.length, evidenceFailures, evidenceVariants: evidenceVariantRows.names, evidenceVariantGlyphs: evidenceVariantRows.patterns, evidenceVariantFailures: evidenceVariantRows.failures, confidenceCues: confidence.length, confidenceFailures, confidenceVariants: confidenceVariantRows.names, confidenceVariantPatterns: confidenceVariantRows.patterns, confidenceVariantFailures: confidenceVariantRows.failures }; })()`);
  if (!forcedColors.active || forcedColors.blocked !== 0 || forcedColors.contentCharacters < 1 || !forcedColors.textDistinguishable || forcedColors.links < 1 || forcedColors.linkFailures !== 0 || forcedColors.evidenceFailures !== 0 || forcedColors.evidenceVariantFailures !== 0 || forcedColors.confidenceFailures !== 0 || forcedColors.confidenceVariantFailures !== 0) throw new Error(`${route}: forced-colors content or non-colour semantics failed: ${JSON.stringify(forcedColors)}.`);

  await cdp.command("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await cdp.command("Emulation.setDeviceMetricsOverride", { width: REFLOW_WIDTH_CSS_PX, height: 900, deviceScaleFactor: 1, mobile: false });
  await delay(50);
  const reflow = await evaluate(cdp, `(() => { const width = document.documentElement.clientWidth; const localScrollRegions = [...document.querySelectorAll("body *")].filter(element => element.scrollWidth > element.clientWidth + 1 && ["auto", "scroll"].includes(getComputedStyle(element).overflowX)).length; return { viewportWidth: innerWidth, visualScale: visualViewport?.scale ?? 1, overflowPixels: Math.max(0, document.documentElement.scrollWidth - width), localScrollRegions }; })()`);
  if (reflow.viewportWidth !== REFLOW_WIDTH_CSS_PX || reflow.visualScale !== 1 || reflow.overflowPixels !== 0) {
    const diagnostics = await evaluate(cdp, `(() => { const width = document.documentElement.clientWidth; return [...document.querySelectorAll("body *")].filter(element => element.getBoundingClientRect().right > width + 1).slice(0, 8).map(element => ({ tag: element.tagName.toLowerCase(), className: String(element.className), right: Math.round(element.getBoundingClientRect().right), overflowX: getComputedStyle(element).overflowX, text: element.textContent?.trim().slice(0, 40) })); })()`);
    throw new Error(`${route}: 320 CSS-pixel reflow has ${reflow.overflowPixels}px page overflow: ${JSON.stringify(diagnostics)}.`);
  }

  return { template, locale, route, lcpMs: lcp.milliseconds, lcpElement: lcp.element, lcpRuns: lcpRuns.map(({ milliseconds }) => milliseconds), axe, keyboard: { firstTab: "skip-link", skipTarget: "main", totalTabStops: focusPlan.total, traversedTabStops: visited.length, order: "complete-dom-order", wrappedOnce: true, unfocusedWrapTransitions: unfocusedTransitions, unnamed: 0 }, landmarks: structure, forcedColors, reflow };
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
    const evidence = { schemaVersion: "witness-tree/phase3-browser-audit/3", status: "example", reviewStatus: "unapproved", productionEligible: false, browser: { product: version.Browser, protocolVersion: version["Protocol-Version"] }, axeVersion: routes[0]?.axe.version, profile: NETWORK, thresholds: { lcpMsExclusive: LCP_LIMIT_MS, axeViolations: 0, horizontalOverflowPixels: 0, reflowWidthCssPixels: REFLOW_WIDTH_CSS_PX }, routes, summary: { routes: routes.length, placeLcpRuns: routes.filter(({ template }) => template === "place").reduce((count, route) => count + route.lcpRuns.length, 0), maxLcpMs: Math.max(...routes.map(({ lcpMs }) => lcpMs)), axeViolations: 0, forcedColorsFailures: 0, reflowFailures: 0, keyboardFailures: 0 }, excluded: EXCLUDED };
    validateBrowserEvidence(evidence);
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
  console.log(`Phase 3 browser audit passed: ${evidence.summary.routes} routes, max simulated-4G LCP ${evidence.summary.maxLcpMs} ms strictly under 2000 ms, complete keyboard traversal, localized document language, forced-colors semantics and 320 CSS-pixel reflow.`);
}
