import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MAIN_COMPONENTS = new Set(["ComponentGallery", "DataPage", "GovernancePage", "LocationResult", "MethodologyPage", "PlacePage", "WildfireView"]);

async function tsxFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? tsxFiles(path.join(root, entry.name))
    : entry.isFile() && entry.name.endsWith(".tsx") ? [path.join(root, entry.name)] : []))).flat();
}

function tags(source, tag) {
  return [...source.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))].map((match) => match[0]);
}

function requiresMain(file, source) {
  if (!/[/\\]app[/\\](en|fr)[/\\]/.test(file) || !/\bSiteShell\b/.test(source)) return false;
  return !/<main\b[^>]*\bid=["']main["']/i.test(source)
    && ![...MAIN_COMPONENTS].some((component) => new RegExp(`<${component}\\b`).test(source));
}

function auditFile(file, source) {
  const failures = [];
  if (requiresMain(file, source)) failures.push(`${file}: SiteShell locale route lacks main id=main or an approved main-owning component.`);

  for (const svg of source.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi)) {
    if (!/\baria-label\s*=/.test(svg[1]) && !/<title\b/i.test(svg[2])) failures.push(`${file}: SVG requires a title or aria-label.`);
  }
  if (/explore/i.test(file) && /<svg\b/i.test(source) && (!/<Symbol\b/.test(source) || !/<li\b/.test(source))) {
    failures.push(`${file}: Explore legend must use named symbols and text, not colour alone.`);
  }

  for (const table of source.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    if (!/<caption\b/i.test(table[1])) failures.push(`${file}: table requires a caption.`);
    for (const header of tags(table[1], "th")) if (!/\bscope\s*=/.test(header)) failures.push(`${file}: table header requires scope.`);
  }
  for (const input of tags(source, "input")) if (!/\b(?:aria-label|aria-labelledby)\s*=/.test(input)) failures.push(`${file}: input requires a label or aria-label.`);
  for (const image of tags(source, "img")) if (!/\balt\s*=/.test(image)) failures.push(`${file}: img requires alt text.`);
  for (const button of tags(source, "button")) if (!/\btype\s*=/.test(button)) failures.push(`${file}: button requires an explicit type.`);
  return failures;
}

export async function checkAccessibilityContracts(roots = [path.resolve("app"), path.resolve("components")]) {
  const files = (await Promise.all(roots.map(tsxFiles))).flat();
  const failures = (await Promise.all(files.map(async (file) => auditFile(file, await readFile(file, "utf8"))))).flat();
  if (failures.length) throw new Error(`Accessibility contract check failed:\n- ${failures.join("\n- ")}`);
  return { files: files.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkAccessibilityContracts();
  console.log(`Accessibility contracts passed for ${result.files} TSX files.`);
}
