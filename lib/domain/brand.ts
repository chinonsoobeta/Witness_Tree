import type { LocalizedString } from "./localized";

// The product name lives in this one token. Persistent identifiers must not use it.
export const PRODUCT_NAME: LocalizedString = Object.freeze({ en: "Witness Tree", fr: "Arbre témoin" });

export const PRODUCT_PURPOSE: LocalizedString = Object.freeze({
  en: "A technical preview being built as a public record of forest change across Canada from 1984 to the latest admitted source year, with British Columbia, Alberta, Ontario and Quebec as Big Four focus provinces.",
  fr: "Un aperçu technique en cours de développement comme registre public des changements forestiers partout au Canada de 1984 à la plus récente année source admise, avec la Colombie-Britannique, l’Alberta, l’Ontario et le Québec comme quatre provinces prioritaires.",
});
