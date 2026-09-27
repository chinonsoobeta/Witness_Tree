"use client";

import { useState } from "react";
import type { Locale } from "@/lib/domain";
import type { HarvestFireChartModel } from "@/lib/harvest-fire";
import { chartGeometry } from "@/lib/harvest-fire/chart";
import { drawHarvestFirePng, footerLines, PNG_CHART, PNG_COLOURS, PNG_WIDTH, pngHeight, type PngText } from "@/lib/harvest-fire/png";

/*
 * Downloads are made in the reader's browser from the numbers already on the
 * page, so there is no image service and nothing to upload. Without script the
 * buttons do nothing and the table view and the published record remain.
 */

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The page's own flag drawing, with its colour tokens resolved so it can stand alone as an image. */
async function flagImage(flagId: string): Promise<HTMLImageElement | null> {
  const element = document.getElementById(flagId);
  if (!element) return null;
  const clone = element.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", "360");
  clone.setAttribute("height", "220");
  const styles = getComputedStyle(element);
  const markup = new XMLSerializer().serializeToString(clone)
    .replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => styles.getPropertyValue(name).trim() || PNG_COLOURS.ink);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function HarvestFirePngButton({ chart, locale, text, flagId, filename, label }: Readonly<{
  chart: HarvestFireChartModel;
  locale: Locale;
  text: PngText;
  flagId: string;
  filename: string;
  label: string;
}>) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      await document.fonts.ready;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const lines = footerLines(ctx, text);
      const ratio = 2;
      canvas.width = PNG_WIDTH * ratio;
      canvas.height = pngHeight(lines) * ratio;
      ctx.scale(ratio, ratio);
      drawHarvestFirePng(ctx, chartGeometry(chart, locale, PNG_CHART), text, lines, await flagImage(flagId));
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) save(blob, filename);
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" className="btn btn--outline" onClick={download} disabled={busy}>{label}</button>;
}

export function HarvestFireCsvButton({ csv, filename, label }: Readonly<{ csv: string; filename: string; label: string }>) {
  return (
    <button type="button" className="btn btn--outline" onClick={() => save(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename)}>
      {label}
    </button>
  );
}
