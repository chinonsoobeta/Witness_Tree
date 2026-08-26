import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the bilingual language gateway", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Witness Tree/);
  assert.match(html, /Continue in English/);
  assert.match(html, /Continuer en français/);
  assert.match(html, /href="\/en"[^>]*>Continue in English/);
  assert.match(html, /href="\/fr"[^>]*>Continuer en français/);
  assert.doesNotMatch(html, /loading skeleton|taking shape/i);
});

test("renders both localized public records with neutral non-claims", async () => {
  const [english, french] = await Promise.all([
    render("/en").then((response) => response.text()),
    render("/fr").then((response) => response.text()),
  ]);
  assert.match(english, /What happened to the forest here\?/);
  assert.match(english, /does not estimate merchantable timber/);
  assert.match(french, /Qu’est-il arrivé à la forêt ici\?/);
  assert.match(french, /n’estime pas le bois marchand/);
  assert.doesNotMatch(`${english}\n${french}`, /the truth|real-time|complete record/i);
});
