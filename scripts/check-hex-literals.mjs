import { readFile } from "node:fs/promises";
import path from "node:path";

// check-style-tokens keeps raw colour out of the TSX. This extends the same
// discipline into the stylesheet: colour is declared once in the palette
// blocks and every rule below them reaches for a token. A hex further down
// the file is a colour that cannot follow the theme.

const PALETTE =
  /^(:root(:not\(\[data-theme="light"\]\))?|\[data-theme="(light|dark)"\])( \{|,)$/;
const HEX = /#[0-9a-fA-F]{3,8}\b/;

export async function checkHexLiterals(
  stylesheet = path.resolve("app/globals.css"),
) {
  const lines = (await readFile(stylesheet, "utf8")).split("\n");
  const offences = [];
  let depth = 0;
  let paletteDepth = null;
  let inComment = false;
  for (const [index, line] of lines.entries()) {
    const opensPalette = PALETTE.test(line.trim());
    const stripped = line.replace(/\/\*.*?\*\//g, "");
    const commentStart = inComment;
    if (!inComment && /\/\*/.test(stripped)) inComment = true;
    if (inComment && /\*\//.test(stripped)) inComment = false;
    if (opensPalette && paletteDepth === null) paletteDepth = depth;
    if (paletteDepth === null && !commentStart && HEX.test(stripped))
      offences.push(
        `${path.basename(stylesheet)}:${index + 1}: ${line.trim()}`,
      );
    depth +=
      (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (
      paletteDepth !== null &&
      depth <= paletteDepth &&
      line.trim().endsWith("}")
    )
      paletteDepth = null;
  }
  if (offences.length)
    throw new Error(
      `Hex-literal gate failed: colour must come from a palette token outside the palette blocks.\n${offences.join("\n")}`,
    );
  return { lines: lines.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { lines } = await checkHexLiterals();
  console.log(`Hex-literal gate passed across ${lines} stylesheet lines.`);
}
