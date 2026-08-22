import { GENERATED_RECORDS, PLACE_REGISTRY } from "./fixtures";
import { GENERATED_RECORD_KINDS, type GeneratedLocalizedRecord, type GeneratedRecordKind, type RegistryEntry } from "./types";

const locales = ["en", "fr"] as const;
const idFor = (entry: RegistryEntry, kind: GeneratedRecordKind) => kind === "location" ? entry.location.coordinateId : entry[kind].id;
const routeFor = (entry: RegistryEntry, kind: GeneratedRecordKind, locale: "en" | "fr"): string | null => {
  const id = idFor(entry, kind);
  if (kind === "place") return locale === "en" ? `/en/places/${id}` : `/fr/lieux/${id}`;
  if (kind === "location") return locale === "en" ? `/en/location/${id}` : `/fr/emplacement/${id}`;
  return null;
};

function parseFrontMatter(mdx: string, key: string): Readonly<Record<string, string>> {
  const lines = mdx.split("\n");
  if (lines[0] !== "---") throw new Error(`${key}: MDX front matter is missing.`);
  const end = lines.indexOf("---", 1);
  if (end < 2) throw new Error(`${key}: MDX front matter is incomplete.`);
  const metadata: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*$/.exec(line);
    if (!match || !match[2]) throw new Error(`${key}: MDX front matter contains an invalid field.`);
    const [, name, value] = match;
    if (Object.hasOwn(metadata, name)) throw new Error(`${key}: duplicate MDX front matter key ${name}.`);
    metadata[name] = value;
  }
  const required = ["id", "kind", "productionEligible", "reviewStatus", "status"];
  if (JSON.stringify(Object.keys(metadata).sort()) !== JSON.stringify(required)) throw new Error(`${key}: MDX boundary metadata is incomplete or contains unsupported fields.`);
  return metadata;
}

export function validateGeneratedRecordCompleteness(records: readonly GeneratedLocalizedRecord[] = GENERATED_RECORDS, registry: readonly RegistryEntry[] = PLACE_REGISTRY) {
  const expectedCount = registry.length * GENERATED_RECORD_KINDS.length * locales.length;
  if (records.length !== expectedCount) throw new Error(`Generated record set is incomplete: ${records.length}/${expectedCount}.`);
  const keys = new Set<string>();
  const recordsByKey = new Map<string, GeneratedLocalizedRecord>();
  for (const record of records) {
    if (!GENERATED_RECORD_KINDS.includes(record.kind) || !locales.includes(record.locale) || typeof record.entityId !== "string" || !record.entityId.trim() || typeof record.route !== "string" && record.route !== null || typeof record.mdx !== "string") throw new Error("Generated record identity or shape is invalid.");
    const key = `${record.kind}:${record.entityId}:${record.locale}`;
    if (keys.has(key)) throw new Error(`Duplicate generated record: ${key}.`);
    keys.add(key);
    recordsByKey.set(key, record);
    const metadata = parseFrontMatter(record.mdx, key);
    if (metadata.kind !== record.kind || metadata.id !== record.entityId || metadata.status !== "example" || metadata.reviewStatus !== "unapproved" || metadata.productionEligible !== "false") throw new Error(`${key}: MDX boundary metadata is contradictory.`);
    if (!Object.keys(record.strings).length || Object.values(record.strings).some((value) => typeof value !== "string" || !value.trim()) || !record.mdx.includes(`# ${record.strings.title}`) || !record.mdx.includes(record.strings.status)) throw new Error(`${key}: localized strings or MDX body are incomplete.`);
  }
  for (const entry of registry) for (const kind of GENERATED_RECORD_KINDS) {
    const entityId = idFor(entry, kind);
    const pair = locales.map((locale) => recordsByKey.get(`${kind}:${entityId}:${locale}`));
    const en = pair[0];
    const fr = pair[1];
    if (!en || !fr) throw new Error(`${kind}:${entityId}: English/French pair is incomplete.`);
    if (JSON.stringify(Object.keys(en.strings).sort()) !== JSON.stringify(Object.keys(fr.strings).sort())) throw new Error(`${kind}:${entityId}: bilingual string keys differ.`);
    for (const [record, locale] of [[en, "en"], [fr, "fr"]] as const) {
      if (record.route !== routeFor(entry, kind, locale)) throw new Error(`${kind}:${entityId}:${locale}: route identity is inconsistent with the registry.`);
    }
    if (en.alternate.locale !== "fr" || fr.alternate.locale !== "en" || en.alternate.href !== fr.route || fr.alternate.href !== en.route) throw new Error(`${kind}:${entityId}: hreflang pair is inconsistent.`);
    for (const [record, locale] of [[en, "en"], [fr, "fr"]] as const) {
      if (record.alternate.href !== routeFor(entry, kind, locale === "en" ? "fr" : "en")) throw new Error(`${kind}:${entityId}:${locale}: route identity is inconsistent with the registry.`);
    }
  }
  return { records: records.length, pairs: records.length / 2 };
}
