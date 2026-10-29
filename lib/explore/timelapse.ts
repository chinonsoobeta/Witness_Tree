/*
 * The paper palette of the site's other image downloads (lib/harvest-fire/png.ts),
 * restated rather than imported so the lazily loaded export pulls in nothing
 * else; tests/explore-timelapse.test.ts holds the two together.
 */
export const STAMP_COLOURS = Object.freeze({
  ground: "#fdfcf8",
  ink: "#2c2c24",
  ink2: "#4a4a40",
  ruleStrong: "#948b7a",
});

/*
 * The Explore time-lapse: one map frame per annual interval for a selected
 * boundary, each with its provenance strip burned in, assembled in the
 * reader's browser. Everything here is pure, so the byte layout and the strip
 * can be tested without a browser; components/explore/TimelapseExport.tsx
 * draws the frames and calls these.
 *
 * Nothing here counts patches. The patches are simplified for display and the
 * strip says so; no frame carries a hectare figure.
 */

/** How long each frame shows in the animation and the video. */
export const TIMELAPSE_FRAME_DELAY_MS = 750;
/** Frames are drawn at the reader's map width, never wider than this. */
export const TIMELAPSE_MAX_WIDTH = 1280;

export type TimelapseFormat = "apng" | "sheet" | "webm";

// ---------------------------------------------------------------------------
// PNG chunks and the animated PNG writer
// ---------------------------------------------------------------------------

export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 the PNG specification uses (ISO 3309), over a chunk's type and data. */
export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  let c = crc;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type PngChunk = Readonly<{ type: string; data: Uint8Array }>;

const ascii = (text: string) => Uint8Array.from(text, (character) => character.charCodeAt(0));

/** Splits a PNG into its chunks, checking the signature, every length and every CRC. */
export function readPngChunks(png: Uint8Array): PngChunk[] {
  if (png.length < 8 || PNG_SIGNATURE.some((byte, index) => png[index] !== byte)) throw new Error("Not a PNG: the signature is missing.");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error("Not a PNG: a chunk is cut short.");
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > png.length) throw new Error("Not a PNG: a chunk runs past the end.");
    const typeAndData = png.subarray(offset + 4, offset + 8 + length);
    if (crc32(typeAndData) !== view.getUint32(offset + 8 + length)) throw new Error("Not a PNG: a chunk CRC does not match.");
    const type = String.fromCharCode(...typeAndData.subarray(0, 4));
    chunks.push({ type, data: typeAndData.subarray(4) });
    offset = end;
    if (type === "IEND") break;
  }
  if (chunks[0]?.type !== "IHDR" || chunks.at(-1)?.type !== "IEND") throw new Error("Not a PNG: IHDR or IEND is missing.");
  return chunks;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(ascii(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const u32 = (...values: number[]) => {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value));
  return out;
};

/** acTL: the frame count and the number of plays (0 loops for ever). */
export function actlChunk(frames: number, plays = 0): Uint8Array {
  return chunk("acTL", u32(frames, plays));
}

/**
 * fcTL: one frame's sequence number, size, offset and delay. Every frame here
 * covers the whole image, is not disposed and replaces what was there.
 */
export function fctlChunk(sequence: number, width: number, height: number, delayMs: number): Uint8Array {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  view.setUint32(0, sequence);
  view.setUint32(4, width);
  view.setUint32(8, height);
  view.setUint32(12, 0);
  view.setUint32(16, 0);
  view.setUint16(20, Math.max(0, Math.min(0xffff, Math.round(delayMs))));
  view.setUint16(22, 1000);
  data[24] = 0; // dispose_op: none
  data[25] = 0; // blend_op: source
  return chunk("fcTL", data);
}

const sameBytes = (a: Uint8Array | undefined, b: Uint8Array | undefined) =>
  a === b || (a !== undefined && b !== undefined && a.length === b.length && a.every((byte, index) => byte === b[index]));

// The APNG control chunks are written here; any already in a frame are dropped.
const ANIMATION_CHUNKS = new Set(["acTL", "fcTL", "fdAT"]);

/**
 * Assembles same-sized PNG frames into one animated PNG.
 *
 * The first frame is the default image, so a viewer without APNG support shows
 * it, provenance strip and all. Its ancillary chunks (colour space, density)
 * are kept; each later frame contributes only its image data, as fdAT.
 */
