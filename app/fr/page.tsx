import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch, ProvinceBar, SiteShell } from "@/components/site";
import { ProvinceCoverageCard } from "@/components/site/ProvinceCoverageCard";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
import { PRODUCT_NAME } from "@/lib/domain";
import { EXPLORE_PRODUCTION_LAYER, formatUnknownSharePercent } from "@/lib/explore";
import { productionAggregatePeriod } from "@/lib/explore/period";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Registre public des pertes forestières", alternates: localizedAlternates("fr", { en: "/en", fr: "/fr" }) };

function coverageLabel(row: (typeof EXPLORE_PRODUCTION_LAYER.rows)[number]) {
  return `${formatUnknownSharePercent(row.unknownSharePercent, "fr")} de la superficie provinciale n’a pas été cartographiée par la source${"unmappedCharacter" in row ? `; ${row.unmappedCharacter.fr}` : ""}`;
}

/* Voir la note sur app/en/page.tsx : mêmes trois changements, mêmes retraits. */
export default function FrenchHome() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap">
    <header className="masthead masthead--record">
      <p className="eyebrow">Registre public des pertes forestières</p>
      <h1>Qu’est-il arrivé à la forêt ici?</h1>
      <p className="dek">{PRODUCT_NAME.fr} présente les pertes forestières consignées et détectées dans quatre provinces, avec la source jointe à chaque affirmation.</p>
      <HomeSearch locale="fr" />
      <ProvinceBar locale="fr" />
    </header>

    <CoverageStatement locale="fr"><p>La perte détectée est un minimum de la zone cartographiée dans quatre provinces. Les superficies non cartographiées par la source restent inconnues, même là où la perte détectée est faible. Une absence dans ce registre n’est pas une affirmation sur ce qui s’est produit dans le monde.</p></CoverageStatement>

    <EvidenceLegend locale="fr" />

    <section className="content-section landing-coverage" aria-labelledby="registre-actuel">
      <h2 id="registre-actuel">Le registre publié</h2>
      <p className="lead">L’agrégat provincial provisoire et limité {productionAggregatePeriod("fr", "from")} présente la perte forestière détectée avec un état de couverture pour chaque province. La vérification de l’étendue cartographiée pour chacune des années est terminée, et ses résultats déterminent le classement des superficies non cartographiées.</p>
      <div className="province-coverage-grid">
        {EXPLORE_PRODUCTION_LAYER.rows.map((row) => <ProvinceCoverageCard key={row.id} row={row} locale="fr" unknownContext={coverageLabel(row)} />)}
      </div>
      <p><Link href="/fr/methodes#coverage-gap">Pourquoi ces superficies ne sont pas cartographiées et ce que nous en savons</Link></p>
      <p><Link className="btn btn--primary" href="/fr/explorer">Explorer le registre</Link></p>
      <p><small>D’autres provinces s’ajouteront bientôt.</small></p>
    </section>

    <section className="content-section prose-measure">
      <h2>Un registre, pas un tableau de bord</h2>
      <p className="lead">Ouvrez un dossier et consultez l’historique daté des récoltes consignées, des incendies, des perturbations et des changements détectés par satellite. Chaque affirmation porte la catégorie de preuve qui la soutient.</p>
      <dl className="principles">
        <div className="principle"><dt>Registre officiel</dt><dd>Une autorité publique consigne un événement, un périmètre, une intervention ou un rôle désigné.</dd></div>
        <div className="principle"><dt>Observation satellitaire</dt><dd>Les images montrent une réduction du couvert arboré ou une reprise ultérieure du couvert. À elles seules, elles n’en établissent pas la cause.</dd></div>
        <div className="principle"><dt>Estimation dérivée</dt><dd>Un calcul fondé sur des registres documentés et une méthode publiée.</dd></div>
        <div className="principle"><dt>Inconnu</dt><dd>Aucun registre public faisant autorité n’a été intégré pour la question.</dd></div>
      </dl>
    </section>

    <section className="content-section">
      <h2>Consulter le registre</h2>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Composants</p><h3>Les preuves avant les chiffres</h3><p>Examinez la présentation des valeurs, des inconnues, de la confiance, de la couverture et de la provenance dans le registre public.</p><Link href="/fr/composants">Ouvrir la galerie de composants</Link></article>
        <article className="record-card"><p className="eyebrow">Méthodes</p><h3>Les définitions avant les chiffres</h3><p>Consultez le dénominateur forestier, les catégories de preuves, les règles de confiance, les niveaux de couverture et la méthode d’appariement.</p><Link href="/fr/methodes">Lire les méthodes</Link></article>
        <article className="record-card"><p className="eyebrow">État des données</p><h3>Version provinciale limitée</h3><p>L’agrégat provincial {productionAggregatePeriod("fr", "from")} est publié avec sa source, son état de couverture et ses limites.</p><Link href="/fr/donnees">Consulter la transparence des données</Link></article>
      </div>
    </section>

    <section className="content-section prose-measure" aria-labelledby="limites">
      <h2 id="limites">Ce que ce registre n’affirme pas</h2>
      <p>{PRODUCT_NAME.fr} n’estime pas le bois marchand, ne prédit pas la propagation des incendies, ne qualifie pas un changement détecté d’exploitation ou de déforestation, ne formule aucune conclusion juridique ou de conformité et ne déduit aucune responsabilité de la proximité.</p>
      <p>La perte forestière détectée est dérivée de l’observation satellitaire. Une réduction du couvert arboré n’établit pas à elle seule l’exploitation, la déforestation, la responsabilité ou la conformité. <Link href="/fr/methodes">Lire les définitions de méthode et de preuve</Link>.</p>
      <p>L’agrégat provincial ci-dessus est un aperçu technique déterministe, limité à quatre provinces, pour {productionAggregatePeriod("fr", "span")}. Les parcelles de perte par cellule sont dessinées sur la carte Explorer pour les mêmes quatre provinces, tracées à partir de la grille de 30 m. Elles sont dessinées, et non comptées : aucun examen par des spécialistes n’a été réalisé, de sorte qu’elles ne satisfont pas au critère formel de la phase 2 et qu’aucun total ne peut en être tiré. <Link href="/fr/donnees">Lire la portée de la version, la provenance et l’attribution de licence</Link>.</p>
      <p><small>Source du contexte : {EXPLORE_PRODUCTION_LAYER.attribution.fr} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Catalogue source</a>.</small></p>
    </section>
  </main></SiteShell>;
}
