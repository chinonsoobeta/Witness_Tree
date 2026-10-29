// Holds the place share cards to their checked-in digests (plan sections 1.4
// and 9.3). It renders a fixed sample of places, one for each kind of area
// and each coverage state, in both languages, with the same renderer the
// place routes use, and compares each PNG's SHA-256 with the record. A rename,
// a data release or a renderer change has to change the record on purpose
// (`--write`); a stray change fails CI.
//
// Every card must render from the checked-in BC Sans files alone. next/og
// fetches a fallback font from the network when a glyph is missing, so the
// network is refused while the sample renders and any fallback attempt fails
// the check. Every character any card can print is also rendered once, in
// both weights, under the same guard. The record also binds the font files and the renderer's Next.js
// version, because the bytes depend on both.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tsImport } from "tsx/esm/api";

export const RECORD_PATH = "data/share-image-sample-checksums.json";
export const SCHEMA = "share-image-sample-checksums/1";
const FONT_FILES = ["BCSans-Regular.woff", "BCSans-Bold.woff"];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fontDigests() {
  return Object.fromEntries(FONT_FILES.map((name) => [
    `node_modules/@bcgov/bc-sans/fonts/${name}`,
    sha256(readFileSync(path.join(root, "node_modules/@bcgov/bc-sans/fonts", name))),
  ]));
}

function pngSize(bytes) {
  assert.equal(bytes.subarray(1, 4).toString("latin1"), "PNG", "a share card must be a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// tsImport loads a fresh module graph on every call, and each fresh copy of
// next/og starts another image engine, so the modules are loaded once.
let loaded;
function renderer() {
  loaded ??= (async () => {
    const load = (file) => tsImport(pathToFileURL(path.join(root, file)).href, import.meta.url);
    return { receipt: await load("lib/share/receipt.tsx"), pages: await load("lib/place-pages/index.ts") };
  })();
  return loaded;
}

/** Renders each sample with the network refused, failing on any font fallback. */
export async function renderSamples(samples) {
  const previousCwd = process.cwd();
  process.chdir(root);
  const realFetch = globalThis.fetch;
  const realError = console.error;
  const complaints = [];
  globalThis.fetch = async (input) => { throw new Error(`A share card tried to fetch ${String(input)}.`); };
  console.error = (...args) => { complaints.push(args.map(String).join(" ")); };
  try {
    const { receipt, pages } = await renderer();
    const rendered = [];
    for (const sample of samples) {
      const record = pages.placePageRecord(pages.PLACE_DATA_VERSION, sample.geography, sample.code);
      assert.ok(record, `No place page for ${sample.geography}/${sample.code}.`);
      const bytes = Buffer.from(await receipt.renderReceipt(record, sample.locale).arrayBuffer());
      rendered.push({ ...sample, bytes });
    }
    assert.deepEqual(complaints, [], "rendering logged an error, such as a font fallback; every glyph must come from BC Sans");
    return rendered;
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
    process.chdir(previousCwd);
  }
}

/**
 * The sample proves the layout; this proves the font. It collects every
 * character any place's card can print, in both languages, and renders them
 * together in both weights with the network refused, so a name with a glyph
 * BC Sans lacks fails here instead of making the build fetch a fallback.
 */
export async function checkGlyphCoverage() {
  const previousCwd = process.cwd();
  process.chdir(root);
  const realFetch = globalThis.fetch;
  const realError = console.error;
  const complaints = [];
  try {
    const { receipt, pages } = await renderer();
    const characters = new Set();
    let cards = 0;
    for (const { dataVersion, geography, code } of pages.placePageParams()) {
      const record = pages.placePageRecord(dataVersion, geography, code);
      for (const locale of ["en", "fr"]) {
        const markup = renderToStaticMarkup(createElement(receipt.ReceiptCard, { record, locale }));
        for (const character of decodeEntities(markup.replace(/<[^>]*>/g, ""))) characters.add(character);
        cards += 1;
      }
    }
    const text = [...characters].sort().join(" "); // spaced, so the line can wrap
    globalThis.fetch = async (input) => { throw new Error(`A share card tried to fetch ${String(input)}.`); };
    console.error = (...args) => { complaints.push(args.map(String).join(" ")); };
    await receipt.renderGlyphSample(text);
    assert.deepEqual(complaints, [], `a character on some card is missing from BC Sans (checked: ${text})`);
    return { cards, characters: characters.size };
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
    process.chdir(previousCwd);
  }
}

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot);/gi, (_, entity) => {
    if (entity[0] === "#") return String.fromCodePoint(entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    return { amp: "&", lt: "<", gt: ">", quot: '"' }[entity.toLowerCase()];
  });
}

function nextVersion() {
  return JSON.parse(readFileSync(path.join(root, "node_modules/next/package.json"), "utf8")).version;
}

export async function checkShareImages({ write = false } = {}) {
  const record = JSON.parse(readFileSync(path.join(root, RECORD_PATH), "utf8"));
  assert.equal(record.schemaVersion, SCHEMA);
  assert.ok(Array.isArray(record.samples) && record.samples.length > 0, "the record must name a sample");
  const keys = record.samples.map(({ locale, geography, code }) => `${locale}/${geography}/${code}`);
  assert.equal(new Set(keys).size, keys.length, "a sample is named twice");
  for (const locale of ["en", "fr"]) assert.ok(record.samples.some((sample) => sample.locale === locale), `the sample has no ${locale} card`);

  const rendered = await renderSamples(record.samples);
  const current = {
    nextVersion: nextVersion(),
    fonts: fontDigests(),
    samples: rendered.map(({ bytes, ...sample }) => {
      assert.deepEqual(pngSize(bytes), { width: 1200, height: 630 }, `${sample.locale}/${sample.geography}/${sample.code} is not 1200 by 630`);
      return { locale: sample.locale, geography: sample.geography, code: sample.code, state: sample.state, bytes: bytes.length, sha256: sha256(bytes) };
    }),
  };
  // Rendering twice in one process must give the same bytes.
  const again = await renderSamples(record.samples.slice(0, 2));
  for (const [index, { bytes }] of again.entries()) assert.equal(sha256(bytes), current.samples[index].sha256, "the renderer is not deterministic within a run");

  const glyphs = await checkGlyphCoverage();

  if (write) {
    writeFileSync(path.join(root, RECORD_PATH), `${JSON.stringify({ ...record, ...current }, null, 2)}\n`);
    return { written: current.samples.length, glyphs };
  }
  assert.equal(record.nextVersion, current.nextVersion, `the cards were recorded with Next.js ${record.nextVersion}, but ${current.nextVersion} is installed; review the cards and run with --write`);
  assert.deepEqual(record.fonts, current.fonts, "the BC Sans files differ from the recorded ones");
  const changed = current.samples.filter((sample, index) => sample.sha256 !== record.samples[index].sha256 || sample.bytes !== record.samples[index].bytes);
  assert.deepEqual(changed.map(({ locale, geography, code }) => `${locale}/${geography}/${code}`), [], "these share cards changed; if the change is intended, review them and run with --write");
  return { checked: current.samples.length, glyphs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkShareImages({ write: process.argv.includes("--write") });
  console.log(result.written === undefined
    ? `Share-image check passed: ${result.checked} sample cards match their recorded SHA-256, and all ${result.glyphs.characters} characters on ${result.glyphs.cards} cards render from BC Sans.`
    : `Share-image record rewritten for ${result.written} sample cards.`);
}
