import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch, ProvinceBar, SiteShell } from "@/components/site";
import { ProvinceRecordList } from "@/components/site/ProvinceRecordList";
import { CumulativeHeadline } from "@/components/site/CumulativeHeadline";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceMarks } from "@/components/policy/EvidenceMarks";
import { PRODUCT_NAME } from "@/lib/domain";
import { EXPLORE_PRODUCTION_LAYER, formatUnknownSharePercent, provinceSpanMeasurements } from "@/lib/explore";
import { provinceSpanReach } from "@/lib/explore/period";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Registre public des pertes forestières", alternates: localizedAlternates("fr", { en: "/en", fr: "/fr" }) };

const SPAN_ROWS = provinceSpanMeasurements({ fromYear: 1984, toYear: 2022 });

function coverageLabel(row: (typeof SPAN_ROWS)[number]) {
  return `${formatUnknownSharePercent(row.unknownSharePercent, "fr")} de la superficie provinciale n’a pas été cartographiée par la source; ${row.unmappedCharacter.fr}`;
}

const UNKNOWN_CONTEXTS = Object.fromEntries(
  SPAN_ROWS.map((row) => [row.id, coverageLabel(row)]),
);

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

    {/*
      The answer to the question in the h1, immediately under it.
      It carries its own denominator, its own unmapped share and its own
      refusal of the annual sum, so it does not lean on the standing
      coverage banner below it to stay honest when it is read alone.
    */}
    <CumulativeHeadline locale="fr" />

    <CoverageStatement locale="fr"><p>La perte détectée est un minimum de la zone cartographiée dans quatre provinces. Les superficies non cartographiées par la source restent inconnues, même là où la perte détectée est faible. Une absence dans ce registre n’est pas une affirmation sur ce qui s’est produit dans le monde.</p></CoverageStatement>

    {/* Voir la note sur app/en/page.tsx : une seule liste des quatre marques. */}
    <section className="content-section evidence-band">
      <p className="evidence-band-lead">Ouvrez un dossier et consultez l’historique daté des récoltes consignées, des incendies, des perturbations et des changements détectés par satellite. Chaque affirmation porte la catégorie de preuve qui la soutient.</p>
      <EvidenceMarks locale="fr" />
    </section>

    <section className="content-section landing-coverage" aria-labelledby="registre-actuel">
      <h2 id="registre-actuel">Le registre publié</h2>
      <p className="lead">L’agrégat provincial provisoire et limité {provinceSpanReach("fr", "from")} présente la perte forestière détectée avec un état de couverture pour chaque province. La vérification de l’étendue cartographiée pour chacune des années est terminée, et ses résultats déterminent le classement des superficies non cartographiées.</p>
      <ProvinceRecordList rows={SPAN_ROWS} locale="fr" unknownContexts={UNKNOWN_CONTEXTS} />
      <p><Link href="/fr/methodes#coverage-gap">Pourquoi ces superficies ne sont pas cartographiées et ce que nous en savons</Link></p>
      <p><Link className="btn btn--primary" href="/fr/explorer">Explorer le registre</Link></p>
      <p><small>D’autres provinces s’ajouteront bientôt.</small></p>
    </section>

    <section className="content-section">
      <h2>Consulter le registre</h2>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Composants</p><h3>Les preuves avant les chiffres</h3><p>Examinez la présentation des valeurs, des inconnues, de la confiance, de la couverture et de la provenance dans le registre public.</p><Link href="/fr/composants">Ouvrir la galerie de composants</Link></article>
        <article className="record-card"><p className="eyebrow">Méthodes</p><h3>Les définitions avant les chiffres</h3><p>Consultez le dénominateur forestier, les catégories de preuves, les règles de confiance, les niveaux de couverture et la méthode d’appariement.</p><Link href="/fr/methodes">Lire les méthodes</Link></article>
        <article className="record-card"><p className="eyebrow">État des données</p><h3>Version provinciale limitée</h3><p>L’agrégat provincial {provinceSpanReach("fr", "from")} est publié avec sa source, son état de couverture et ses limites.</p><Link href="/fr/donnees">Consulter la transparence des données</Link></article>
      </div>
    </section>

    <section className="content-section limits-block" aria-labelledby="limites">
      <h2 id="limites">Ce que ce registre n’affirme pas</h2>
      <div className="limits-body">
        <ul className="limits-list">
          <li>Qu’un changement détecté soit une exploitation forestière ou une déforestation.</li>
          <li>Toute conclusion juridique ou de conformité.</li>
          <li>Une estimation du bois marchand.</li>
          <li>Une responsabilité déduite de la proximité.</li>
          <li>Une affirmation sur la propagation des incendies.</li>
          <li>Un total. La perte détectée est un plancher, pas une somme.</li>
        </ul>
        <p>{PRODUCT_NAME.fr} rapporte ce que ses sources consignent et ce que ses images détectent, et rien de plus.</p>
        <p>La perte forestière détectée est dérivée de l’observation satellitaire. Une réduction du couvert arboré n’établit pas à elle seule l’exploitation, la déforestation, la responsabilité ou la conformité. <Link href="/fr/methodes">Lire les définitions de méthode et de preuve</Link>.</p>
        <p>L’agrégat provincial ci-dessus est un aperçu technique déterministe, limité à quatre provinces, pour {provinceSpanReach("fr", "span")}. Les parcelles de perte par cellule sont dessinées sur la carte Explorer pour les mêmes quatre provinces, tracées à partir de la grille de 30 m. Elles sont dessinées, et non comptées : aucun examen par des spécialistes n’a été réalisé, de sorte qu’elles ne satisfont pas au critère formel de la phase 2 et qu’aucun total ne peut en être tiré. <Link href="/fr/donnees">Lire la portée de la version, la provenance et l’attribution de licence</Link>.</p>
        <p><small>Source du contexte : {EXPLORE_PRODUCTION_LAYER.attribution.fr} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Catalogue source</a>.</small></p>
      </div>
    </section>
  </main></SiteShell>;
}
