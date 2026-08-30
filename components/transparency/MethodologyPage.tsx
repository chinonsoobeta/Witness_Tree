import type { Locale } from "@/lib/domain";
import {
  EXPLORE_COVERAGE_PERIOD,
  EXPLORE_DEFAULT_YEAR,
  EXPLORE_YEAR_MIN,
} from "@/lib/explore";

const COPY = {
  en: {
    title: "Methodology",
    definition: "Forest definition",
    definitionText:
      "Forest is land of at least 1 hectare, with at least 10% crown closure, carrying trees capable of reaching 5 metres at maturity.",
    denominator: "Denominator and period",
    denominatorText:
      `Percentages use forested hectares inside the applicable boundary edition, with the forest mask from the first year of the requested range. Coverage spans ${EXPLORE_COVERAGE_PERIOD.en}; the year control starts at ${EXPLORE_YEAR_MIN} because each selected year names the interval ending in that year (${EXPLORE_YEAR_MIN} is the ${EXPLORE_YEAR_MIN - 1} to ${EXPLORE_YEAR_MIN} change). The default view is ${EXPLORE_DEFAULT_YEAR}. Total land area is not a denominator.`,
    coverage: "Geographic coverage",
    coverageText:
      "The national baseline covers British Columbia, Alberta, Ontario and Quebec. Quebec north of 52° is shown as national baseline, not as enhanced local coverage. Coverage is intersected from mapped geometry, not inferred from a province label.",
    evidence: "Evidence and confidence",
    evidenceText:
      "Each public claim is classified as an official record, satellite observation, derived estimate or unknown. Confidence is high, medium, limited or unknown and always includes its generated reason. A colour alone does not communicate confidence.",
    accuracy: "Detection accuracy",
    accuracyText:
      "The publisher cites an independent validation of the predecessor VLCE land-cover map for 2005: 70.3% overall classification accuracy with a 95% confidence interval of ±2.5 percentage points. That result is not a validation of this record’s derived forest-loss detections, a district-specific accuracy, or a validation of every VLCE2 year. A directly applicable detected-loss accuracy estimate is therefore Unknown.",
    accuracyLink: "Read the publisher-cited accuracy study",
    matching: "Matching and precedence",
    matchingText:
      "Detected change matches an official record when the overlap is at least 50% of the smaller geometry. The date tolerance is ±2 years, widened to ±3 years before 1995. Where events overlap in the same hectare and year, display and totals use: fire; recorded harvest; recorded insect or disease disturbance; other recorded intervention; then detected change with no matching record. Overlapping evidence is retained.",
    provincialMatching: "Provincial matching results",
    provincialMatchingText:
      "Match rate, non-match rate, and the non-match-reason distribution are not available. No provincial enhancement dataset has been admitted for processing, so publishing numeric rates would be misleading. This page will publish those results only for an admitted, versioned provincial processing run.",
    limits: "What this record does not claim",
    limitsText:
      "A detected change is not labelled as logging, deforestation, a compliance finding or a named responsible organisation. Where no authoritative public record has been integrated, the record says so rather than substituting a numeric value.",
  },
  fr: {
    title: "Méthodologie",
    definition: "Définition de la forêt",
    definitionText:
      "La forêt est une terre d’au moins 1 hectare, présentant un couvert de cimes d’au moins 10 %, avec des arbres capables d’atteindre 5 mètres à maturité.",
    denominator: "Dénominateur et période",
    denominatorText:
      `Les pourcentages utilisent les hectares forestiers à l’intérieur de l’édition de limite applicable, avec le masque forestier de la première année de la période demandée. La couverture s’étend de ${EXPLORE_COVERAGE_PERIOD.fr}; la commande d’année commence à ${EXPLORE_YEAR_MIN}, car chaque année choisie désigne l’intervalle qui se termine cette année-là (${EXPLORE_YEAR_MIN} correspond au changement de ${EXPLORE_YEAR_MIN - 1} à ${EXPLORE_YEAR_MIN}). La vue par défaut est ${EXPLORE_DEFAULT_YEAR}. La superficie totale des terres n’est pas un dénominateur.`,
    coverage: "Couverture géographique",
    coverageText:
      "La référence nationale couvre la Colombie-Britannique, l’Alberta, l’Ontario et le Québec. Le Québec au nord du 52e degré est présenté comme référence nationale, et non comme couverture locale enrichie. La couverture est intersectée à partir d’une géométrie cartographiée, et non déduite d’une étiquette provinciale.",
    evidence: "Preuves et confiance",
    evidenceText:
      "Chaque affirmation publique est classée comme registre officiel, observation satellitaire, estimation dérivée ou inconnue. La confiance est élevée, moyenne, limitée ou inconnue et comprend toujours sa raison générée. Une couleur seule ne communique pas la confiance.",
    accuracy: "Exactitude de la détection",
    accuracyText:
      "L’éditeur cite une validation indépendante de la carte de couverture terrestre VLCE antérieure pour 2005 : une exactitude globale de classification de 70,3 %, avec un intervalle de confiance à 95 % de ±2,5 points de pourcentage. Ce résultat ne valide ni les détections dérivées de perte forestière de ce registre, ni une exactitude propre à une circonscription, ni chaque année de VLCE2. Une estimation directement applicable de l’exactitude de la perte détectée demeure donc inconnue.",
    accuracyLink: "Lire l’étude d’exactitude citée par l’éditeur",
    matching: "Appariement et préséance",
    matchingText:
      "Un changement détecté correspond à un registre officiel lorsque le chevauchement atteint au moins 50 % de la plus petite géométrie. La tolérance de date est de ±2 ans, élargie à ±3 ans avant 1995. Lorsque des événements se chevauchent dans le même hectare et la même année, l’affichage et les totaux utilisent : incendie; récolte consignée; perturbation consignée par insecte ou maladie; autre intervention consignée; puis changement détecté sans registre correspondant. Les preuves qui se chevauchent sont conservées.",
    provincialMatching: "Résultats de l’appariement provincial",
    provincialMatchingText:
      "Le taux d’appariement, le taux de non-appariement et la répartition des motifs de non-appariement ne sont pas disponibles. Aucun jeu de données d’amélioration provinciale n’a été admis au traitement; publier des taux numériques serait donc trompeur. Cette page publiera ces résultats seulement pour une exécution provinciale admise et versionnée.",
    limits: "Ce que ce registre n’affirme pas",
    limitsText:
      "Un changement détecté n’est pas qualifié d’exploitation, de déforestation, de conclusion de conformité ou d’organisation responsable désignée. Lorsqu’aucun registre public faisant autorité n’a été intégré, le registre l’indique plutôt que de substituer une valeur numérique.",
  },
} as const;

export function MethodologyPage({ locale }: Readonly<{ locale: Locale }>) {
  const copy = COPY[locale];
  const sections = [
    [copy.definition, copy.definitionText],
    [copy.denominator, copy.denominatorText],
    [copy.coverage, copy.coverageText],
    [copy.evidence, copy.evidenceText],
    [copy.accuracy, copy.accuracyText],
    [copy.matching, copy.matchingText],
    [copy.provincialMatching, copy.provincialMatchingText],
    [copy.limits, copy.limitsText],
  ];

  return (
    <main id="main" className="page-wrap">
      <header className="masthead">
        <h1>{copy.title}</h1>
      </header>
      <div className="content-section prose-measure">
        {sections.map(([heading, text], index) => (
          <section className="governance-section" key={heading}>
            <p className="governance-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2>{heading}</h2>
            <p>{text}</p>
            {heading === copy.accuracy ? (
              <p>
                <a href="https://doi.org/10.1080/07038992.2018.1437719">
                  {copy.accuracyLink}
                </a>
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
