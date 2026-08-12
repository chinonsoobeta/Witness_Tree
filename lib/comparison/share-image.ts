import { EVIDENCE_DEFINITIONS, PRODUCT_NAME, type Locale } from "../domain";
import type { RankingContext } from "./types";

export type ComparisonShareImage = Readonly<{ id: string; filename: string; svg: string }>;

/** Portable SVG needs explicit colours instead of page-level CSS variables. */
export const COMPARISON_SHARE_IMAGE_COLORS = Object.freeze({
  canvas: "#f5f7f4",
  text: "#18352a",
} as const);

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

/** Creates a deterministic, in-memory SVG. Its identifier is deliberately brand-neutral. */
export function generateComparisonShareImage(context: RankingContext, locale: Locale): ComparisonShareImage {
  const evidence = EVIDENCE_DEFINITIONS[context.evidence].label[locale];
  const lines = [
    PRODUCT_NAME[locale],
    context.timeRange,
    context.boundaryEdition,
    context.dataVersion,
    context.denominatorDefinition[locale],
    evidence,
    context.method[locale],
  ].map(escapeXml);
  const text = lines.map((line, index) => `<text x="64" y="${104 + index * 68}" font-family="BC Sans, sans-serif" font-size="${index === 0 ? 42 : 26}"${index === 0 ? " font-weight=\"700\"" : ""}>${line}</text>`).join("");
  const titleId = `comparison-summary-${locale}-title`;
  const descriptionId = `comparison-summary-${locale}-description`;
  return Object.freeze({
    id: `comparison-summary-${locale}`,
    filename: `comparison-summary-${locale}.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="${titleId} ${descriptionId}"><title id="${titleId}">${lines[0]}</title><desc id="${descriptionId}">${lines.slice(1).join(" · ")}</desc><rect width="1200" height="630" fill="${COMPARISON_SHARE_IMAGE_COLORS.canvas}"/><g fill="${COMPARISON_SHARE_IMAGE_COLORS.text}">${text}</g></svg>`,
  });
}
