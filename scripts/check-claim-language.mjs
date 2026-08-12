import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const RULES = [
  { scope: /wildfire/i, terms: ["forecast", "spread rate", "predicted"] },
  { scope: /compar|ranking/i, terms: ["worst", "best", "top", "destruction"] },
  { scope: /./, terms: ["unexplained", "unreported", "undocumented", "illegal"] },
];

async function files(root) { const entries = await readdir(root, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(path.join(root, entry.name)) : /\.[jt]sx?$/.test(entry.name) ? [path.join(root, entry.name)] : []))).flat(); }
export async function checkClaimLanguage(roots = [path.resolve("app"), path.resolve("components"), path.resolve("lib")]) { const failures = []; const all = (await Promise.all(roots.map(files))).flat(); for (const file of all) { const text = await readFile(file, "utf8"); for (const rule of RULES) if (rule.scope.test(file)) for (const term of rule.terms) if (new RegExp(`\\b${term.replace(" ", "\\s+")}\\b`, "i").test(text)) failures.push(`${file}: ${term}`); } if (failures.length) throw new Error(`Claim-language gate failed:\n${failures.join("\n")}`); return { files: all.length }; }
if (import.meta.url === `file://${process.argv[1]}`) console.log(`Claim-language gate passed for ${(await checkClaimLanguage()).files} files.`);
