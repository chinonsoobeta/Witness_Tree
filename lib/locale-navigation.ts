import type { Locale } from "@/lib/domain";

const COUNTERPARTS: Record<string, string> = {
  "/en": "/fr", "/fr": "/en",
  "/en/explore": "/fr/explorer", "/fr/explorer": "/en/explore",
  "/en/explore/draw": "/fr/explorer/dessiner", "/fr/explorer/dessiner": "/en/explore/draw",
  "/en/compare": "/fr/comparer", "/fr/comparer": "/en/compare",
  "/en/wildfire": "/fr/incendies", "/fr/incendies": "/en/wildfire",
  "/en/account": "/fr/compte", "/fr/compte": "/en/account",
  "/en/methods": "/fr/methodes", "/fr/methodes": "/en/methods",
  "/en/about": "/fr/a-propos", "/fr/a-propos": "/en/about",
  "/en/data": "/fr/donnees", "/fr/donnees": "/en/data",
  "/en/data/official-harvest-comparison": "/fr/donnees/comparaison-recolte-officielle", "/fr/donnees/comparaison-recolte-officielle": "/en/data/official-harvest-comparison",
  "/en/data/bc-harvest-volume": "/fr/donnees/volume-recolte-bc", "/fr/donnees/volume-recolte-bc": "/en/data/bc-harvest-volume",
  "/en/data/provincial-harvest-volume": "/fr/donnees/volume-recolte-provinces", "/fr/donnees/volume-recolte-provinces": "/en/data/provincial-harvest-volume",
  "/en/data/harvest-and-fire": "/fr/donnees/recolte-et-incendies", "/fr/donnees/recolte-et-incendies": "/en/data/harvest-and-fire",
  "/en/unknown": "/fr/inconnu", "/fr/inconnu": "/en/unknown",
  "/en/terms": "/fr/conditions", "/fr/conditions": "/en/terms",
  "/en/corrections": "/fr/corrections", "/fr/corrections": "/en/corrections",
  "/en/components": "/fr/composants", "/fr/composants": "/en/components",
  "/en/glossary": "/fr/glossaire", "/fr/glossaire": "/en/glossary",
  "/en/search": "/fr/recherche", "/fr/recherche": "/en/search",
};

// Every parameter a page reads, so switching language keeps the reader's selection.
// Explore's span start is `from`; Search reads `scope`; Harvest and fire reads
// `provinces`, `from`, `to`, `step` and `scale`.
const SAFE_QUERY_PARAMETERS = new Set([
  "q", "district", "scope", "view", "sort", "left", "right", "mode",
  "presentation", "data", "year", "from", "to", "step", "scale",
  "province", "provinces", "overlays",
]);

export function localeCounterpart(pathname: string, locale: Locale): string {
  const staticCounterpart = COUNTERPARTS[pathname];
  if (staticCounterpart) return staticCounterpart;
  if (pathname.startsWith("/en/components/example-places/")) return pathname.replace("/en/components/example-places/", "/fr/composants/exemples-lieux/");
  if (pathname.startsWith("/fr/composants/exemples-lieux/")) return pathname.replace("/fr/composants/exemples-lieux/", "/en/components/example-places/");
  // A real place keeps its data version, geography and code in both languages.
  if (pathname.startsWith("/en/places/")) return pathname.replace("/en/places/", "/fr/lieux/");
  if (pathname.startsWith("/fr/lieux/")) return pathname.replace("/fr/lieux/", "/en/places/");
  if (pathname.startsWith("/en/location/")) return pathname.replace("/en/location/", "/fr/emplacement/");
  if (pathname.startsWith("/fr/emplacement/")) return pathname.replace("/fr/emplacement/", "/en/location/");
  return `/${locale === "en" ? "fr" : "en"}`;
}

export function localeHref(pathname: string, search: URLSearchParams, locale: Locale): string {
  const query = new URLSearchParams();
  for (const [key, value] of search) if (SAFE_QUERY_PARAMETERS.has(key)) query.append(key, value);
  const suffix = query.toString();
  return `${localeCounterpart(pathname, locale)}${suffix ? `?${suffix}` : ""}`;
}

/**
 * Whether a primary-navigation link names the page being shown, or a section it sits in.
 * The locale home is a prefix of every page in its language, so it is current only on itself.
 */
export function isCurrentNavTarget(pathname: string, target: string): boolean {
  if (pathname === target) return true;
  return target !== "/en" && target !== "/fr" && pathname.startsWith(`${target}/`);
}

/** Whether a path in `locale` is one of the site's pages, by the same map the language switch uses. */
function isLocalePage(pathname: string, locale: Locale): boolean {
  return pathname === `/${locale}` || localeCounterpart(pathname, locale) !== `/${locale === "en" ? "fr" : "en"}`;
}

/**
 * Where a near-miss page address belongs, or null when it is already right or is
 * not a page of the site. Two near misses are corrected: a letter-case variant
 * (`/EN`, `/en/Explore`) goes to the lowercase address, and a slug from the other
 * language (`/fr/explore`, `/en/explorer`) goes to that page's address in the
 * language the address asked for. A dynamic segment keeps its case when the route
 * prefix is already right. The answer is always a path under `/en` or `/fr`.
 */
export function canonicalLocaleRedirect(pathname: string): string | null {
  const [, first = "", ...rest] = pathname.split("/");
  const locale = first.toLowerCase();
  if (locale !== "en" && locale !== "fr") return null;
  const tail = rest.length ? `/${rest.join("/")}` : "";
  for (const candidate of [`/${locale}${tail}`, `/${locale}${tail.toLowerCase()}`]) {
    if (isLocalePage(candidate, locale)) return candidate === pathname ? null : candidate;
  }
  const other = locale === "en" ? "fr" : "en";
  const borrowed = `/${other}${tail.toLowerCase()}`;
  return tail && isLocalePage(borrowed, other) ? localeCounterpart(borrowed, other) : null;
}
