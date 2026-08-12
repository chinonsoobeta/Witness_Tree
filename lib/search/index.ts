import { PLACES, type Place } from "@/lib/places";

export function normalizeSearch(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
export function searchPlaces(query: string, places: readonly Place[] = PLACES) { const needle = normalizeSearch(query); if (!needle) return []; return places.filter((place) => [place.name.en, place.name.fr, place.aliases.en, place.aliases.fr].some((value) => normalizeSearch(value).includes(needle))).sort((a, b) => a.id.localeCompare(b.id)); }
