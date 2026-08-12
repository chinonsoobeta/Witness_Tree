import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WildfireView }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../components/wildfire/WildfireView.tsx";
import { ILLUSTRATIVE_WILDFIRE_FEED }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/wildfire/fixtures.ts";
import { nextScheduledRefresh }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/wildfire/view-model.ts";
import { PRODUCT_NAME }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/domain/brand.ts";

const required = ["Source updated", `Last successful ${PRODUCT_NAME.en} refresh`, "Source agency", "Next scheduled refresh", "Official emergency information"];
const forbidden = ["fore" + "cast", "spread" + " rate", "pre" + "dicted", "causal" + " harvest/fire"];

export function validateWildfireRouteSource(source: string) {
  for (const field of required) if (!source.includes(field)) throw new Error(`Missing wildfire field: ${field}`);
  for (const phrase of forbidden) if (source.toLowerCase().includes(phrase)) throw new Error(`Forbidden wildfire language: ${phrase}`);
}

test("both routes and the rendered shared view retain all required safety fields without forbidden language", async () => {
  const files = [
    new URL("../components/wildfire/WildfireView.tsx", import.meta.url),
    new URL("../lib/wildfire/view-model.ts", import.meta.url),
    new URL("../app/en/wildfire/page.tsx", import.meta.url),
    new URL("../app/fr/incendies/page.tsx", import.meta.url),
  ];
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  const rendered = renderToStaticMarkup(<WildfireView locale="en" feed={ILLUSTRATIVE_WILDFIRE_FEED} now={new Date("2026-08-11T20:00:00Z")} />);
  validateWildfireRouteSource(`${source}\n${rendered}`);
});

test("removing a required public field fails the blocking validator", () => {
  assert.throws(() => validateWildfireRouteSource("Source updated Last successful Witness Tree refresh Source agency Next scheduled refresh"), /Official emergency information/);
});

test("English and French wildfire views independently render", () => {
  const now = new Date("2026-08-11T20:00:00Z");
  assert.match(renderToStaticMarkup(<WildfireView locale="en" feed={ILLUSTRATIVE_WILDFIRE_FEED} now={now} />), /Wildfire context/);
  assert.match(renderToStaticMarkup(<WildfireView locale="fr" feed={ILLUSTRATIVE_WILDFIRE_FEED} now={now} />), /Contexte des incendies/);
});

test("healthy, degraded, and stale views render the correct safe states", () => {
  const healthy = renderToStaticMarkup(<WildfireView locale="en" feed={ILLUSTRATIVE_WILDFIRE_FEED} now={new Date("2026-08-11T20:00:00Z")} />);
  assert.match(healthy, /Illustrative fixture — not live wildfire data/);
  assert.match(healthy, /Illustrative derived estimate/);
  assert.match(healthy, /not a damage or mortality map/);
  const degraded = renderToStaticMarkup(<WildfireView locale="en" feed={{ ...ILLUSTRATIVE_WILDFIRE_FEED, status: "degraded" }} now={new Date("2026-08-11T20:00:00Z")} />);
  assert.match(degraded, /source is degraded/);
  assert.match(degraded, /Official emergency information/);
  const stale = renderToStaticMarkup(<WildfireView locale="en" feed={ILLUSTRATIVE_WILDFIRE_FEED} now={new Date("2026-08-12T20:00:01Z")} />);
  assert.match(stale, /more than 24 hours old/);
  assert.doesNotMatch(stale, /Illustrative derived estimate/);
});

test("next refresh follows Pacific slots and exposes an ISO time for reader-local formatting", () => {
  assert.equal(nextScheduledRefresh(new Date("2026-07-15T19:00:01Z")), "2026-07-15T23:00:00.000Z");
  assert.equal(nextScheduledRefresh(new Date("2026-01-15T20:00:01Z")), "2026-01-16T00:00:00.000Z");
  const html = renderToStaticMarkup(<WildfireView locale="en" feed={ILLUSTRATIVE_WILDFIRE_FEED} now={new Date("2026-07-15T19:00:01Z")} />);
  assert.match(html, /dateTime="2026-07-15T23:00:00.000Z"/);
  assert.doesNotMatch(html, /21:00 America\/Vancouver/);
});
