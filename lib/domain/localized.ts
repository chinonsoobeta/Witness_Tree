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
