import { readFileSync } from "node:fs";

const ABSENCE = /^An error occurred \((?:404|NoSuchKey)\) when calling the HeadObject operation: (?:Not Found|The specified key does not exist\.)$/;

export function classifyFederalHeadAbsence(stderr) {
  if (typeof stderr !== "string") return "ambiguous";
  const lines = stderr.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.some((line) => line === "")) return "occupied-or-ambiguous";
  if (lines.length !== 1) return "ambiguous";
  return ABSENCE.test(lines[0]) ? "absent" : "occupied-or-ambiguous";
}

if (process.argv[1]?.endsWith("classify-federal-head-absence.mjs")) {
  try {
    if (process.argv.length !== 3) throw new Error("usage");
    process.stdout.write(`${classifyFederalHeadAbsence(readFileSync(process.argv[2], "utf8"))}\n`);
  } catch {
    process.stdout.write("ambiguous\n");
    process.exitCode = 1;
  }
}
