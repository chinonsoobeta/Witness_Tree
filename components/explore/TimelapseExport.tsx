"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { colon, EVIDENCE_DEFINITIONS, formatNumber, formatYearRange, PRODUCT_NAME, yearRange, type Locale } from "@/lib/domain";
import type { BoundarySelection } from "@/lib/explore/boundary-readout";
import type { ForestRegionFigure } from "@/lib/explore/forest-regions";
import type { PerCellCause } from "@/lib/explore/per-cell";
import {
  assembleApng,
  contactSheetLayout,
  drawStamp,
  expectedBytes,
  frameSize,
  STAMP_COLOURS,
  STAMP_FONTS,
  stampLayout,
  TIMELAPSE_FRAME_DELAY_MS,
  timelapseFileName,
  WEBM_BITS_PER_SECOND,
  webmRecordingType,
  type MeasureText,
  type StampText,
  type TimelapseFormat,
} from "@/lib/explore/timelapse";

/*
 * The time-lapse export, loaded only when a reader asks for it, so the Explore
 * page's first paint does not carry it.
 *
 * It draws on a second, hidden map built from the live map's style and camera,
 * with preserveDrawingBuffer on, and removes it when the file is made. The
 * live map keeps its own years, mode and figures, and the reader can go on
 * using it while the export runs.
 */

type Span = Readonly<{ fromYear: number; toYear: number }>;

/*
 * What the live map lends the export: how to set up a map and show one span on
 * it, and the record the frames are stamped with. Passed in rather than
 * imported, so this lazily loaded island adds no module the map does not hold.
 */
export type TimelapseHooks = Readonly<{
  prepare: (map: MapLibreMap) => void;
  apply: (map: MapLibreMap, span: Span, regions: readonly ForestRegionFigure[]) => void;
  /** Whether the map shades the owner's regions, whose figures are fetched per span. */
  needsRegions: boolean;
  /** The boundary set, e.g. "Federal ridings", and its edition and source. */
  boundarySet: string;
  boundarySource: string;
  /** The patch archive's product and release, which every frame names. */
  dataVersion: string;
  /** The opening year of the first interval and the closing year of the last. */
  firstYear: number;
  lastYear: number;
}>;
const FRAME_TIMEOUT_MS = 60_000;

