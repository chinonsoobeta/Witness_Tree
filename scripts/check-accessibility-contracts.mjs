import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MAIN_COMPONENTS = new Set(["AccountStatusPage", "ComponentGallery", "DataPage", "GovernancePage", "LocationResult", "MethodologyPage", "OfficialPublishedHarvestComparison", "PlacePage", "RecordPlacePage", "WildfireView"]);

async function tsxFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? tsxFiles(path.join(root, entry.name))
    : entry.isFile() && /\.tsx?$/.test(entry.name) ? [path.join(root, entry.name)] : []))).flat();
}

/** A module that writes a whole HTML document itself, such as the embedded figure, rather than rendering JSX. */
const isHtmlDocument = (file, source) => file.endsWith(".ts") && /<!DOCTYPE html>/i.test(source);

/*
 * The embedded figure (lib/embed/card.ts) is framed by other sites, so it is
 * read inside someone else's page. It must name itself (a document language and
 * title, and a card labelled by its heading), its one control must be a link
 * with a name, and it may carry no script or other control, which is also its
 * clickjacking mitigation (docs/THREAT_MODEL.md).
 */
function auditHtmlDocument(file, source) {
  const failures = [];
  if (!/<html\b[^>]*\blang="/.test(source)) failures.push(`${file}: an HTML document requires html lang.`);
  if (!/<title>[^<]+<\/title>/.test(source)) failures.push(`${file}: an HTML document requires a non-empty title.`);
  const labelled = /<article\b[^>]*\baria-labelledby="([^"]+)"/.exec(source)?.[1];
  if (!labelled || !new RegExp(`<h[1-6]\\b[^>]*\\bid="${labelled}"`).test(source)) failures.push(`${file}: the card requires an article labelled by its heading.`);
  for (const link of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    if (!/\bhref="/.test(link[1])) failures.push(`${file}: a link requires an href.`);
    if (!link[2].trim()) failures.push(`${file}: a link requires a name.`);
  }
  if (/<(?:script|button|input|select|textarea|form|iframe)\b/i.test(source)) failures.push(`${file}: an embedded document may carry no script and no control but its links.`);
  return failures;
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
  if (/explore/i.test(file) && /<svg\b/i.test(source) && (!/(?:<Symbol\b|\{symbol\()/.test(source) || !/<li\b/.test(source))) {
    failures.push(`${file}: Explore legend must use named symbols and text, not colour alone.`);
  }

  for (const table of source.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    if (!/<caption\b/i.test(table[1])) failures.push(`${file}: table requires a caption.`);
    for (const header of tags(table[1], "th")) if (!/\bscope\s*=/.test(header)) failures.push(`${file}: table header requires scope.`);
  }
  // A hidden input is not exposed to assistive technology, cannot receive focus, and has no
  // accessible-name requirement. Every other input still needs one, including a range control.
  //
  // A visible <label htmlFor> is the primary way HTML names a control, and it names it better
  // than aria-label does, because the name is also on screen for a sighted reader who is not
  // using assistive technology. So an input whose own id is the target of a label in this file
  // is named. This is not a wider rule than before, it is the same rule counting the labels the
  // regex could not see: an input with no label of any kind still fails.
  const labelledIds = new Set(
    [...source.matchAll(/<label\b[^>]*\bhtmlFor\s*=\s*(?:["']([^"']+)["']|\{`([^`]+)`\}|\{([A-Za-z0-9_$.]+)\})/g)]
      .flatMap((match) => (match[1] ?? match[2] ?? match[3] ?? "").split(/\s+/))
      .filter(Boolean),
  );
  const inputId = (input) => input.match(/\bid\s*=\s*(?:["']([^"']+)["']|\{`?([^`}]+)`?\})/)?.slice(1).find(Boolean) ?? "";
  for (const input of tags(source, "input")) {
    if (/\btype\s*=\s*["']hidden["']/.test(input)) continue;
    if (/\b(?:aria-label|aria-labelledby)\s*=/.test(input)) continue;
    if (labelledIds.has(inputId(input))) continue;
    failures.push(`${file}: input requires a label or aria-label.`);
  }
  for (const image of tags(source, "img")) if (!/\balt\s*=/.test(image)) failures.push(`${file}: img requires alt text.`);
  for (const button of tags(source, "button")) if (!/\btype\s*=/.test(button)) failures.push(`${file}: button requires an explicit type.`);
  return failures;
}

export async function checkAccessibilityContracts(roots = [path.resolve("app"), path.resolve("components"), path.resolve("lib/embed")]) {
  const sources = await Promise.all((await Promise.all(roots.map(tsxFiles))).flat().map(async (file) => [file, await readFile(file, "utf8")]));
  // A plain .ts module is audited only when it writes an HTML document.
  const audited = sources.filter(([file, source]) => file.endsWith(".tsx") || isHtmlDocument(file, source));
  const failures = audited.flatMap(([file, source]) => [...auditFile(file, source), ...(isHtmlDocument(file, source) ? auditHtmlDocument(file, source) : [])]);
  if (failures.length) throw new Error(`Accessibility contract check failed:\n- ${failures.join("\n- ")}`);
  return { files: audited.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkAccessibilityContracts();
  console.log(`Accessibility contracts passed for ${result.files} TSX files and HTML documents.`);
}
