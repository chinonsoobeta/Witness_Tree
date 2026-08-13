import { PRODUCT_NAME, type Locale } from "@/lib/domain";
import { ACCOUNT_SERVICE_STATUS } from "@/lib/accounts";

const COPY = {
  en: {
    title: "Account service status",
    status: "Accounts are not active. Sign-up, sign-in, saved areas, exports, deletion requests, and email delivery are unavailable in this technical preview.",
    planned: "Planned v1 capabilities",
    capabilities: ["Save up to 25 supported places or custom areas, with each custom area limited to 5,000 km².", "Use a verified email address and choose an alert language independently of browsing language.", "Choose alert preferences and cadence, view alert history with its exact data version, and export saved areas and alert history.", "Request deletion of the account and its personal data; after a functioning request is available, deletion is due within 30 days."],
    safeguards: "Required before this service can operate",
    safeguardsList: ["Canadian managed PostgreSQL with database row-level security.", "Encryption for saved geometries at rest.", "A transactional email provider, rate limiting, duplicate suppression, and an operator-controlled alert stop.", "Privacy review and external operational ownership, including monitoring and incident response."],
    alerts: "Evidence-safe alert content",
    alertCopy: "Every future alert will state its evidence class first, exact data version, source agency, observation time, and versioned page link in the selected language. Wildfire alerts will put the responsible agency’s safety link before product content. Alerts are not emergency direction.",
    links: "Read the draft privacy notice and terms and limitations.",
    privacy: "Privacy notice",
    terms: "Terms and limitations",
  },
  fr: {
    title: "État du service de compte",
    status: "Les comptes ne sont pas actifs. L’inscription, la connexion, les zones enregistrées, les exportations, les demandes de suppression et l’envoi de courriels ne sont pas disponibles dans cet aperçu technique.",
    planned: "Fonctions prévues de la version 1",
    capabilities: ["Enregistrer jusqu’à 25 lieux pris en charge ou zones personnalisées; chaque zone personnalisée est limitée à 5 000 km².", "Utiliser une adresse courriel vérifiée et choisir la langue des alertes indépendamment de la langue de navigation.", "Choisir les préférences et la fréquence des alertes, consulter l’historique avec la version exacte des données, et exporter les zones enregistrées et l’historique.", "Demander la suppression du compte et des données personnelles; après la disponibilité d’une demande fonctionnelle, la suppression est due dans les 30 jours."],
    safeguards: "Conditions requises avant la mise en service",
    safeguardsList: ["PostgreSQL géré au Canada avec sécurité des lignes imposée par la base de données.", "Chiffrement au repos des géométries enregistrées.", "Fournisseur de courriel transactionnel, limitation du débit, suppression des doublons et arrêt des alertes contrôlé par un opérateur.", "Examen de la confidentialité et responsabilité opérationnelle externe, notamment la surveillance et la réponse aux incidents."],
    alerts: "Contenu d’alerte conforme aux preuves",
    alertCopy: "Chaque future alerte indiquera d’abord sa classe de preuve, la version exacte des données, l’organisme source, l’heure d’observation et le lien vers la page versionnée dans la langue choisie. Les alertes d’incendie placeront le lien de sécurité de l’organisme responsable avant le contenu du produit. Les alertes ne constituent pas des directives d’urgence.",
    links: "Consultez l’avis de confidentialité provisoire et les conditions et limites.",
    privacy: "Avis de confidentialité",
    terms: "Conditions et limites",
  },
} as const;

export function AccountStatusPage({ locale }: Readonly<{ locale: Locale }>) {
  if (ACCOUNT_SERVICE_STATUS.enabled) throw new Error("An active account service needs an implemented account experience.");
  const copy = COPY[locale]; const prefix = `/${locale}`; const alertCopy = copy.alertCopy.replace(locale === "en" ? "product" : "produit", PRODUCT_NAME[locale]);
  return <main id="main" className="page-wrap"><header className="masthead"><h1>{copy.title}</h1><p className="dek">{copy.status}</p></header><section className="content-section prose-measure"><h2>{copy.planned}</h2><ul>{copy.capabilities.map((item) => <li key={item}>{item}</li>)}</ul><h2>{copy.safeguards}</h2><ul>{copy.safeguardsList.map((item) => <li key={item}>{item}</li>)}</ul><h2>{copy.alerts}</h2><p>{alertCopy}</p><p>{copy.links} <a href={`${prefix}/${locale === "en" ? "privacy" : "confidentialite"}`}>{copy.privacy}</a> · <a href={`${prefix}/${locale === "en" ? "terms" : "conditions"}`}>{copy.terms}</a></p></section></main>;
}
