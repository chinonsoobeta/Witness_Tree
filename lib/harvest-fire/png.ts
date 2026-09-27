import type { ChartGeometry } from "./chart";

/*
 * Draws one harvest and fire chart onto a canvas for download. It runs in the
 * browser only, from the same geometry as the SVG on the page, and always in
 * the light palette: a downloaded image leaves the site's theme behind, so it
 * is drawn on paper. tests/harvest-fire.test.ts holds these colours to the
 * light tokens in app/globals.css.
 */

export const PNG_COLOURS = {
  ground: "#fdfcf8",
  ink: "#2c2c24",
  ink2: "#4a4a40",
  rule: "#ded8cf",
  ruleStrong: "#948b7a",
  harvest: "#2a78d6",
  fire: "#eb6834",
} as const;

export const PNG_WIDTH = 1100;
export const PNG_CHART = { width: PNG_WIDTH, height: 470, left: 140, top: 28, right: 48, bottom: 62 } as const;
const FONT = '"BC Sans", "Noto Sans", Verdana, Arial, sans-serif';
const MARGIN = 48;
const HEADER = 170;
const LINE = 19;

export type PngText = Readonly<{
  title: string;
  subtitle: string;
  harvest: string;
  fire: string;
  xAxis: string;
  yAxis: string;
  notesHeading: string;
  notes: readonly string[];
  sourcesHeading: string;
  sources: readonly string[];
}>;

type Context = Pick<CanvasRenderingContext2D,
  "font" | "fillStyle" | "strokeStyle" | "lineWidth" | "textAlign" | "textBaseline"
  | "fillRect" | "fillText" | "measureText" | "beginPath" | "moveTo" | "lineTo" | "stroke"
  | "save" | "restore" | "translate" | "rotate" | "scale" | "drawImage" | "roundRect" | "fill">;

function wrap(ctx: Context, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Lines of footer text at the width the image uses; the caller sizes the canvas from it. */
export function footerLines(ctx: Context, text: PngText) {
  ctx.font = `13px ${FONT}`;
  const width = PNG_WIDTH - 2 * MARGIN;
  return {
    notes: text.notes.flatMap((paragraph) => wrap(ctx, paragraph, width)),
    sources: text.sources.flatMap((paragraph) => wrap(ctx, paragraph, width)),
  };
}

export function pngHeight(lines: ReturnType<typeof footerLines>) {
  // Each block is a heading line and its lines, with a gap between the blocks.
  return HEADER + PNG_CHART.height + 24 + (lines.notes.length + 1) * LINE + 16 + (lines.sources.length + 1) * LINE + 36;
}

export function drawHarvestFirePng(
  ctx: Context,
  geometry: ChartGeometry,
  text: PngText,
  lines: ReturnType<typeof footerLines>,
  flag: CanvasImageSource | null,
) {
  const c = PNG_COLOURS;
  ctx.fillStyle = c.ground;
  ctx.fillRect(0, 0, PNG_WIDTH, pngHeight(lines));

  // Header: flag, title, subtitle, legend.
  let titleX = MARGIN;
  if (flag) {
    ctx.drawImage(flag, MARGIN, 36, 60, 36.67);
    titleX = MARGIN + 76;
  }
  ctx.fillStyle = c.ink;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(text.title, titleX, 64);
  ctx.fillStyle = c.ink2;
  ctx.font = `16px ${FONT}`;
  ctx.fillText(text.subtitle, MARGIN, 108);
  ctx.font = `15px ${FONT}`;
  let x = MARGIN;
  for (const [label, colour] of [[text.harvest, c.harvest], [text.fire, c.fire]] as const) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x, 132, 16, 16, 3);
    ctx.fill();
    ctx.fillStyle = c.ink;
    ctx.fillText(label, x + 24, 145);
    x += 24 + ctx.measureText(label).width + 28;
  }

  // Chart.
  ctx.save();
  ctx.translate(0, HEADER);
  const { plot } = geometry;
  ctx.font = `13px ${FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const tick of geometry.ticks) {
    ctx.strokeStyle = tick.value === 0 ? c.ruleStrong : c.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.left, Math.round(tick.y) + 0.5);
    ctx.lineTo(plot.right, Math.round(tick.y) + 0.5);
    ctx.stroke();
    ctx.fillStyle = c.ink2;
    ctx.fillText(tick.label, plot.left - 10, tick.y);
  }
  for (const bin of geometry.bins) {
    for (const [bar, colour] of [[bin.harvest, c.harvest], [bin.fire, c.fire]] as const) {
      if (bar.height <= 0) continue;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.roundRect(bar.x, bar.y, bar.width, bar.height, [Math.min(4, bar.width / 2), Math.min(4, bar.width / 2), 0, 0]);
      ctx.fill();
      if (geometry.showValues) {
        ctx.fillStyle = c.ink2;
        ctx.font = `12px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(bar.text, bar.x + bar.width / 2, bar.y - 6);
      }
    }
    if (bin.showLabel) {
      ctx.fillStyle = c.ink;
      ctx.font = `14px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(bin.label, bin.centre, plot.bottom + 10);
    }
  }
  ctx.fillStyle = c.ink2;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text.xAxis, (plot.left + plot.right) / 2, plot.bottom + 36);
  ctx.save();
  ctx.translate(MARGIN + 6, (plot.top + plot.bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = "middle";
  ctx.fillText(text.yAxis, 0, 0);
  ctx.restore();
  ctx.restore();

  // Footer: notes, then sources, each under its own heading.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let y = HEADER + PNG_CHART.height + 24;
  for (const [heading, block] of [[text.notesHeading, lines.notes], [text.sourcesHeading, lines.sources]] as const) {
    ctx.fillStyle = c.ink;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(heading, MARGIN, y);
    y += LINE;
    ctx.fillStyle = c.ink2;
    ctx.font = `13px ${FONT}`;
    for (const line of block) {
      ctx.fillText(line, MARGIN, y);
      y += LINE;
    }
    y += 16;
  }
}
