import type { Locale } from "@/lib/domain";

const COPY = {
  en: {
    title: "Methodology",
    definition: "Forest definition",
    definitionText: "Forest is land of at least 1 hectare, with at least 10% crown closure, carrying trees capable of reaching 5 metres at maturity.",
    denominator: "Denominator and period",
    denominatorText: "Percentages use forested hectares inside the applicable boundary edition, with the forest mask from the first year of the requested range. Coverage begins in 1984; the default view begins in 2000. Total land area is not a denominator.",
    coverage: "Geographic coverage",
    coverageText: "The national baseline covers British Columbia, Alberta, Ontario and Quebec. Quebec north of 52° is shown as national baseline, not as enhanced local coverage. Coverage is intersected from mapped geometry, not inferred from a province label.",
    evidence: "Evidence and confidence",
    evidenceText: "Each public claim is classified as an official record, satellite observation, derived estimate or unknown. Confidence is high, medium, limited or unknown and always includes its generated reason. A colour alone does not communicate confidence.",
    matching: "Matching and precedence",
    matchingText: "Detected change matches an official record when the overlap is at least 50% of the smaller geometry. The date tolerance is ±2 years, widened to ±3 years before 1995. Where events overlap in the same hectare and year, display and totals use: fire; recorded harvest; recorded insect or disease disturbance; other recorded intervention; then detected change with no matching record. Overlapping evidence is retained.",
    limits: "What this record does not claim",
    limitsText: "A detected change is not labelled as logging, deforestation, a compliance finding or a named responsible organisation. Where no authoritative public record has been integrated, the record says so rather than substituting a numeric value.",
  },
  fr: {
    title: "Méthodologie",
    definition: "Définition de la forêt",
    definitionText: "La forêt est une terre d’au moins 1 hectare, présentant un couvert de cimes d’au moins 10 %, avec des arbres capables d’atteindre 5 mètres à maturité.",
    denominator: "Dénominateur et période",
    denominatorText: "Les pourcentages utilisent les hectares forestiers à l’intérieur de l’édition de limite applicable, avec le masque forestier de la première année de la période demandée. La couverture commence en 1984; la vue par défaut commence en 2000. La superficie totale des terres n’est pas un dénominateur.",
    coverage: "Couverture géographique",
    coverageText: "La référence nationale couvre la Colombie-Britannique, l’Alberta, l’Ontario et le Québec. Le Québec au nord du 52e degré est présenté comme référence nationale, et non comme couverture locale enrichie. La couverture est intersectée à partir d’une géométrie cartographiée, et non déduite d’une étiquette provinciale.",
    evidence: "Preuves et confiance",
    evidenceText: "Chaque affirmation publique est classée comme registre officiel, observation satellitaire, estimation dérivée ou inconnue. La confiance est élevée, moyenne, limitée ou inconnue et comprend toujours sa raison générée. Une couleur seule ne communique pas la confiance.",
    matching: "Appariement et préséance",
    matchingText: "Un changement détecté correspond à un registre officiel lorsque le chevauchement atteint au moins 50 % de la plus petite géométrie. La tolérance de date est de ±2 ans, élargie à ±3 ans avant 1995. Lorsque des événements se chevauchent dans le même hectare et la même année, l’affichage et les totaux utilisent : incendie; récolte consignée; perturbation consignée par insecte ou maladie; autre intervention consignée; puis changement détecté sans registre correspondant. Les preuves qui se chevauchent sont conservées.",
    limits: "Ce que ce registre n’affirme pas",
    limitsText: "Un changement détecté n’est pas qualifié d’exploitation, de déforestation, de conclusion de conformité ou d’organisation responsable désignée. Lorsqu’aucun registre public faisant autorité n’a été intégré, le registre l’indique plutôt que de substituer une valeur numérique.",
  },
} as const;

export function MethodologyPage({ locale }: Readonly<{ locale: Locale }>) {
  const copy = COPY[locale];
  const sections = [
    [copy.definition, copy.definitionText],
    [copy.denominator, copy.denominatorText],
    [copy.coverage, copy.coverageText],
    [copy.evidence, copy.evidenceText],
    [copy.matching, copy.matchingText],
    [copy.limits, copy.limitsText],
  ];

  return <main id="main" className="page-wrap"><header className="masthead"><h1>{copy.title}</h1></header><div className="content-section prose-measure">
    {sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}
  </div></main>;
}
