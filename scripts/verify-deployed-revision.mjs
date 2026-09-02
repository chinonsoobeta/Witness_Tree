#!/usr/bin/env node
/**
 * Asks the deployed Site whether it is running this revision, and says so.
 *
 * Merging to main does not deploy anything. Until someone redeploys, the Site
 * keeps serving an older build, and the difference is invisible from the
 * repository: the code is right, CI is green, and the live page is simply not
 * running it. That gap has already cost one long diagnosis of a route answering
 * 404 where its code returns 503, which was never a defect in the route.
 *
 * This fetches the pages named in data/deployed-revision-markers.json and
 * applies the marker set to what the origin actually answered. It reports
 * exactly what it saw and nothing further: a missing marker proves the deployed
 * page lacks that string, which means the Site is behind this revision. It does
 * not identify the deployed commit, and it never claims a redeploy happened.
 *
 * Read-only over the network. It writes no file, admits nothing, releases
 * nothing, and deploys nothing. Exit 0 means every marker matched; exit 1 means
 * the Site is behind, or a page could not be read, which is not a pass.
 *
 * Usage:
 *   node scripts/verify-deployed-revision.mjs [--origin https://host] [--timeout-ms 20000]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECORD_PATH, evaluateDeployedRevision } from "./check-deployed-revision-markers.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseOptions(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return { origin: value("--origin"), timeoutMs: Number(value("--timeout-ms") ?? 20000) };
}

/** A fetch that could not complete is reported as a page that did not answer. */
async function readPage(origin, route, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(route, origin), { redirect: "follow", signal: controller.signal });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return { status: 0, body: "", error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const record = JSON.parse(readFileSync(path.join(REPO_ROOT, RECORD_PATH), "utf8"));
  const origin = options.origin ?? record.origin;
  const routes = [...new Set(record.markers.map((marker) => marker.path))].sort();

  const pages = Object.fromEntries(
    await Promise.all(routes.map(async (route) => [route, await readPage(origin, route, options.timeoutMs)])),
  );

  const observedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  console.log(`origin ${origin}`);
  console.log(`observed ${observedAt}`);
  for (const route of routes) {
    const page = pages[route];
    const detail = page.error ? ` (${page.error})` : ` (${page.body.length} bytes)`;
    console.log(`  ${route} answered ${page.status}${detail}`);
  }

  const { behind, findings } = evaluateDeployedRevision(record.markers, pages);
  console.log("");
  for (const finding of findings) {
    const mark = finding.ok ? "ok  " : "BEHIND";
    console.log(`  ${mark} ${finding.expect.padEnd(7)} ${finding.path.padEnd(14)} ${finding.outcome.padEnd(18)} ${JSON.stringify(finding.text)}`);
  }
  console.log("");

  if (!behind) {
    console.log("Every marker matched. The deployed Site renders what this revision renders, on the pages swept.");
    return 0;
  }

  const missing = findings.filter((finding) => !finding.ok);
  console.error(`The deployed Site is behind this revision: ${missing.length} of ${findings.length} markers did not match.`);
  console.error("Redeploying the Site is the fix. Nothing in the repository is proven wrong by this result.");
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error.message);
    process.exit(1);
  },
);
