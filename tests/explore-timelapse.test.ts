import assert from "node:assert/strict";
import test from "node:test";
import { crc32 as nodeCrc32, deflateSync, inflateSync } from "node:zlib";

import {
  apngFrameCount,
  assembleApng,
  contactSheetLayout,
  crc32,
  expectedBytes,
  frameSize,
  readPngChunks,
  STAMP_COLOURS,
  stampLayout,
  timelapseFileName,
  webmRecordingType,
  type StampText,
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/timelapse.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PNG_COLOURS } from "../lib/harvest-fire/png.ts";

const hex = (text: string) => Uint8Array.from(Buffer.from(text.replace(/\s+/g, ""), "hex"));
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

function pngChunk(type: string, data: Uint8Array) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(nodeCrc32(body), 8 + data.length);
  return out;
}

/** A 1x1 8-bit RGBA PNG built here, independently of the module under test. */
function onePixelPng(rgba: readonly number[]) {
  return Uint8Array.from(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", hex("00000001 00000001 08 06 00 00 00")),
    pngChunk("IDAT", deflateSync(Buffer.from([0, ...rgba]))),
    pngChunk("IEND", new Uint8Array(0)),
  ]));
}

test("crc32 matches the PNG reference values", () => {
  // The CRC of a 1x1 RGBA IHDR and of IEND are the values every such PNG carries.
  assert.equal(crc32(hex("49484452 00000001 00000001 08 06 00 00 00")), 0x1f15c489);
  assert.equal(crc32(Buffer.from("IEND", "latin1")), 0xae426082);
  assert.equal(crc32(Buffer.from("123456789", "latin1")), 0xcbf43926);
});

test("a two-frame APNG has the hand-checked chunk layout", () => {
  const red = onePixelPng([255, 0, 0, 255]);
  const blue = onePixelPng([0, 0, 255, 255]);
  const apng = assembleApng([red, blue], 750);
  const redData = readPngChunks(red).find((entry: { type: string }) => entry.type === "IDAT")!.data as Uint8Array;
  const blueData = readPngChunks(blue).find((entry: { type: string }) => entry.type === "IDAT")!.data as Uint8Array;

  const expected = [
    "89504e470d0a1a0a",
    // IHDR, unchanged from the first frame.
    "0000000d 49484452 00000001 00000001 0806000000 1f15c489",
    // acTL: 2 frames, 0 plays (loop for ever).
    "00000008 6163544c 00000002 00000000 f38d9370",
    // fcTL 0: 1x1 at 0,0, 750/1000 s, dispose none, blend source.
    "0000001a 6663544c 00000000 00000001 00000001 00000000 00000000 02ee 03e8 00 00 05e06af5",
    // The first frame's IDAT, as it was.
    toHex(pngChunk("IDAT", redData)),
    // fcTL 1, then fdAT 2 carrying the second frame's data.
    toHex(pngChunk("fcTL", hex("00000001 00000001 00000001 00000000 00000000 02ee 03e8 00 00"))),
    toHex(pngChunk("fdAT", Uint8Array.from([0, 0, 0, 2, ...blueData]))),
    "00000000 49454e44 ae426082",
  ].join("").replace(/\s+/g, "");
  assert.equal(toHex(apng), expected);
  assert.equal(apngFrameCount(apng), 2);

  // It parses as a PNG: every CRC checks, IHDR first, IEND last, and the
  // default image and the second frame inflate to the pixels they were given.
  const chunks = readPngChunks(apng);
  assert.deepEqual(chunks.map((entry: { type: string }) => entry.type), ["IHDR", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "IEND"]);
  assert.deepEqual([...inflateSync(chunks[3]!.data)], [0, 255, 0, 0, 255]);
  assert.deepEqual([...inflateSync(chunks[5]!.data.subarray(4))], [0, 0, 0, 255, 255]);
});

test("the APNG writer refuses frames it cannot animate together", () => {
  const small = onePixelPng([0, 0, 0, 255]);
  const wide = Uint8Array.from(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", hex("00000002 00000001 08 06 00 00 00")),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0, 255, 0, 0, 0, 255]))),
    pngChunk("IEND", new Uint8Array(0)),
  ]));
  assert.throws(() => assembleApng([small, wide]), /differs in size/);
  assert.throws(() => assembleApng([]), /at least one frame/);
  const corrupt = small.slice();
  corrupt[30] ^= 0xff;
  assert.throws(() => readPngChunks(corrupt), /CRC/);
  assert.throws(() => readPngChunks(new Uint8Array(4)), /signature/);
});

const text: StampText = {
  place: "Skeena—Bulkley Valley",
  interval: "Detected forest loss, 1984–1985",
  boundary: "Boundary: Federal ridings. Elections Canada, 2023 representation order.",
  evidence: "Evidence: Satellite observation · Data: phase2-per-cell-span-archive-four-province-v1 (0de224ad834b)",
  caveats: [
    "Patches are simplified for display and are not for counting.",
    "A boundary does not identify who is responsible for the land.",
  ],
  licence: "Contains information licensed under the Open Government Licence – Canada.",
  product: "Witness Tree",
};
// A fixed-pitch stand-in for canvas text measurement.
const measure = (line: string, font: string) => line.length * (font === "title" ? 10 : font === "interval" ? 9 : 7);

