import { readFile } from "node:fs/promises";
import path from "node:path";

// The palette carries its measured ratios in comments. Comments drift; this
// recomputes them from the declared token values and fails below threshold.
// Ratios are WCAG 2.1: (L1 + 0.05) / (L2 + 0.05) on sRGB relative luminance.

const BLOCKS = {
  light: /^:root \{$/,
  dark: /^\[data-theme="dark"\] \{$/,
};

// Every foreground/background pair actually shipped, with the minimum it must
// clear. 4.5 is AA body text; 3 is AA large text, and non-text edges under
// WCAG 2.1 SC 1.4.11.
const PAIRS = [
  ["ink", "ground", 4.5, "body text on the page ground"],
  ["ink", "surface", 4.5, "body text inside a card"],
  ["ink", "surface-2", 4.5, "body text on a stone panel"],
  ["ink", "sand", 4.5, "body text on a sand card"],
  ["ink", "alert-fill", 4.5, "text inside a role=alert notice"],
  ["ink-2", "ground", 4.5, "secondary text"],
  ["muted", "ground", 4.5, "muted text and captions"],
  ["muted", "sand", 4.5, "muted text on a sand card"],
  ["accent", "ground", 4.5, "links and small accent text"],
  ["clay-ink", "ground", 4.5, "clay at text weight"],
  ["ground", "accent-fill", 4.5, "primary button label on its fill"],
  ["accent-fill", "ground", 3, "large accent fill and its edge"],
  ["rule-strong", "ground", 3, "control edges"],
  ["rule-strong", "surface", 3, "control edges on a card"],
  ["ink", "tint-record", 4.5, "official-record chip text"],
  ["ink", "tint-satellite", 4.5, "satellite-observation chip text"],
  ["ink", "tint-derived", 4.5, "derived-estimate chip text"],
  ["ink", "tint-unknown", 4.5, "unknown chip text"],
  ["edge-record", "tint-record", 3, "official-record chip edge"],
  ["edge-satellite", "tint-satellite", 3, "satellite-observation chip edge"],
  ["edge-derived", "tint-derived", 3, "derived-estimate chip edge"],
  ["edge-unknown", "tint-unknown", 3, "unknown chip edge"],
];

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;

const expand = (hex) =>
  hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;

const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const luminance = (hex) => {
  const full = expand(hex);
  const [r, g, b] = [1, 3, 5].map((i) =>
    Number.parseInt(full.slice(i, i + 2), 16),
  );
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const ratio = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

// Reads the declarations of one top-level block, ignoring nested at-rules.
const readBlock = (lines, matcher) => {
  const start = lines.findIndex((line) => matcher.test(line));
  if (start === -1) return null;
  const tokens = new Map();
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === "}") break;
    const declaration = /^\s*--([\w-]+):\s*(.+);\s*(\/\*.*\*\/)?\s*$/.exec(
      lines[i],
    );
    if (declaration && HEX.test(declaration[2].trim()))
      tokens.set(declaration[1], declaration[2].trim());
  }
  return tokens;
};

export async function checkContrast(
  stylesheet = path.resolve("app/globals.css"),
) {
  const lines = (await readFile(stylesheet, "utf8")).split("\n");
  const failures = [];
  const measured = [];
  for (const [theme, matcher] of Object.entries(BLOCKS)) {
    const tokens = readBlock(lines, matcher);
    if (!tokens)
      throw new Error(
        `Contrast gate failed: the ${theme} palette block is missing from ${stylesheet}.`,
      );
    for (const [foreground, background, minimum, note] of PAIRS) {
      const a = tokens.get(foreground);
      const b = tokens.get(background);
      if (!a || !b) {
        failures.push(
          `${theme}: --${foreground} on --${background} (${note}) is not declared in this palette.`,
        );
        continue;
      }
      const value = ratio(a, b);
      measured.push({
        theme,
        foreground,
        background,
        minimum,
        note,
        ratio: Number(value.toFixed(2)),
      });
      if (value < minimum)
        failures.push(
          `${theme}: --${foreground} (${a}) on --${background} (${b}) is ${value.toFixed(2)}:1, below the required ${minimum}:1 for ${note}.`,
        );
    }
  }
  if (failures.length)
    throw new Error(`Contrast gate failed:\n${failures.join("\n")}`);
  return { pairs: measured.length, measured };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { pairs, measured } = await checkContrast();
  if (process.argv.includes("--report"))
    for (const row of measured)
      console.log(
        `${row.theme.padEnd(5)} --${row.foreground} on --${row.background}: ${row.ratio}:1 (min ${row.minimum}) — ${row.note}`,
      );
  console.log(
    `Contrast gate passed for ${pairs} shipped pairs across both palettes.`,
  );
}
