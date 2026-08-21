import { PLACE_REGISTRY, type Place } from "@/lib/places";

export function normalizeSearch(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
export function searchPlaces(query: string, places?: readonly Place[]) { const needle = normalizeSearch(query); if (!needle) return []; const entries = places ? places.map((place) => ({ place, search: { name: place.name, aliases: place.aliases } })) : PLACE_REGISTRY; return entries.filter(({ search }) => [search.name.en, search.name.fr, search.aliases.en, search.aliases.fr].some((value) => normalizeSearch(value).includes(needle))).map(({ place }) => place).sort((a, b) => a.id.localeCompare(b.id)); }
