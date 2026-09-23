import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch, ProvinceBar, SiteShell } from "@/components/site";
import { ProvinceRecordList } from "@/components/site/ProvinceRecordList";
import { CumulativeHeadline } from "@/components/site/CumulativeHeadline";
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
      <p className="dek">{PRODUCT_NAME.fr} montre les pertes forestières dans quatre provinces canadiennes, à partir d’images satellites et de registres publics. Chaque fait renvoie à sa source.</p>
      <HomeSearch locale="fr" />
      <ProvinceBar locale="fr" />
    </header>

    {/*
      The answer to the question in the h1, immediately under it.
      It carries its own denominator, its own unmapped share, its own
      minimum and its own refusal of the annual sum, so it stays honest
      when it is read alone.
    */}
    <CumulativeHeadline locale="fr" />


    {/* Voir la note sur app/en/page.tsx : une seule liste des quatre marques. */}
    <section className="content-section evidence-band">
      <p className="evidence-band-lead">Chaque lieu a un historique daté des récoltes, des incendies et d’autres changements. Chaque fait indique le type de preuve qui le soutient.</p>
      <EvidenceMarks locale="fr" />
    </section>

    <section className="content-section landing-coverage" aria-labelledby="registre-actuel">
      <h2 id="registre-actuel">Le registre publié</h2>
      <p className="lead">La superficie forestière que les satellites ont détectée comme perdue dans chaque province, {provinceSpanReach("fr", "from")}. Ces chiffres sont provisoires, et chacun indique la part de la province qui n’a pas pu être vérifiée.</p>
      <ProvinceRecordList rows={SPAN_ROWS} locale="fr" unknownContexts={UNKNOWN_CONTEXTS} />
      <p><Link href="/fr/methodes#coverage-gap">Pourquoi ces superficies ne sont pas cartographiées et ce que nous en savons</Link></p>
      <p><Link className="btn btn--primary" href="/fr/explorer">Explorer le registre</Link></p>
      <p><small>D’autres provinces s’ajouteront bientôt.</small></p>
    </section>

    <section className="content-section">
      <h2>Consulter le registre</h2>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Composants</p><h3>Les preuves avant les chiffres</h3><p>Voyez comment chaque chiffre est présenté avec sa source et ce que nous ignorons.</p><Link href="/fr/composants">Ouvrir la galerie de composants</Link></article>
        <article className="record-card"><p className="eyebrow">Méthodes</p><h3>Les définitions avant les chiffres</h3><p>Ce qui compte comme forêt, comment les chiffres sont calculés et quel est notre degré de certitude.</p><Link href="/fr/methodes">Lire les méthodes</Link></article>
        <article className="record-card"><p className="eyebrow">État des données</p><h3>Données provinciales</h3><p>Téléchargez les chiffres provinciaux {provinceSpanReach("fr", "from")}, avec leurs sources et leurs limites.</p><Link href="/fr/donnees">Consulter la transparence des données</Link></article>
      </div>
    </section>

    <section className="content-section limits-block" aria-labelledby="limites">
      <h2 id="limites">Ce que ce registre n’affirme pas</h2>
      <div className="limits-body">
        <ul className="limits-list">
          <li>Qu’une perte soit due à l’exploitation forestière ou à la déforestation.</li>
          <li>Toute conclusion juridique ou de conformité.</li>
          <li>La quantité de bois vendable.</li>
          <li>Qui est responsable, selon qui se trouve à proximité.</li>
          <li>Comment un incendie se propagera.</li>
          <li>Un total complet. La perte détectée est un minimum.</li>
        </ul>
        <p>{PRODUCT_NAME.fr} rapporte seulement ce que ses sources consignent et ce que les images satellites détectent.</p>
        <p>Un satellite peut voir que des arbres ont disparu, mais pas pourquoi. <Link href="/fr/methodes">Comment fonctionnent les méthodes</Link>.</p>
        <p>Les chiffres ci-dessus sont un aperçu technique pour {provinceSpanReach("fr", "span")}, et non la version définitive. Les parcelles de perte de la carte Explorer servent seulement à la visualisation : on ne peut pas les additionner, et aucun spécialiste ne les a examinées. <Link href="/fr/donnees">Données, sources et licences</Link>.</p>
        <p><small>Source du contexte : {EXPLORE_PRODUCTION_LAYER.attribution.fr} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Catalogue source</a>.</small></p>
      </div>
    </section>
  </main></SiteShell>;
}
