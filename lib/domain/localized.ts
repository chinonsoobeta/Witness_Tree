export type Locale = "en" | "fr";

export type LocalizedString = Readonly<{
  en: string;
  fr: string;
}>;

export function localized(en: string, fr: string): LocalizedString {
  if (!en.trim() || !fr.trim()) {
    throw new Error("Localized strings require non-empty English and French values.");
  }
  return Object.freeze({ en, fr });
}

export function inLocale(value: LocalizedString, locale: Locale): string {
  return value[locale];
}

/*
 * French typography sets a space before a colon, a semicolon, a question mark
 * and an exclamation mark. The French copy written by hand in this repository
 * already does. Labels composed at render time, from a translated fragment and
 * a value, were the sites that did not, because the punctuation lived in the
 * JSX rather than in the translation.
 *
 * The space is U+202F, the narrow no-break space French typography calls for.
 * A plain space would let a line break strand the colon at the start of a line,
 * and a full no-break space is wider than French setting wants.
 */
const NARROW_NO_BREAK_SPACE = " ";

export function colon(locale: Locale): string {
  return locale === "fr" ? `${NARROW_NO_BREAK_SPACE}:` : ":";
}

export function semicolon(locale: Locale): string {
  return locale === "fr" ? `${NARROW_NO_BREAK_SPACE};` : ";";
}

/** A translated label, its punctuation, and its value, joined for one locale. */
export function labelled(locale: Locale, label: string, value: string): string {
  return `${label}${colon(locale)} ${value}`;
}
