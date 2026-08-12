import type { LocalizedString } from "./localized";

// The product name lives in this one token. Persistent identifiers must not use it.
export const PRODUCT_NAME: LocalizedString = Object.freeze({ en: "Witness Tree", fr: "Arbre témoin" });

export const PRODUCT_PURPOSE: LocalizedString = Object.freeze({
  en: "A public record of forest change in British Columbia, Alberta, Ontario and Quebec from 1984 to the present.",
  fr: "Un registre public des changements forestiers en Colombie-Britannique, en Alberta, en Ontario et au Québec depuis 1984.",
});
