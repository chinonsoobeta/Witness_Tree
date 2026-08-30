import { PRODUCT_NAME, type Locale } from "@/lib/domain";

const AGENCIES = [
  {
    province: { en: "British Columbia", fr: "Colombie-Britannique" },
    name: { en: "BC Wildfire Service", fr: "BC Wildfire Service" },
    destination: { en: "Current wildfire map", fr: "Carte actuelle des feux de forêt" },
    url: { en: "https://wildfiresituation.nrs.gov.bc.ca/map", fr: "https://wildfiresituation.nrs.gov.bc.ca/map" },
  },
  {
    province: { en: "Alberta", fr: "Alberta" },
    name: { en: "Alberta Wildfire", fr: "Alberta Wildfire" },
    destination: { en: "Wildfire status", fr: "État des feux de forêt" },
    url: { en: "https://www.alberta.ca/wildfire-status", fr: "https://www.alberta.ca/wildfire-status" },
  },
  {
    province: { en: "Ontario", fr: "Ontario" },
    name: {
      en: "Ontario Aviation, Forest Fire and Emergency Services",
      fr: "Services d’urgence, d’aviation et de lutte contre les feux de forêt de l’Ontario",
    },
    destination: { en: "Forest fire information", fr: "Information sur les feux de forêt" },
    url: { en: "https://www.ontario.ca/page/forest-fires", fr: "https://www.ontario.ca/fr/page/incendies-de-foret" },
  },
  {
    province: { en: "Quebec", fr: "Québec" },
    name: {
      en: "Société de protection des forêts contre le feu (SOPFEU)",
      fr: "Société de protection des forêts contre le feu (SOPFEU)",
    },
    destination: { en: "Current situation map", fr: "Carte de la situation actuelle" },
    url: { en: "https://www.sopfeu.qc.ca/en/map/", fr: "https://www.sopfeu.qc.ca/carte/" },
  },
] as const;

const COPY = {
  en: {
    eyebrow: "Official agency directory",
    title: "Wildfire information",
    context:
      `${PRODUCT_NAME.en} does not publish a live wildfire feed. Use the responsible public agency for current fires, restrictions, evacuation information and emergency instructions.`,
    urgent: "For an immediate threat to life or property, call 911 and follow local emergency instructions.",
    directory: "Provincial wildfire agencies",
    timing:
      "Wildfire conditions and agency notices can change quickly. Confirm the update time and limits on the agency page before acting.",
    status: "Product feed status",
    sourceUpdated: "Source updated",
    sourceUpdatedValue: "Unavailable; no live feed is connected.",
    lastRefresh: `Last successful ${PRODUCT_NAME.en} refresh`,
    lastRefreshValue: "None; no live refresh has run.",
    agency: "Source agency",
    agencyValue: "Use the responsible provincial agency listed above.",
    nextRefresh: "Next scheduled refresh",
    nextRefreshValue: "Not scheduled.",
    emergency: "Official emergency information",
    emergencyValue: "Go to the official agency directory",
  },
  fr: {
    eyebrow: "Répertoire des organismes officiels",
    title: "Information sur les feux de forêt",
    context:
      `${PRODUCT_NAME.fr} ne publie pas de flux en direct sur les feux de forêt. Consultez l’organisme public responsable pour connaître les feux actuels, les restrictions, les renseignements sur les évacuations et les consignes d’urgence.`,
    urgent: "En cas de menace immédiate pour la vie ou les biens, composez le 911 et suivez les consignes d’urgence locales.",
    directory: "Organismes provinciaux responsables des feux de forêt",
    timing:
      "Les conditions et les avis des organismes peuvent changer rapidement. Vérifiez l’heure de mise à jour et les limites indiquées sur la page de l’organisme avant d’agir.",
    status: "État du flux du produit",
    sourceUpdated: "Mise à jour de la source",
    sourceUpdatedValue: "Indisponible; aucun flux en direct n’est connecté.",
    lastRefresh: `Dernière actualisation réussie d’${PRODUCT_NAME.fr}`,
    lastRefreshValue: "Aucune; aucune actualisation en direct n’a été exécutée.",
    agency: "Organisme source",
    agencyValue: "Consultez l’organisme provincial responsable indiqué ci-dessus.",
    nextRefresh: "Prochaine actualisation prévue",
    nextRefreshValue: "Aucune actualisation n’est prévue.",
    emergency: "Information d’urgence officielle",
    emergencyValue: "Consulter le répertoire des organismes officiels",
  },
} as const;

export type WildfireViewProps = Readonly<{ locale: Locale }>;

export function WildfireView({ locale }: WildfireViewProps) {
  const copy = COPY[locale];
  return (
    <main id="main" className="page-wrap wildfire-page">
      <header className="masthead">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="dek">{copy.context}</p>
      </header>

      <aside className="notice notice--alert" role="note">
        <p><strong>{copy.urgent}</strong></p>
      </aside>

      <section className="content-section" aria-labelledby="wildfire-directory-heading">
        <h2 id="wildfire-directory-heading">{copy.directory}</h2>
        <ul className="link-list">
          {AGENCIES.map((agency) => (
            <li className="card card--lift" key={agency.url.en}>
              <p className="eyebrow">{agency.province[locale]}</p>
              <a href={agency.url[locale]}>
                {agency.name[locale]}: {agency.destination[locale]}
              </a>
            </li>
          ))}
        </ul>
        <p>{copy.timing}</p>
      </section>

      <section className="content-section" aria-labelledby="wildfire-status-heading">
        <h2 id="wildfire-status-heading">{copy.status}</h2>
        <dl className="stat-row">
          <div className="stat"><dt>{copy.sourceUpdated}</dt><dd>{copy.sourceUpdatedValue}</dd></div>
          <div className="stat"><dt>{copy.lastRefresh}</dt><dd>{copy.lastRefreshValue}</dd></div>
          <div className="stat"><dt>{copy.agency}</dt><dd>{copy.agencyValue}</dd></div>
          <div className="stat"><dt>{copy.nextRefresh}</dt><dd>{copy.nextRefreshValue}</dd></div>
          <div className="stat">
            <dt>{copy.emergency}</dt>
            <dd><a href="#wildfire-directory-heading">{copy.emergencyValue}</a></dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
