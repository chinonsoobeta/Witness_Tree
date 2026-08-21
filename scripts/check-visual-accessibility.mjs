import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED = ["ground", "surface", "ink", "ink-2", "muted", "accent", "harvest", "fire", "insect", "unknown"];
const CVD = {
  protan: [[.152286, 1.052583, -.204868], [.114503, .786281, .099216], [-.003882, -.048116, 1.051998]],
  deutan: [[.367322, .860646, -.227968], [.280085, .672501, .047413], [-.01182, .04294, .968881]],
  tritan: [[1.255528, -.076749, -.178779], [-.078411, .930809, .147602], [.004733, .691367, .3039]],
};

function rgb(hex) { return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255); }
function luminance(hex) { return rgb(hex).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0); }
function contrast(a, b) { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + .05) / (low + .05); }
function simulate(values, matrix) { return matrix.map((row) => Math.max(0, Math.min(1, row.reduce((sum, value, index) => sum + value * values[index], 0)))); }
function distance(a, b) { return Math.hypot(...a.map((value, index) => (value - b[index]) * 255)); }
function tokens(block) { return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1], match[2].toLowerCase()])); }

export async function checkVisualAccessibility({ cssPath = path.resolve("app/globals.css"), evidencePath = path.resolve("components/policy/EvidenceChip.tsx"), confidencePath = path.resolve("components/policy/ConfidenceBadge.tsx") } = {}) {
  const css = await readFile(cssPath, "utf8");
  const root = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const dark = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const failures = [];
  for (const [name, palette] of [["light", tokens(root)], ["dark", tokens(dark)]]) {
    for (const token of REQUIRED) if (!palette[token]) failures.push(`${name}: missing --${token}.`);
    for (const foreground of ["ink", "ink-2", "muted", "accent"]) for (const background of ["ground", "surface"]) {
      if (palette[foreground] && palette[background] && contrast(palette[foreground], palette[background]) < 4.5) failures.push(`${name}: --${foreground} on --${background} is below 4.5:1.`);
    }
    const semantic = ["harvest", "fire", "insect", "unknown"];
    for (const [kind, matrix] of Object.entries(CVD)) for (let left = 0; left < semantic.length; left++) for (let right = left + 1; right < semantic.length; right++) {
      if (palette[semantic[left]] && palette[semantic[right]] && distance(simulate(rgb(palette[semantic[left]]), matrix), simulate(rgb(palette[semantic[right]]), matrix)) < 12) failures.push(`${name}: --${semantic[left]} and --${semantic[right]} collapse under the ${kind} proxy.`);
    }
  }
  if (!/:focus-visible[\s\S]*outline\s*:/i.test(css) || !/\.skip-link:focus\s*\{[^}]*transform:\s*translateY\(0\)/i.test(css)) failures.push("keyboard focus and skip-link visibility rules are required.");
  const evidence = await readFile(evidencePath, "utf8");
  const confidence = await readFile(confidencePath, "utf8");
  for (const shape of ["■", "●", "▲", "○"]) if (!evidence.includes(shape)) failures.push(`Evidence chip lacks non-colour shape ${shape}.`);
  if (!/EVIDENCE_DEFINITIONS\[evidence\]\.label\[locale\]/.test(evidence)) failures.push("Evidence chip lacks localized visible labels.");
  if (!/[▮▯]/.test(confidence) || !/CONFIDENCE_LABELS\[confidence\.level\]\[locale\]/.test(confidence)) failures.push("Confidence badge lacks bars plus localized text.");
  if (failures.length) throw new Error(`Visual accessibility gate failed:\n- ${failures.join("\n- ")}`);
  return { palettes: 2, cvdModels: 3 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkVisualAccessibility();
  console.log(`Visual accessibility gate passed: ${result.palettes} palettes, ${result.cvdModels} CVD proxies, non-colour cues and focus rules.`);
}
