import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site";
import { formatHectares, formatPercent, PRODUCT_NAME } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD, EXPLORE_PRODUCTION_LAYER, formatUnknownSharePercent } from "@/lib/explore";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Registre public des pertes forestières", alternates: localizedAlternates("fr", { en: "/en", fr: "/fr" }) };

function coverageLabel(row: (typeof EXPLORE_PRODUCTION_LAYER.rows)[number]) {
  return `Minimum de la zone cartographiée; ${formatUnknownSharePercent(row.unknownSharePercent, "fr")} (${formatHectares(row.unknownRequiredInputHectares, "fr")}) de la superficie est inconnue`;
}

export default function FrenchHome() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap">
    <header className="masthead">
      <p className="eyebrow">Registre de preuves · {EXPLORE_COVERAGE_PERIOD.fr}</p>
      <h1>Qu’est-il arrivé à la forêt ici?</h1>
      <p className="dek">{PRODUCT_NAME.fr} aide à comprendre les pertes forestières consignées et détectées dans quatre provinces. Chaque résultat indique ce que montrent les preuves, leur provenance, leur actualité et ce qu’elles ne permettent pas d’établir.</p>
      <div className="meta-row"><span>Colombie-Britannique</span><span>Alberta</span><span>Ontario</span><span>Québec</span></div>
    </header>
    <section className="content-section prose-measure" aria-labelledby="registre-actuel">
      <div className="section-heading"><span className="num">01</span><h2 id="registre-actuel">Commencer par le registre actuel</h2></div>
      <p className="lead">L’agrégat provincial provisoire et limité de {EXPLORE_PRODUCTION_LAYER.period} est prêt à explorer. Il présente la perte forestière détectée avec un état de couverture pour chaque province. Une vérification complète de l’étendue cartographiée de {EXPLORE_COVERAGE_PERIOD.fr} régit maintenant la classification des zones inconnues.</p>
      <dl className="principles">
        {EXPLORE_PRODUCTION_LAYER.rows.map((row) => <div className="principle" key={row.id}><dt>{row.name.fr}</dt><dd>{formatHectares(row.observedLossHectares, "fr")} de perte détectée ({formatPercent(row.observedLossPercent, "fr")}) · {coverageLabel(row)}</dd></div>)}
      </dl>
      <p><Link className="btn btn--primary" href="/fr/explorer">Explorer l’agrégat provincial</Link></p>
      <p><small>Portée : la Colombie-Britannique, l’Alberta, l’Ontario et le Québec passent d’abord. Cet aperçu technique limité à quatre provinces ne constitue pas une affirmation au sujet des autres provinces ou des territoires.</small></p>
    </section>
    <section className="content-section prose-measure">
      <div className="section-heading"><span className="num">02</span><h2>Un registre, pas un tableau de bord</h2></div>
      <p className="lead">Cherchez un lieu ou ouvrez un dossier. Consultez l’historique daté des récoltes consignées, des incendies, des perturbations et des changements détectés par satellite, avec la source jointe à chaque affirmation.</p>
      <dl className="principles">
        <div className="principle"><dt>Registre officiel</dt><dd>Une autorité publique consigne un événement, un périmètre, une intervention ou un rôle désigné.</dd></div>
        <div className="principle"><dt>Observation satellitaire</dt><dd>Les images montrent une réduction du couvert arboré ou une reprise ultérieure du couvert. À elles seules, elles n’en établissent pas la cause.</dd></div>
        <div className="principle"><dt>Estimation dérivée</dt><dd>Un calcul fondé sur des registres documentés et une méthode publiée.</dd></div>
        <div className="principle"><dt>Inconnu</dt><dd>Aucun registre public faisant autorité n’a été intégré pour la question. Une absence dans ce registre n’est pas une affirmation sur ce qui s’est produit dans le monde.</dd></div>
      </dl>
    </section>
    <section className="content-section">
      <div className="section-heading"><span className="num">03</span><h2>Consulter le registre</h2></div>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Composants</p><h3>Les preuves avant les chiffres</h3><p>Examinez la présentation des valeurs, des inconnues, de la confiance, de la couverture et de la provenance dans le registre public.</p><Link href="/fr/composants">Ouvrir la galerie de composants</Link></article>
        <article className="record-card"><p className="eyebrow">Méthodes</p><h3>Les définitions avant les chiffres</h3><p>Consultez le dénominateur forestier, les catégories de preuves, les règles de confiance, les niveaux de couverture et la méthode d’appariement.</p><Link href="/fr/methodes">Lire les méthodes</Link></article>
        <article className="record-card"><p className="eyebrow">État des données</p><h3>Version provinciale limitée</h3><p>L’agrégat provincial de 2020 à 2022 est publié avec sa source, son état de couverture et ses limites. D’autres vues peuvent encore utiliser des exemples clairement identifiés.</p><Link href="/fr/donnees">Consulter la transparence des données</Link></article>
      </div>
      <aside className="notice"><h3>Ce que ce registre n’affirme pas</h3><p>{PRODUCT_NAME.fr} n’estime pas le bois marchand, ne prédit pas la propagation des incendies, ne qualifie pas un changement détecté d’exploitation ou de déforestation, ne formule aucune conclusion juridique ou de conformité et ne déduit aucune responsabilité de la proximité.</p></aside>
    </section>
    <section className="content-section prose-measure" aria-labelledby="consequences">
      <div className="section-heading"><span className="num">04</span><h2 id="consequences">Pourquoi le contexte importe</h2></div>
      <p>La perte forestière détectée est une mesure dérivée de l’observation satellitaire, et non une conclusion sur la cause. Une réduction détectée du couvert arboré n’établit pas à elle seule l’exploitation, la déforestation, la responsabilité ou la conformité. <Link href="/fr/methodes">Lire les définitions de méthode et de preuve</Link>.</p>
      <p>La version disponible est un aperçu technique déterministe au niveau provincial, limité à quatre provinces, pour 2020 à 2022. Elle ne fournit pas une géométrie par cellule et ne satisfait pas au critère formel de la phase 2. <Link href="/fr/donnees">Lire la portée de la version, la provenance et l’attribution de licence</Link>.</p>
      <p><small>Source du contexte : {EXPLORE_PRODUCTION_LAYER.attribution.fr} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Catalogue source</a>.</small></p>
    </section>
  </main></SiteShell>;
}
