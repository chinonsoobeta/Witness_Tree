import { GENERATED_RECORDS, PLACE_REGISTRY } from "./fixtures";
import { GENERATED_RECORD_KINDS, type GeneratedLocalizedRecord, type GeneratedRecordKind, type RegistryEntry } from "./types";

const locales = ["en", "fr"] as const;
const idFor = (entry: RegistryEntry, kind: GeneratedRecordKind) => kind === "location" ? entry.location.coordinateId : entry[kind].id;

export function validateGeneratedRecordCompleteness(records: readonly GeneratedLocalizedRecord[] = GENERATED_RECORDS, registry: readonly RegistryEntry[] = PLACE_REGISTRY) {
  const expectedCount = registry.length * GENERATED_RECORD_KINDS.length * locales.length;
  if (records.length !== expectedCount) throw new Error(`Generated record set is incomplete: ${records.length}/${expectedCount}.`);
  const keys = new Set<string>();
  for (const record of records) {
    const key = `${record.kind}:${record.entityId}:${record.locale}`;
    if (keys.has(key)) throw new Error(`Duplicate generated record: ${key}.`);
    keys.add(key);
    if (!record.mdx.includes(`kind: ${record.kind}`) || !record.mdx.includes(`id: ${record.entityId}`) || !/status: example[\s\S]*reviewStatus: unapproved[\s\S]*productionEligible: false/.test(record.mdx)) throw new Error(`${key}: MDX boundary metadata is incomplete.`);
    if (!Object.keys(record.strings).length || Object.values(record.strings).some((value) => typeof value !== "string" || !value.trim()) || !record.mdx.includes(`# ${record.strings.title}`) || !record.mdx.includes(record.strings.status)) throw new Error(`${key}: localized strings or MDX body are incomplete.`);
  }
  for (const entry of registry) for (const kind of GENERATED_RECORD_KINDS) {
    const entityId = idFor(entry, kind);
    const pair = locales.map((locale) => records.find((record) => record.kind === kind && record.entityId === entityId && record.locale === locale));
    const en = pair[0];
    const fr = pair[1];
    if (!en || !fr) throw new Error(`${kind}:${entityId}: English/French pair is incomplete.`);
    if (JSON.stringify(Object.keys(en.strings).sort()) !== JSON.stringify(Object.keys(fr.strings).sort())) throw new Error(`${kind}:${entityId}: bilingual string keys differ.`);
    if (en.alternate.locale !== "fr" || fr.alternate.locale !== "en" || en.alternate.href !== fr.route || fr.alternate.href !== en.route) throw new Error(`${kind}:${entityId}: hreflang pair is inconsistent.`);
  }
  return { records: records.length, pairs: records.length / 2 };
}
