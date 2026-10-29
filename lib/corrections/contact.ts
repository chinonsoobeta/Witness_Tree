import { colon, type Locale, type LocalizedString } from "@/lib/domain";

/**
 * The one configuration point for the accountable corrections recipient. The
 * address is read from this environment variable when the corrections pages
 * are built; it is never committed to the repository. Unset, blank or
 * implausible means there is no recipient, and the pages keep saying there is
 * no way to send a correction.
 */
export const CORRECTIONS_RECIPIENT_ENV = "CORRECTIONS_RECIPIENT_EMAIL";

/** The recipient's role, as the corrections page names it. The person who holds it is named in the public record. */
export const CORRECTIONS_RECIPIENT_ROLE: LocalizedString = Object.freeze({
  en: "Corrections lead",
  fr: "Responsable des corrections",
});

export type CorrectionsRecipient = Readonly<{ email: string; role: LocalizedString }>;

// A deliberately narrow shape: plain local part, dotted domain, alphabetic top
// level. It admits no character that could add a header or parameter to a
// mailto link (no ?, &, #, %, quotes, spaces or angle brackets).
const PLAUSIBLE_ADDRESS =
  /^[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** Returns the trimmed address when it is plausible, otherwise null (treated as unset). */
export function plausibleRecipientEmail(value: string | undefined): string | null {
  const address = value?.trim();
  if (!address || address.length > 254 || !PLAUSIBLE_ADDRESS.test(address)) return null;
  return address;
}

/** The configured recipient, or null when the owner has not named a valid one. */
export function correctionsRecipient(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CorrectionsRecipient | null {
  const email = plausibleRecipientEmail(env[CORRECTIONS_RECIPIENT_ENV]);
  return email ? Object.freeze({ email, role: CORRECTIONS_RECIPIENT_ROLE }) : null;
}

const CORRECTION_MAIL: Record<Locale, Readonly<{ subject: string; fields: readonly string[] }>> = {
  en: {
    subject: "Correction request",
    fields: ["Page link", "Exact words or number", "Date and time", "Language", "Why it looks wrong", "Official source, if any"],
  },
  fr: {
    subject: "Demande de correction",
    fields: ["Lien de la page", "Mots ou chiffre exacts", "Date et heure", "Langue", "Pourquoi l’information semble erronée", "Source officielle, s’il y a lieu"],
  },
};

export function correctionMailSubject(locale: Locale): string {
  return CORRECTION_MAIL[locale].subject;
}

/** One heading per line, each followed by a blank line for the reader's answer. */
export function correctionMailBody(locale: Locale): string {
  return CORRECTION_MAIL[locale].fields.map((field) => `${field}${colon(locale)}`).join("\r\n\r\n") + "\r\n";
}

/** A mailto link with the subject and body prefilled in the reader's language (RFC 6068 encoding). */
export function correctionMailtoHref(recipient: CorrectionsRecipient, locale: Locale): string {
  return `mailto:${recipient.email}?subject=${encodeURIComponent(correctionMailSubject(locale))}&body=${encodeURIComponent(correctionMailBody(locale))}`;
}