test("the strip carries every caveat in a fixed order, the product name once and no figures", () => {
  const layout = stampLayout(text, 1280, measure);
  const lines = layout.lines.map((line: { text: string }) => line.text);
  assert.deepEqual(lines, [
    text.place,
    text.interval,
    text.boundary,
    text.evidence,
    ...text.caveats,
    text.licence,
    text.product,
  ]);
  assert.equal(lines.filter((line: string) => line.includes("Witness Tree")).length, 1);
  assert.match(lines.join(" "), /Satellite observation/);
  assert.doesNotMatch(lines.join(" "), /\bha\b|hectare/i);
  // Baselines increase, sit inside the strip, and the strip ends below the last line.
  const ys = layout.lines.map((line: { y: number }) => line.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
  assert.ok(layout.height > ys.at(-1)!);
  assert.equal(layout.height, 14 + 24 + 22 + 6 + 16 * 5 + 6 + 16 + 14);
});

test("the strip wraps to its width and grows to hold the wrapped lines", () => {
  const wide = stampLayout(text, 1280, measure);
  const narrow = stampLayout(text, 375, measure);
  assert.ok(narrow.lines.length > wide.lines.length);
  assert.ok(narrow.height > wide.height);
  for (const line of narrow.lines) assert.ok(measure(line.text, line.font) <= 375 - 28 || !line.text.includes(" "), line.text);
  // Nothing is lost in the wrapping.
  const words = (value: string) => value.split(/\s+/).filter(Boolean);
  assert.deepEqual(words(narrow.lines.map((line: { text: string }) => line.text).join(" ")), words(wide.lines.map((line: { text: string }) => line.text).join(" ")));
  // Every interval label has the same length, so every frame's strip is the same height.
  assert.equal(stampLayout({ ...text, interval: "Detected forest loss, 2021–2022" }, 375, measure).height, narrow.height);
});

test("the contact sheet lays every frame out in reading order inside the sheet", () => {
  const layout = contactSheetLayout(38, 1280, 1280, 720);
  assert.equal(layout.columns, 5);
  assert.equal(layout.rows, 8);
  assert.equal(layout.cells.length, 38);
  assert.deepEqual(layout.cells[0], { x: 8, y: 8 });
  assert.equal(layout.cells[1]!.y, 8);
  assert.equal(layout.cells[5]!.x, 8);
  for (const cell of layout.cells) assert.ok(cell.x + layout.cellWidth <= 1280 && cell.y + layout.thumbHeight + layout.labelHeight <= layout.gridHeight);
  assert.equal(contactSheetLayout(38, 375, 375, 500).columns, 2);
});

test("frame size keeps the viewport's shape and never exceeds 1280 pixels across", () => {
  assert.deepEqual(frameSize(1600, 900), { width: 1280, height: 720 });
  assert.deepEqual(frameSize(375, 500), { width: 375, height: 500 });
  assert.ok(expectedBytes("apng", 38, 1280, 720, 200) > expectedBytes("apng", 2, 1280, 720, 200));
  assert.ok(expectedBytes("sheet", 38, 1280, 720, 200) > 0);
  assert.equal(expectedBytes("webm", 2, 1280, 720, 200), 375_000);
});

test("the file name is the geography and the span, and nothing else", () => {
  assert.equal(timelapseFileName("Skeena—Bulkley Valley", "Federal ridings", 1984, 2022, "apng"), "skeena-bulkley-valley-federal-ridings-1984-2022.png");
  assert.equal(timelapseFileName("Trois-Rivières", "Villes et municipalités", 2020, 2022, "sheet"), "trois-rivieres-villes-et-municipalites-2020-2022-sheet.png");
  assert.equal(timelapseFileName("Côte-Nord", "Régions économiques", 1984, 2022, "webm"), "cote-nord-regions-economiques-1984-2022.webm");
});

test("the strip is drawn in the paper palette of the other image downloads", () => {
  assert.deepEqual({ ...STAMP_COLOURS }, {
    ground: PNG_COLOURS.ground,
    ink: PNG_COLOURS.ink,
    ink2: PNG_COLOURS.ink2,
    ruleStrong: PNG_COLOURS.ruleStrong,
  });
});

test("WebM is offered only where a canvas can be recorded", () => {
  assert.equal(webmRecordingType({}), null);
  class Canvas {}
  assert.equal(webmRecordingType({ MediaRecorder: class {} as never, HTMLCanvasElement: Canvas as never }), null);
  class Recordable { captureStream() { return null; } }
  class Recorder { static isTypeSupported(type: string) { return type === "video/webm;codecs=vp8"; } }
  assert.equal(webmRecordingType({ MediaRecorder: Recorder as never, HTMLCanvasElement: Recordable as never }), "video/webm;codecs=vp8");
});
