import { PRODUCT_NAME, type Locale } from "@/lib/domain";

const COPY = {
  en: {
    title: "Account service status",
    status:
      "Accounts are not active yet. Sign-up, sign-in, saved areas, downloads, deletion requests and emails are unavailable in this preview.",
    future: "What it will take to turn on accounts",
    planned: "What accounts will let you do",
    capabilities: [
      "Save up to 25 places or areas you draw, each up to 5,000 km².",
      "Use a verified email address, and get alerts in either language, whatever language you browse in.",
      "Choose which alerts you get and how often, see past alerts with the data version they used, and download your saved areas and alerts.",
      "Ask for your account and personal data to be deleted; once this works, deletion will happen within 30 days.",
    ],
    safeguards: "Needed before accounts can open",
    safeguardsList: [
      "A database hosted in Canada that keeps each account’s data separate.",
      "Encryption of saved areas.",
      "An email service with limits on how often it sends, no duplicate emails, and a switch to stop all alerts.",
      "A privacy review, and an outside team to watch the service and respond to problems.",
    ],
    alerts: "What alerts will say",
    alertCopy:
      "Each alert will start with its kind of evidence, then give the data version, source agency, time observed and a page link, in your language. Wildfire alerts will show the agency’s safety link first. Alerts are not emergency direction.",
    links:
      "Read the privacy notice and the terms and limitations.",
    privacy: "Privacy notice",
    terms: "Terms and limitations",
  },
  fr: {
    title: "État du service de compte",
    status:
      "Les comptes ne sont pas encore actifs. L’inscription, la connexion, les zones enregistrées, les téléchargements, les demandes de suppression et les courriels ne sont pas disponibles dans cet aperçu.",
    future: "Ce qu’il faut pour activer les comptes",
    planned: "Fonctions prévues de la version 1",
    capabilities: [
      "Enregistrer jusqu’à 25 lieux ou zones dessinées, chacune d’au plus 5 000 km².",
      "Utiliser une adresse courriel vérifiée et recevoir les alertes dans l’une ou l’autre langue, quelle que soit la langue de navigation.",
      "Choisir les alertes reçues et leur fréquence, consulter les alertes passées avec la version exacte des données utilisée, et télécharger vos zones et vos alertes.",
      "Demander la suppression de votre compte et de vos données personnelles; une fois cette fonction en place, la suppression se fera dans les 30 jours.",
    ],
    safeguards: "Conditions requises avant la mise en service",
    safeguardsList: [
      "Une base de données hébergée au Canada qui sépare les données de chaque compte.",
      "Chiffrement des zones enregistrées.",
      "Un service de courriel qui limite la fréquence d’envoi, évite les doublons et peut arrêter toutes les alertes.",
      "Un examen de la confidentialité, et une équipe externe pour surveiller le service et réagir aux problèmes.",
    ],
    alerts: "Contenu d’alerte conforme aux preuves",
    alertCopy:
      "Chaque alerte commencera par son type de preuve, puis donnera la version des données, l’organisme source, l’heure d’observation et un lien vers la page, dans votre langue. Les alertes d’incendie afficheront d’abord le lien de sécurité de l’organisme. Les alertes ne constituent pas des directives d’urgence.",
    links:
      "Consultez l’avis de confidentialité et les conditions et limites.",
    privacy: "Avis de confidentialité",
    terms: "Conditions et limites",
  },
} as const;

export function AccountStatusPage({ locale }: Readonly<{ locale: Locale }>) {
  const copy = COPY[locale];
  const prefix = `/${locale}`;
  const alertCopy = copy.alertCopy.replace(
    locale === "en" ? "product" : "produit",
    PRODUCT_NAME[locale],
  );
  return (
    <main id="main" className="page-wrap account-page">
      <header className="masthead">
        <h1>{copy.title}</h1>
        <p className="account-state"><strong>{copy.status}</strong></p>
      </header>
      <details className="content-section account-future">
        <summary>{copy.future}</summary>
        <h2>{copy.planned}</h2>
        <ul className="capability-grid">
          {copy.capabilities.map((item) => (
            <li className="card" key={item}>
              {item}
            </li>
          ))}
        </ul>
        <h2>{copy.safeguards}</h2>
        <ul className="capability-grid">
          {copy.safeguardsList.map((item) => (
            <li className="card" key={item}>
              {item}
            </li>
          ))}
        </ul>
        <div className="prose-measure">
          <h2>{copy.alerts}</h2>
          <p>{alertCopy}</p>
          <p>
            {copy.links}{" "}
            <a
              className="btn btn--ghost"
              href={`${prefix}/${locale === "en" ? "privacy" : "confidentialite"}`}
            >
              {copy.privacy}
            </a>{" "}
            <a
              className="btn btn--ghost"
              href={`${prefix}/${locale === "en" ? "terms" : "conditions"}`}
            >
              {copy.terms}
            </a>
          </p>
        </div>
      </details>
    </main>
  );
}
