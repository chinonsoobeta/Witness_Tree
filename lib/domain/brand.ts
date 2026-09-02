import type { LocalizedString } from "./localized";
import { EXPLORE_COVERAGE_PERIOD } from "../explore/types";

// The product name lives in this one token. Persistent identifiers must not use it.
export const PRODUCT_NAME: LocalizedString = Object.freeze({ en: "Witness Tree", fr: "Arbre témoin" });

export const PRODUCT_PURPOSE: LocalizedString = Object.freeze({
  en: `A public record of forest loss in British Columbia, Alberta, Ontario and Quebec from ${EXPLORE_COVERAGE_PERIOD.en}.`,
  fr: `Un registre public des pertes forestières en Colombie-Britannique, en Alberta, en Ontario et au Québec de ${EXPLORE_COVERAGE_PERIOD.fr}.`,
});