const text = {
  en: {
    heading: "Download the years as an animation",
    intro: (place: string, span: string) =>
      `${place}, as the map shows it now: one image for each year ${span}, with its sources and limits written on every image.`,
    format: "Format",
    apng: "Animated PNG",
    sheet: "Contact sheet: every year on one PNG",
    webm: "WebM video",
    about: (size: string) => `about ${size}`,
    from: "From",
    to: "To",
    frames: (count: number, width: number, height: number) => `${count} images, ${width} × ${height} pixels each.`,
    make: "Make the file",
    cancel: "Cancel",
    close: "Close",
    working: "You can keep using the page while this runs.",
    drawing: (span: string, index: number, total: number) => `Drawing ${span} (${index} of ${total})…`,
    assembling: "Putting the file together…",
    recording: "Recording the video in real time…",
    done: (name: string, size: string) => `Saved ${name} (${size}).`,
    cancelled: "Cancelled. Nothing was saved.",
    failed: "The file couldn’t be made. Try again, or choose fewer years.",
    megabytes: "MB",
    kilobytes: "KB",
    stamp: {
      interval: { all: "Detected forest loss", harvest: "Detected loss with a recorded harvest", fire: "Detected loss with a recorded fire" },
      boundary: "Boundary",
      evidence: "Evidence",
      data: "Data",
      shading: {
        loss: "Shading is detected loss in the interval as a share of the mapped forest at its start.",
        harvest: "Shading is the average share of the forest with a recorded harvest per year.",
        fire: "Shading is the average share of the forest with a recorded fire per year.",
      },
      patches:
        "Patches are simplified for display and are not for counting. Nobody has checked them on the ground, and an area with no patch doesn’t mean no loss happened there.",
      filtered: "Only patches the official record marks this way are drawn; the record may not cover an empty area.",
      responsibility: "A boundary does not identify a government, landowner, tenure holder or fire management authority responsible for the land.",
      licence:
        "Contains information licensed under the Open Government Licence – Canada. Adapted from Natural Resources Canada forest land cover and disturbance data and Statistics Canada 2021 boundaries; no endorsement by either is implied.",
      sheet: (title: string, span: string) => `${title}, ${span}, one image per year`,
    },
  },
  fr: {
    heading: "Télécharger les années en animation",
    intro: (place: string, span: string) =>
      `${place}, tel que la carte le montre maintenant\u202F: une image pour chaque année ${span}, avec ses sources et ses limites inscrites sur chaque image.`,
    format: "Format",
    apng: "PNG animé",
    sheet: "Planche contact\u202F: toutes les années sur un seul PNG",
    webm: "Vidéo WebM",
    about: (size: string) => `environ ${size}`,
    from: "De",
    to: "À",
    frames: (count: number, width: number, height: number) => `${count} images de ${width} × ${height} pixels chacune.`,
    make: "Créer le fichier",
    cancel: "Annuler",
    close: "Fermer",
    working: "Vous pouvez continuer à utiliser la page pendant ce temps.",
    drawing: (span: string, index: number, total: number) => `Dessin de ${span} (${index} sur ${total})…`,
    assembling: "Assemblage du fichier…",
    recording: "Enregistrement de la vidéo en temps réel…",
    done: (name: string, size: string) => `Enregistré\u202F: ${name} (${size}).`,
    cancelled: "Annulé. Rien n’a été enregistré.",
    failed: "Le fichier n’a pas pu être créé. Réessayez ou choisissez moins d’années.",
    megabytes: "Mo",
    kilobytes: "ko",
    stamp: {
      interval: { all: "Perte forestière détectée", harvest: "Perte détectée avec récolte consignée", fire: "Perte détectée avec incendie consigné" },
      boundary: "Limite",
      evidence: "Preuve",
      data: "Données",
      shading: {
        loss: "La coloration montre la perte détectée pendant la période, en proportion de la forêt cartographiée à son début.",
        harvest: "La coloration montre la part moyenne de la forêt avec récolte consignée par année.",
        fire: "La coloration montre la part moyenne de la forêt avec incendie consigné par année.",
      },
      patches:
        "Les parcelles sont simplifiées pour l’affichage et ne servent pas au calcul. Personne ne les a vérifiées sur le terrain, et une zone sans parcelle ne veut pas dire qu’aucune perte n’y est survenue.",
      filtered: "Seules les parcelles ainsi désignées par le registre officiel sont dessinées\u202F; le registre ne couvre peut-être pas une zone vide.",
      responsibility: "Une limite n’indique pas quel gouvernement, propriétaire, titulaire de tenure ou organisme de lutte contre les incendies est responsable du territoire.",
      licence:
        "Contient de l’information visée par la Licence du gouvernement ouvert – Canada. Adapté de données de couverture forestière et de perturbations de Ressources naturelles Canada et des limites de 2021 de Statistique Canada\u202F; aucune approbation de leur part n’est sous-entendue.",
      sheet: (title: string, span: string) => `${title}, ${span}, une image par année`,
    },
  },
} as const;

type Phase =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "drawing"; index: number; total: number; span: string }>
  | Readonly<{ kind: "assembling" | "recording" }>
  | Readonly<{ kind: "done"; name: string; bytes: number }>
  | Readonly<{ kind: "cancelled" | "failed" }>;

