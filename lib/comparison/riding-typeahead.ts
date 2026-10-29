/**
 * Matching for the Compare page's riding fields.
 *
 * The comparison already ships every four-province federal riding name (280
 * of them), so the fields match in the browser against that list rather than
 * calling the search route. This module imports nothing else, so the client
 * field carries only these few functions and the names it is given.
 *
 * A query matches a riding when every word of the query starts some word of
 * the riding's name in the page's language, or names its province: by its
 * name in either language, its postal code (BC, AB, ON, QC) or its French
 * abbreviation (C.-B., Alb., Ont., Qc). Accents, case and punctuation are
 * ignored. Rendered names stay the source values.
 */

/** One riding as the field lists it, in one language, in the fallback list's order. */
export type RidingChoice = Readonly<{
  id: string;
  name: string;
  /** The province's name in the page's language, or null when the id carries no province. */
  province: string | null;
}>;

/** Words that name each province, keyed by the federal district number prefix. */
const PROVINCE_WORDS: Readonly<Record<string, readonly string[]>> = {
  "59": ["bc", "cb", "british", "columbia", "colombie", "britannique"],
  "48": ["ab", "alb", "alberta"],
  "35": ["on", "ont", "ontario"],
  "24": ["qc", "quebec"],
};

/** The province prefix of a federal district id such as `federal-59021`. */
export function ridingProvincePrefix(id: string): string | null {
  const prefix = /^federal-(\d{2})/.exec(id)?.[1];
  return prefix && prefix in PROVINCE_WORDS ? prefix : null;
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
  const provinceWords = PROVINCE_WORDS[ridingProvincePrefix(choice.id) ?? ""] ?? [];
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
    .sort((a, b) => a.rank - b.rank || a.choice.name.localeCompare(b.choice.name, locale));
  return { matches: ranked.slice(0, limit).map((entry) => entry.choice), total: ranked.length };
}
