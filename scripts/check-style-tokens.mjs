import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
const HEX = /#[0-9a-f]{3,8}\b/ig;
async function files(root) { const entries = await readdir(root, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(path.join(root, entry.name)) : /\.tsx$/.test(entry.name) ? [path.join(root, entry.name)] : []))).flat(); }
export async function checkStyleTokens(roots = [path.resolve("app"), path.resolve("components")]) { const failures = []; for (const root of roots) for (const file of await files(root)) { const matches = (await readFile(file, "utf8")).match(HEX); if (matches) failures.push(`${file}: ${matches.join(", ")}`); } if (failures.length) throw new Error(`Style-token gate failed:\n${failures.join("\n")}`); return { files: (await Promise.all(roots.map(files))).flat().length }; }
if (import.meta.url === `file://${process.argv[1]}`) console.log(`Style-token gate passed for ${(await checkStyleTokens()).files} files.`);