function formatBytes(bytes: number, locale: Locale) {
  const words = text[locale];
  return bytes >= 1_000_000
    ? `${formatNumber(bytes / 1_000_000, locale, 1)} ${words.megabytes}`
    : `${formatNumber(Math.max(1, Math.round(bytes / 1000)), locale, 0)} ${words.kilobytes}`;
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const aborted = () => new DOMException("The export was cancelled.", "AbortError");

/** Resolves when `event` fires on the map, rejecting on cancel or timeout. */
function mapEvent(map: MapLibreMap, event: "load" | "idle", signal: AbortSignal, kick?: () => void) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      map.off(event, onEvent);
      if (error) reject(error);
      else resolve();
    };
    const onEvent = () => finish();
    const onAbort = () => finish(aborted());
    const timer = setTimeout(() => finish(new Error(`The map did not finish drawing (${event}).`)), FRAME_TIMEOUT_MS);
    if (signal.aborted) return finish(aborted());
    signal.addEventListener("abort", onAbort);
    map.on(event, onEvent);
    kick?.();
  });
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function regionsFor(span: Span, signal: AbortSignal): Promise<readonly ForestRegionFigure[]> {
  try {
    const response = await fetch(`/api/explore/district-spans?from=${span.fromYear}&to=${span.toYear}`, { signal });
    if (!response.ok) return [];
    const body = (await response.json()) as { fromYear?: unknown; toYear?: unknown; forestRegions?: unknown };
    // An answer for another span is not used; the provinces still shade this one.
    return body.fromYear === span.fromYear && body.toYear === span.toYear && Array.isArray(body.forestRegions)
      ? (body.forestRegions as ForestRegionFigure[])
      : [];
  } catch (error: unknown) {
    if (signal.aborted) throw aborted();
    console.error("Explore time-lapse region figures error", error);
    return [];
  }
}

const toBlob = (canvas: HTMLCanvasElement, type = "image/png") =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode a frame."))), type));