export function assembleApng(frames: readonly Uint8Array[], delayMs = TIMELAPSE_FRAME_DELAY_MS, plays = 0): Uint8Array<ArrayBuffer> {
  if (frames.length === 0) throw new Error("An animation needs at least one frame.");
  const parsed = frames.map(readPngChunks);
  const header = parsed[0]![0]!.data;
  const palette = (chunks: PngChunk[], type: string) => chunks.find((entry) => entry.type === type)?.data;
  for (const [index, chunks] of parsed.entries()) {
    if (!sameBytes(chunks[0]!.data, header)) throw new Error(`Frame ${index + 1} differs in size or pixel format from the first.`);
    if (!sameBytes(palette(chunks, "PLTE"), palette(parsed[0]!, "PLTE")) || !sameBytes(palette(chunks, "tRNS"), palette(parsed[0]!, "tRNS")))
      throw new Error(`Frame ${index + 1} has a different palette from the first.`);
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const width = view.getUint32(0);
  const height = view.getUint32(4);
  const parts: Uint8Array[] = [PNG_SIGNATURE, chunk("IHDR", header), actlChunk(frames.length, plays)];
  let sequence = 0;
  const first = parsed[0]!;
  const firstData = first.findIndex((entry) => entry.type === "IDAT");
  if (firstData < 0) throw new Error("Frame 1 has no image data.");
  // Ancillary chunks that must precede the image data stay where they were.
  for (const entry of first.slice(1, firstData)) if (!ANIMATION_CHUNKS.has(entry.type)) parts.push(chunk(entry.type, entry.data));
  parts.push(fctlChunk(sequence++, width, height, delayMs));
  for (const entry of first) if (entry.type === "IDAT") parts.push(chunk("IDAT", entry.data));
  for (const chunks of parsed.slice(1)) {
    parts.push(fctlChunk(sequence++, width, height, delayMs));
    for (const entry of chunks) {
      if (entry.type !== "IDAT") continue;
      const data = new Uint8Array(4 + entry.data.length);
      new DataView(data.buffer).setUint32(0, sequence++);
      data.set(entry.data, 4);
      parts.push(chunk("fdAT", data));
    }
  }
  parts.push(chunk("IEND", new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** The frame count an animated PNG declares, or null if it has no acTL. */
export function apngFrameCount(png: Uint8Array): number | null {
  const actl = readPngChunks(png).find((entry) => entry.type === "acTL");
  return actl ? new DataView(actl.data.buffer, actl.data.byteOffset, 8).getUint32(0) : null;
}

// ---------------------------------------------------------------------------
// The provenance strip
// ---------------------------------------------------------------------------

const FONT_FAMILY = '"BC Sans", "Noto Sans", Verdana, Arial, sans-serif';

export const STAMP_FONTS = Object.freeze({
  title: `700 18px ${FONT_FAMILY}`,
  interval: `700 16px ${FONT_FAMILY}`,
  body: `12px ${FONT_FAMILY}`,
  product: `700 12px ${FONT_FAMILY}`,
});
export type StampFont = keyof typeof STAMP_FONTS;

const LINE_HEIGHT: Readonly<Record<StampFont, number>> = { title: 24, interval: 22, body: 16, product: 16 };
const STAMP_PADDING = 14;
const BLOCK_GAP = 6;

/** The words on one frame's strip, already in the reader's language. */
export type StampText = Readonly<{
  /** The selected boundary's name. */
  place: string;
  /** What the frame shows and its interval, e.g. "Detected forest loss, 1984–1985". */
  interval: string;
  /** The boundary set and its edition. */
  boundary: string;
  /** The evidence class and the data version, on one line. */
  evidence: string;
  /** What the frame cannot be read as. */
  caveats: readonly string[];
  licence: string;
  /** The product name, printed once at the foot. */
  product: string;
}>;

export type StampLine = Readonly<{ text: string; font: StampFont; x: number; y: number }>;
export type StampLayout = Readonly<{ lines: readonly StampLine[]; height: number }>;
export type MeasureText = (text: string, font: StampFont) => number;

function wrapWords(text: string, width: number, font: StampFont, measure: MeasureText): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, font) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Where every line of the strip goes, for a strip `width` pixels wide. The y
 * values are text baselines measured from the top of the strip. The order is
 * fixed: place, interval, boundary, evidence and data version, caveats,
 * licence, product name.
 */
export function stampLayout(text: StampText, width: number, measure: MeasureText): StampLayout {
  const inner = Math.max(80, width - 2 * STAMP_PADDING);
  const blocks: [string, StampFont][] = [
    [text.place, "title"],
    [text.interval, "interval"],
    [text.boundary, "body"],
    [text.evidence, "body"],
    ...text.caveats.map((caveat): [string, StampFont] => [caveat, "body"]),
    [text.licence, "body"],
    [text.product, "product"],
  ];
  const lines: StampLine[] = [];
  let y = STAMP_PADDING;
  blocks.forEach(([block, font], index) => {
    // Space before the body text and before the product name sets the three parts apart.
    if (index === 2 || index === blocks.length - 1) y += BLOCK_GAP;
    for (const line of wrapWords(block, inner, font, measure)) {
      y += LINE_HEIGHT[font];
      lines.push({ text: line, font, x: STAMP_PADDING, y: y - 5 });
    }
  });
  return { lines, height: y + STAMP_PADDING };
}

type StampContext = Pick<CanvasRenderingContext2D, "fillStyle" | "strokeStyle" | "lineWidth" | "font" | "textAlign" | "textBaseline" | "fillRect" | "fillText" | "beginPath" | "moveTo" | "lineTo" | "stroke">;

/** Paints the strip on paper below the map, `height` tall from `top`, in the light palette of the other image downloads. */
export function drawStamp(ctx: StampContext, layout: StampLayout, top: number, width: number, height = layout.height) {
  ctx.fillStyle = STAMP_COLOURS.ground;
  ctx.fillRect(0, top, width, height);
  ctx.strokeStyle = STAMP_COLOURS.ruleStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(width, top + 0.5);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const line of layout.lines) {
    ctx.font = STAMP_FONTS[line.font];
    ctx.fillStyle = line.font === "body" ? STAMP_COLOURS.ink2 : STAMP_COLOURS.ink;
    ctx.fillText(line.text, line.x, top + line.y);
  }
}

// ---------------------------------------------------------------------------
// The contact sheet
// ---------------------------------------------------------------------------

export type SheetLayout = Readonly<{
  columns: number;
  rows: number;
  cellWidth: number;
  thumbHeight: number;
  labelHeight: number;
  gap: number;
  /** Top-left of each thumbnail. */
  cells: readonly Readonly<{ x: number; y: number }>[];
  /** Height of the grid, where the strip begins. */
  gridHeight: number;
}>;

/**
 * Every frame's map on one image: thumbnails in reading order, each with its
 * interval under it, and one full-size strip for the whole sheet below.
 */
export function contactSheetLayout(count: number, sheetWidth: number, mapWidth: number, mapHeight: number): SheetLayout {
  const gap = 8;
  const labelHeight = 20;
  const columns = Math.max(2, Math.min(6, Math.floor(sheetWidth / 220)));
  const cellWidth = Math.floor((sheetWidth - gap * (columns + 1)) / columns);
  const thumbHeight = Math.max(1, Math.round((cellWidth * mapHeight) / mapWidth));
  const rows = Math.ceil(count / columns);
  const cells = Array.from({ length: count }, (_, index) => ({
    x: gap + (index % columns) * (cellWidth + gap),
    y: gap + Math.floor(index / columns) * (thumbHeight + labelHeight + gap),
  }));
  return { columns, rows, cellWidth, thumbHeight, labelHeight, gap, cells, gridHeight: gap + rows * (thumbHeight + labelHeight + gap) };
}

// ---------------------------------------------------------------------------
// Sizes, names and support
// ---------------------------------------------------------------------------

/*
 * Rough compressed sizes, measured on exported frames of the four-province map
 * (flat fills and patch edges compress well). They are estimates for the
 * reader, printed as "about", and the saved size is reported after export.
 */
const APNG_BYTES_PER_PIXEL = 0.35;
const SHEET_BYTES_PER_PIXEL = 0.6;
export const WEBM_BITS_PER_SECOND = 2_000_000;

export function frameSize(viewportWidth: number, viewportHeight: number): Readonly<{ width: number; height: number }> {
  const width = Math.max(1, Math.min(TIMELAPSE_MAX_WIDTH, Math.round(viewportWidth)));
  return { width, height: Math.max(1, Math.round((viewportHeight * width) / Math.max(1, viewportWidth))) };
}

/** An estimate of the file size in bytes, for the format chooser. */
export function expectedBytes(format: TimelapseFormat, frames: number, width: number, height: number, stripHeight: number): number {
  if (format === "apng") return Math.round(frames * width * (height + stripHeight) * APNG_BYTES_PER_PIXEL);
  if (format === "webm") return Math.round(((WEBM_BITS_PER_SECOND / 8) * frames * TIMELAPSE_FRAME_DELAY_MS) / 1000);
  const sheet = contactSheetLayout(frames, width, width, height);
  return Math.round(width * (sheet.gridHeight + stripHeight) * SHEET_BYTES_PER_PIXEL);
}

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * The geography and the span, and nothing else: no judgement, no product name.
 * The animated PNG keeps the .png extension, so any image viewer opens it.
 */
export function timelapseFileName(place: string, boundarySet: string, fromYear: number, toYear: number, format: TimelapseFormat): string {
  const base = [slug(place), slug(boundarySet), `${fromYear}-${toYear}`].filter(Boolean).join("-");
  return format === "webm" ? `${base}.webm` : format === "sheet" ? `${base}-sheet.png` : `${base}.png`;
}

/** The WebM type this browser can record a canvas into, or null. Feature-detected; no library. */
export function webmRecordingType(scope: Partial<Pick<typeof globalThis, "MediaRecorder" | "HTMLCanvasElement">> = globalThis): string | null {
  const recorder = scope.MediaRecorder;
  const canvas = scope.HTMLCanvasElement;
  if (typeof recorder !== "function" || typeof canvas !== "function" || typeof canvas.prototype.captureStream !== "function") return null;
  if (typeof recorder.isTypeSupported !== "function") return null;
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => recorder.isTypeSupported(type)) ?? null;
}
