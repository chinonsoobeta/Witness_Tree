import { PLACE_NAME_INDEX, displayPlaceName, placeTypeLabel, type IndexedPlace } from "./place-names";
import { provinceSpanMeasurements } from "@/lib/explore/province-spans";
import { ridingIntervalMeasurements } from "@/lib/explore/riding-intervals";
import type { Locale } from "@/lib/domain";

const PROVINCES = [
  { id: "59", code: "BC", en: "British Columbia", fr: "Colombie-Britannique" },
  { id: "48", code: "AB", en: "Alberta", fr: "Alberta" },
  { id: "35", code: "ON", en: "Ontario", fr: "Ontario" },
  { id: "24", code: "QC", en: "Quebec", fr: "Québec" },
] as const;

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replaceAll("--", " ").replace(/[\u2013\u2014-]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const provinceNames = new Map(PROVINCES.flatMap((p) => [[normalize(p.en), p.code], [normalize(p.fr), p.code], [p.code.toLowerCase(), p.code]]));

function splitQuery(query: string) {
  const trimmed = query.trim();
  const comma = trimmed.match(/^(.*),\s*([^,]+)$/);
  const suffix = comma?.[2] ?? trimmed.match(/^(.*)\s+([^\s]+(?:\s+[^\s]+)?)$/)?.[2];
  const code = suffix ? provinceNames.get(normalize(suffix)) : undefined;
  return code ? { name: (comma?.[1] ?? trimmed.slice(0, trimmed.length - suffix!.length)).trim(), code } : { name: trimmed, code: undefined };
}

export type SiteSearchResult = Readonly<{
  kind: "province" | "riding" | "community";
  id: string;
  name: string;
  nameFr?: string | null;
  province: string;
  type?: string;
  federal?: readonly { id: string; share: number }[];
  provincial?: readonly { id: string; share: number }[];
  score: number;
}>;

const ridingRows = ridingIntervalMeasurements({ fromYear: 1984, toYear: 2022 });
const ridingNames = new Map<string, { en: string; fr: string }>();
for (const row of ridingRows) {
  const raw = row.boundaryId.split("-").slice(1).join("-");
  ridingNames.set(row.boundaryId, { en: raw, fr: raw });
}

function score(name: string, needle: string) {
  const value = normalize(name);
  if (value === needle) return 0;
  if (value.startsWith(needle)) return 1;
  if (value.split(" ").some((word) => word.startsWith(needle))) return 2;
  return value.includes(needle) ? 3 : 99;
}

export function searchSite(query: string): SiteSearchResult[] {
  const { name, code } = splitQuery(query);
  const needle = normalize(name);
  if (!needle) return [];
  const results: SiteSearchResult[] = [];
  for (const province of PROVINCES) {
    const s = score(`${province.en} ${province.fr}`, needle);
    if (s < 99 && (!code || code === province.code)) results.push({ kind: "province", id: province.id, name: province.en, nameFr: province.fr, province: province.code, score: s });
  }
  for (const place of PLACE_NAME_INDEX.places) {
    if (code && place.province !== code) continue;
    const s = Math.min(score(place.name, needle), place.nameFr ? score(place.nameFr, needle) : 99);
    if (s < 99) results.push({ kind: "community", id: place.id, name: displayPlaceName(place, "en"), nameFr: displayPlaceName(place, "fr"), province: place.province, type: place.type, federal: place.federal, provincial: place.provincial, score: s });
  }
  for (const row of ridingRows) {
    const names = ridingNames.get(row.boundaryId)!;
    const s = Math.min(score(names.en, needle), score(names.fr, needle));
    if (s < 99 && (!code || row.boundaryId.startsWith(`${code}-`) || row.boundaryId.startsWith("CA-"))) results.push({ kind: "riding", id: row.boundaryId, name: names.en, nameFr: names.fr, province: row.jurisdiction, score: s });
  }
  return results.sort((a, b) => a.score - b.score || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)).slice(0, 60);
}

export function provinceSearchRows() { return provinceSpanMeasurements({ fromYear: 1984, toYear: 2022 }); }
export function indexedPlaceForSearch(id: string): IndexedPlace | undefined { return PLACE_NAME_INDEX.places.find((place) => place.id === id); }
export function searchAttribution(locale: Locale) { return PLACE_NAME_INDEX.attribution[locale]; }
export function searchPlaceTypeLabel(type: string, locale: Locale) { return placeTypeLabel(type, locale); }