export function TimelapseExport({ locale, getMap, boundary, cause, hooks, onClose }: Readonly<{
  locale: Locale;
  /** The live map. A getter, so the live map is read where it is used rather than held. */
  getMap: () => MapLibreMap | null;
  boundary: BoundarySelection;
  cause: PerCellCause;
  hooks: TimelapseHooks;
  onClose: () => void;
}>) {
  const words = text[locale];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [format, setFormat] = useState<TimelapseFormat>("apng");
  const FIRST_START = hooks.firstYear;
  const LAST_END = hooks.lastYear;
  const [fromYear, setFromYear] = useState(FIRST_START);
  const [toYear, setToYear] = useState(LAST_END);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [webmType] = useState(() => webmRecordingType());
  const busy = phase.kind === "drawing" || phase.kind === "assembling" || phase.kind === "recording";

  useEffect(() => {
    headingRef.current?.focus();
    // Leaving the panel, or the page, stops an export and its hidden map.
    return () => abortRef.current?.abort();
  }, []);

  const spanLabel = (span: Span) => formatYearRange(yearRange(span.fromYear, span.toYear), locale);
  const stampText = (interval: string): StampText => ({
    place: boundary.name,
    interval,
    boundary: `${words.stamp.boundary}${colon(locale)} ${hooks.boundarySet}. ${hooks.boundarySource}`.trim(),
    evidence: `${words.stamp.evidence}${colon(locale)} ${EVIDENCE_DEFINITIONS["satellite-observation"].label[locale]} · ${words.stamp.data}${colon(locale)} ${hooks.dataVersion}`,
    caveats: [
      words.stamp.shading[cause === "all" ? "loss" : cause],
      words.stamp.patches,
      ...(cause === "all" ? [] : [words.stamp.filtered]),
      words.stamp.responsibility,
    ],
    licence: words.stamp.licence,
    product: PRODUCT_NAME[locale],
  });
  const frameTitle = (span: Span) => `${words.stamp.interval[cause]}, ${spanLabel(span)}`;

  const measureWith = (ctx: CanvasRenderingContext2D): MeasureText => (line, font) => {
    ctx.font = STAMP_FONTS[font];
    return ctx.measureText(line).width;
  };
  const viewport = () => {
    const container = getMap()?.getContainer();
    const liveWidth = container?.clientWidth || 1;
    return { liveWidth, ...frameSize(liveWidth, container?.clientHeight || 1) };
  };

  // The estimate the chooser shows, from the strip as it will be drawn.
  const { width, height } = viewport();
  const scratch = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  const stripHeight = scratch ? stampLayout(stampText(frameTitle({ fromYear, toYear: fromYear + 1 })), width, measureWith(scratch)).height : 0;
  const frameCount = toYear - fromYear;
  const formats: TimelapseFormat[] = webmType ? ["apng", "sheet", "webm"] : ["apng", "sheet"];

  async function run() {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    const chosen = format;
    const spans: Span[] = Array.from({ length: toYear - fromYear }, (_, index) => ({ fromYear: fromYear + index, toYear: fromYear + index + 1 }));
    const name = timelapseFileName(boundary.name, hooks.boundarySet, fromYear, toYear, chosen);
    let holder: HTMLDivElement | null = null;
    let exportMap: MapLibreMap | null = null;
    try {
      setPhase({ kind: "drawing", index: 1, total: spans.length, span: spanLabel(spans[0]!) });
      await document.fonts.ready;
      const { Map: MapLibre } = await import("maplibre-gl");
      const map = getMap();
      if (!map) throw new Error("The map is not ready.");
      const { liveWidth, width, height } = viewport();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D canvas.");
      const measure = measureWith(ctx);
      const layouts = spans.map((span) => stampLayout(stampText(frameTitle(span)), width, measure));
      // Every frame of an animation is one size, so the strip is as tall as the tallest.
      const strip = Math.max(...layouts.map((layout) => layout.height));
      canvas.width = width;
      canvas.height = height + strip;

      holder = document.createElement("div");
      holder.setAttribute("aria-hidden", "true");
      Object.assign(holder.style, { position: "fixed", left: "-20000px", top: "0", width: `${width}px`, height: `${height}px`, pointerEvents: "none" });
      document.body.appendChild(holder);
      exportMap = new MapLibre({
        container: holder,
        style: map.getStyle(),
        center: map.getCenter(),
        // The same ground as the reader's view, drawn at the capped width.
        zoom: map.getZoom() + Math.log2(width / Math.max(1, liveWidth)),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        minZoom: 0,
        maxZoom: map.getMaxZoom(),
        interactive: false,
        attributionControl: false,
        pixelRatio: 1,
        fadeDuration: 0,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      hooks.prepare(exportMap);
      await mapEvent(exportMap, "load", signal);

      const frames: Blob[] = [];
      for (const [index, span] of spans.entries()) {
        setPhase({ kind: "drawing", index: index + 1, total: spans.length, span: spanLabel(span) });
        const regions = hooks.needsRegions ? await regionsFor(span, signal) : [];
        const target = exportMap;
        hooks.apply(target, span, regions);
        await mapEvent(target, "idle", signal, () => target.triggerRepaint());
        ctx.drawImage(target.getCanvas(), 0, 0, width, height);
        drawStamp(ctx, layouts[index]!, height, width, strip);
        frames.push(await toBlob(canvas));
      }
      exportMap.remove();
      exportMap = null;
      holder.remove();
      holder = null;

      let file: Blob;
      if (chosen === "apng") {
        setPhase({ kind: "assembling" });
        const bytes = await Promise.all(frames.map(async (frame) => new Uint8Array(await frame.arrayBuffer())));
        file = new Blob([assembleApng(bytes)], { type: "image/png" });
      } else if (chosen === "sheet") {
        setPhase({ kind: "assembling" });
        const sheet = contactSheetLayout(frames.length, width, width, height);
        const sheetStamp = stampLayout(stampText(words.stamp.sheet(words.stamp.interval[cause], spanLabel({ fromYear, toYear }))), width, measure);
        canvas.height = sheet.gridHeight + sheetStamp.height;
        ctx.fillStyle = STAMP_COLOURS.ground;
        ctx.fillRect(0, 0, width, canvas.height);
        for (const [index, frame] of frames.entries()) {
          if (signal.aborted) throw aborted();
          const cell = sheet.cells[index]!;
          const bitmap = await createImageBitmap(frame);
          ctx.drawImage(bitmap, 0, 0, width, height, cell.x, cell.y, sheet.cellWidth, sheet.thumbHeight);
          bitmap.close();
          ctx.fillStyle = STAMP_COLOURS.ink;
          ctx.font = STAMP_FONTS.body;
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(spanLabel(spans[index]!), cell.x, cell.y + sheet.thumbHeight + 15);
        }
        drawStamp(ctx, sheetStamp, sheet.gridHeight, width);
        file = await toBlob(canvas);
      } else {
        setPhase({ kind: "recording" });
        const type = webmType!;
        const stream = canvas.captureStream(0);
        const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
        const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: WEBM_BITS_PER_SECOND });
        const parts: Blob[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) parts.push(event.data);
        };
        const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
        recorder.start();
        try {
          for (const frame of frames) {
            const bitmap = await createImageBitmap(frame);
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            track.requestFrame();
            await wait(TIMELAPSE_FRAME_DELAY_MS, signal);
          }
        } finally {
          recorder.stop();
          await stopped;
          for (const each of stream.getTracks()) each.stop();
        }
        file = new Blob(parts, { type: "video/webm" });
      }
      if (signal.aborted) throw aborted();
      save(file, name);
      setPhase({ kind: "done", name, bytes: file.size });
    } catch (error: unknown) {
      if (signal.aborted) setPhase({ kind: "cancelled" });
      else {
        console.error("Explore time-lapse export error", error);
        setPhase({ kind: "failed" });
      }
    } finally {
      exportMap?.remove();
      holder?.remove();
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  const status =
    phase.kind === "drawing"
      ? words.drawing(phase.span, phase.index, phase.total)
      : phase.kind === "assembling"
        ? words.assembling
        : phase.kind === "recording"
          ? words.recording
          : phase.kind === "done"
            ? words.done(phase.name, formatBytes(phase.bytes, locale))
            : phase.kind === "cancelled"
              ? words.cancelled
              : phase.kind === "failed"
                ? words.failed
                : "";
  const years = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => first + index);

  return (
    <section className="explore-timelapse" aria-labelledby="explore-timelapse-heading">
      <h3 id="explore-timelapse-heading" ref={headingRef} tabIndex={-1}>{words.heading}</h3>
      <p>{words.intro(boundary.name, formatYearRange(yearRange(fromYear, toYear), locale, "from"))}</p>
      <div className="explore-timelapse-years">
        <label>
          {words.from}
          <select name="timelapse-from" value={fromYear} disabled={busy} onChange={(event) => {
            const value = Number(event.target.value);
            setFromYear(value);
            if (toYear <= value) setToYear(value + 1);
          }}>
            {years(FIRST_START, LAST_END - 1).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>
          {words.to}
          <select name="timelapse-to" value={toYear} disabled={busy} onChange={(event) => {
            const value = Number(event.target.value);
            setToYear(value);
            if (fromYear >= value) setFromYear(value - 1);
          }}>
            {years(FIRST_START + 1, LAST_END).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="explore-timelapse-formats" disabled={busy}>
        <legend>{words.format}</legend>
        {formats.map((option) => (
          <label key={option}>
            <input type="radio" name="timelapse-format" value={option} checked={format === option} onChange={() => setFormat(option)} />
            <span>{`${words[option]} (${words.about(formatBytes(expectedBytes(option, frameCount, width, height, stripHeight), locale))})`}</span>
          </label>
        ))}
      </fieldset>
      <p className="explore-timelapse-note">{words.frames(frameCount, width, height + stripHeight)}</p>
      <div className="explore-timelapse-actions">
        {busy ? (
          <button type="button" className="btn btn--outline" onClick={() => abortRef.current?.abort()}>{words.cancel}</button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => void run()}>{words.make}</button>
        )}
        <button type="button" className="btn btn--outline" onClick={onClose}>{words.close}</button>
      </div>
      {busy && phase.kind === "drawing" ? <progress max={phase.total} value={phase.index - 1} /> : null}
      <p className="explore-timelapse-status" role="status" aria-live="polite">
        {status}
        {busy ? ` ${words.working}` : ""}
      </p>
    </section>
  );
}

export default TimelapseExport;
