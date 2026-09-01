#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) throw new Error("Fixture runner arguments must be name/value pairs.");
    values.set(name, value);
  }
  for (const name of ["--data-root", "--input", "--factor", "--output"]) {
    if (!values.has(name)) throw new Error(`Fixture runner requires ${name}.`);
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));
const dataRoot = path.resolve(args.get("--data-root"));
const inputPath = path.resolve(dataRoot, args.get("--input"));
if (path.relative(dataRoot, inputPath).startsWith("..")) throw new Error("Fixture input escaped the data root.");
const factor = Number(args.get("--factor"));
if (!Number.isSafeInteger(factor) || factor <= 0) throw new Error("Fixture factor must be a positive integer.");
const source = JSON.parse(await readFile(inputPath, "utf8"));
if (!Number.isSafeInteger(source.value)) throw new Error("Fixture source requires an integer value.");
await writeFile(path.resolve(args.get("--output")), `${JSON.stringify({ value: source.value * factor })}\n`, { flag: "wx" });
