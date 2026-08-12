import type { Locale } from "../domain/index.ts";
import type { AlertTriggerClass } from "./types.ts";

export const ALERT_TEMPLATES: Readonly<Record<AlertTriggerClass, Readonly<Record<Locale, string>>>> = {
  "wildfire-intersection": { en: "Official wildfire perimeter intersects your saved area.", fr: "Un périmètre officiel d’incendie recoupe votre zone enregistrée." },
  "wildfire-nearby": { en: "Official wildfire perimeter is near your saved area.", fr: "Un périmètre officiel d’incendie se trouve près de votre zone enregistrée." },
  "official-record": { en: "An official record changed in your saved area.", fr: "Un registre officiel a changé dans votre zone enregistrée." },
  "unmatched-detected-change": { en: "Detected change without a matching official record is available for your saved area.", fr: "Un changement détecté sans registre officiel correspondant est disponible pour votre zone enregistrée." },
  "annual-data-release": { en: "A data release covering your saved area is available.", fr: "Une version de données couvrant votre zone enregistrée est disponible." },
  correction: { en: "A figure previously reported for your saved area has been restated.", fr: "Un chiffre communiqué auparavant pour votre zone enregistrée a été rectifié." },
  "coverage-grade-change": { en: "Coverage information changed for your saved area.", fr: "L’information sur la couverture a changé pour votre zone enregistrée." },
};
