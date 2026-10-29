/**
 * Matching for the Compare page's riding fields.
 *
 * The comparison already ships every four-province riding name, federal (280)
 * and provincial (431), so the fields match in the browser against that list
 * rather than calling the search route. This module imports nothing else, so
 * the client field carries only these few functions and the names it is given.
 *
 * A query matches a riding when every word of the query starts some word of
 * the riding's name in the page's language, names its province (by its name
 * in either language, its postal code, BC, AB, ON or QC, or its French
 * abbreviation, C.-B., Alb., Ont. or Qc) or names its level (federal,
 * provincial, in either language). Accents, case and punctuation are ignored.
 * Rendered names stay the source values.
 */

/** One riding as the field lists it, in one language, in the fallback list's order. */
export type RidingChoice = Readonly<{
  id: string;
  name: string;
  /** The province's name in the page's language, or null when the id carries no province. */
  province: string | null;
  /** Federal and provincial ridings can share a name, so each choice says which it is. */
  level: "federal" | "provincial";
}>;

/** Words that name each province, keyed by the federal district number prefix. */
const PROVINCE_WORDS: Readonly<Record<string, readonly string[]>> = {
  "59": ["bc", "cb", "british", "columbia", "colombie", "britannique"],
  "48": ["ab", "alb", "alberta"],
  "35": ["on", "ont", "ontario"],
  "24": ["qc", "quebec"],
};

/** The federal district number prefix of each province's postal code. */
const PREFIX_BY_CODE: Readonly<Record<string, string>> = { BC: "59", AB: "48", ON: "35", QC: "24" };

/** Words that name each level, without accents. */
const LEVEL_WORDS = {
  federal: ["federal", "federale", "federales"],
  provincial: ["provincial", "provinciale", "provinciales"],
} as const;

/**
 * The province prefix of a Compare riding id: a federal district number such
 * as `federal-59021`, or a provincial id such as `provincial-BC-258`.
 */
export function ridingProvincePrefix(id: string): string | null {
  const prefix = /^federal-(\d{2})/.exec(id)?.[1] ?? PREFIX_BY_CODE[/^provincial-([A-Z]{2})-/.exec(id)?.[1] ?? ""];
  return prefix && prefix in PROVINCE_WORDS ? prefix : null;
}

/** The province's postal code for a Compare riding id, or null. */
export function ridingProvinceCode(id: string): string | null {
  const prefix = ridingProvincePrefix(id);
  return Object.keys(PREFIX_BY_CODE).find((code) => PREFIX_BY_CODE[code] === prefix) ?? null;
}

/** Whether a Compare riding id names a federal or a provincial riding. */
export function ridingLevel(id: string): "federal" | "provincial" {
  return id.startsWith("provincial-") ? "provincial" : "federal";
}

/**
 * Lower case, no accents, and punctuation as spaces. A dotted abbreviation
 * such as "C.-B." or "B.C." is closed up first, so it reads as one word.
 */
export function normalizeRidingQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-CA")
    .replace(/(^|[^a-z0-9])([a-z])\.\s*-?\s*([a-z])\.?(?![a-z0-9])/g, "$1$2$3")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** How closely a riding matches, lower first, or null for no match. */
function rank(choice: RidingChoice, query: string, queryWords: readonly string[]) {
  const name = normalizeRidingQuery(choice.name);
  const nameWords = name.split(" ");
  const provinceWords = [...(PROVINCE_WORDS[ridingProvincePrefix(choice.id) ?? ""] ?? []), ...LEVEL_WORDS[choice.level]];
  let needsProvince = false;
  for (const word of queryWords) {
    if (nameWords.some((candidate) => candidate.startsWith(word))) continue;
    if (provinceWords.some((candidate) => candidate.startsWith(word))) {
      needsProvince = true;
      continue;
    }
    return null;
  }
  if (name.startsWith(query)) return 0;
  return needsProvince ? 2 : 1;
}

export type RidingMatches = Readonly<{ matches: readonly RidingChoice[]; total: number }>;

/**
 * The ridings matching a query: a name that begins with it first, then a
 * name with every word, then a match that needed the province, each
 * alphabetical. `exclude` leaves out the riding the other side already holds.
 */
export function matchRidingChoices(
  query: string,
  choices: readonly RidingChoice[],
  { exclude, limit = 10, locale = "en" }: Readonly<{ exclude?: string | null; limit?: number; locale?: string }> = {},
): RidingMatches {
  const normalized = normalizeRidingQuery(query);
  if (!normalized) return { matches: [], total: 0 };
  const queryWords = normalized.split(" ");
  const ranked = choices
    .filter((choice) => choice.id !== exclude)
    .map((choice) => ({ choice, rank: rank(choice, normalized, queryWords) }))
    .filter((entry): entry is { choice: RidingChoice; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.choice.name.localeCompare(b.choice.name, locale) || a.choice.level.localeCompare(b.choice.level));
  return { matches: ranked.slice(0, limit).map((entry) => entry.choice), total: ranked.length };
}
