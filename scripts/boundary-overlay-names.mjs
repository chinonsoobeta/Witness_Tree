export function requireExactBilingualJoin(primaryIds, translatedNames, label) {
  if (!translatedNames) return;
  const primary = new Set([...primaryIds].map(String));
  const translated = new Set([...translatedNames.keys()].map(String));
  const missing = [...primary].filter((id) => !translated.has(id));
  const extra = [...translated].filter((id) => !primary.has(id));
  if (missing.length || extra.length) {
    throw new Error(
      `${label}: bilingual identifiers differ; missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`,
    );
  }
}

export function resolveBoundaryNames(source, properties, translatedNames, rawId) {
  const en = properties[source.en_field];
  if (!String(en ?? "").trim()) {
    throw new Error(`${source.id}: feature ${rawId} has no name in ${source.en_field}`);
  }

  let fr;
  if (translatedNames) {
    fr = translatedNames.get(String(rawId));
  } else if (source.fr_field) {
    fr = properties[source.fr_field];
  } else {
    fr = en;
  }
  if (!String(fr ?? "").trim()) {
    throw new Error(`${source.id}: feature ${rawId} has no French name`);
  }
  return { en: String(en).trim(), fr: String(fr).trim() };
}
