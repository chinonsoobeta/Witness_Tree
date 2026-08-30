import type { Locale } from "@/lib/domain";

const COUNTERPARTS: Record<string, string> = {
  "/en": "/fr", "/fr": "/en",
  "/en/explore": "/fr/explorer", "/fr/explorer": "/en/explore",
  "/en/compare": "/fr/comparer", "/fr/comparer": "/en/compare",
  "/en/wildfire": "/fr/incendies", "/fr/incendies": "/en/wildfire",
  "/en/account": "/fr/compte", "/fr/compte": "/en/account",
  "/en/methods": "/fr/methodes", "/fr/methodes": "/en/methods",
  "/en/about": "/fr/a-propos", "/fr/a-propos": "/en/about",
  "/en/data": "/fr/donnees", "/fr/donnees": "/en/data",
  "/en/data/official-harvest-comparison": "/fr/donnees/comparaison-recolte-officielle", "/fr/donnees/comparaison-recolte-officielle": "/en/data/official-harvest-comparison",
  "/en/terms": "/fr/conditions", "/fr/conditions": "/en/terms",
  "/en/privacy": "/fr/confidentialite", "/fr/confidentialite": "/en/privacy",
  "/en/corrections": "/fr/corrections", "/fr/corrections": "/en/corrections",
  "/en/components": "/fr/composants", "/fr/composants": "/en/components",
  "/en/glossary": "/fr/glossaire", "/fr/glossaire": "/en/glossary",
  "/en/engagement": "/fr/dialogue", "/fr/dialogue": "/en/engagement",
  "/en/releases": "/fr/versions", "/fr/versions": "/en/releases",
  "/en/decisions": "/fr/decisions", "/fr/decisions": "/en/decisions",
  "/en/search": "/fr/recherche", "/fr/recherche": "/en/search",
};

const SAFE_QUERY_PARAMETERS = new Set([
  "q", "district", "view", "sort", "left", "right", "mode",
  "presentation", "data", "year", "province", "overlays",
]);

export function localeCounterpart(pathname: string, locale: Locale): string {
  const staticCounterpart = COUNTERPARTS[pathname];
  if (staticCounterpart) return staticCounterpart;
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
