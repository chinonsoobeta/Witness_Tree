import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch, ProvinceBar, SiteShell } from "@/components/site";
import { ProvinceRecordList } from "@/components/site/ProvinceRecordList";
import { CumulativeHeadline } from "@/components/site/CumulativeHeadline";
import { RidingsMostLost } from "@/components/site/RidingsMostLost";
import { EvidenceMarks } from "@/components/policy/EvidenceMarks";
import { PRODUCT_NAME } from "@/lib/domain";
import { EXPLORE_PRODUCTION_LAYER, formatUnknownSharePercent, provinceSpanDisplayRows } from "@/lib/explore";
import { provinceSpanReach } from "@/lib/explore/period";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Registre public des pertes forestières", alternates: localizedAlternates("fr", { en: "/en", fr: "/fr" }) };

const SPAN_ROWS = provinceSpanDisplayRows({ fromYear: 1984, toYear: 2022 });

function coverageLabel(row: (typeof SPAN_ROWS)[number]) {
  return `${formatUnknownSharePercent(row.unknownSharePercent, "fr")} de la province n’a pas de données satellitaires\u202F: ${row.unmappedCharacter.fr}`;
}

const UNKNOWN_CONTEXTS = Object.fromEntries(
  SPAN_ROWS.map((row) => [row.id, coverageLabel(row)]),
);

/* Voir la note sur app/en/page.tsx : mêmes trois changements, mêmes retraits. */
export default function FrenchHome() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap">
    <header className="masthead masthead--record">
      <h1>{"Qu’est-il arrivé à la forêt ici\u202F?"}</h1>
      <p className="dek">{PRODUCT_NAME.fr} montre les pertes forestières dans quatre provinces canadiennes, à partir d’images satellites et de registres publics.</p>
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
      <p className="evidence-band-lead">Chaque chiffre de ce site indique le type de preuve qui le soutient.</p>
      <EvidenceMarks locale="fr" />
    </section>

    <section className="content-section landing-coverage" aria-labelledby="registre-actuel">
      <h2 id="registre-actuel">Le registre publié</h2>
      <p className="lead">La superficie forestière que les satellites ont détectée comme perdue dans chaque province, {provinceSpanReach("fr", "from")}.</p>
      <ProvinceRecordList rows={SPAN_ROWS} locale="fr" unknownContexts={UNKNOWN_CONTEXTS} />
      <p><Link href="/fr/methodes#coverage-gap">Pourquoi ces superficies ne sont pas cartographiées et ce que nous en savons</Link></p>
      <p><Link className="btn btn--primary" href="/fr/explorer">Explorer le registre</Link></p>
      <p><small>Le registre ne couvre que ces quatre provinces.</small></p>
    </section>

    <RidingsMostLost locale="fr" />

    <section className="content-section">
      <h2>Consulter le registre</h2>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Comment lire</p><h3>Ce que signifient les marques</h3><p>Chaque chiffre indique son type de preuve, notre degré de certitude et la part cartographiée.</p><Link href="/fr/composants">Voir les marques et les étiquettes</Link></article>
        <article className="record-card"><p className="eyebrow">Méthodes</p><h3>Les définitions avant les chiffres</h3><p>Ce qui compte comme forêt, comment les chiffres sont calculés et quel est notre degré de certitude.</p><Link href="/fr/methodes">Lire les méthodes</Link></article>
        <article className="record-card"><p className="eyebrow">Données</p><h3>Télécharger les chiffres</h3><p>Téléchargez les chiffres provinciaux {provinceSpanReach("fr", "from")}, avec leurs sources et leurs limites.</p><Link href="/fr/donnees">Voir les téléchargements et les sources</Link></article>
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
        <p>Ces chiffres pour {provinceSpanReach("fr", "span")} sont un premier aperçu, et non la version définitive. Les parcelles de perte de la carte Explorer servent à regarder, pas à additionner, et aucun spécialiste ne les a examinées. <Link href="/fr/donnees">Données, sources et licences</Link>.</p>
        <p><small>{"Source du contexte\u202F: "}{EXPLORE_PRODUCTION_LAYER.attribution.fr} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Catalogue source</a>.</small></p>
      </div>
    </section>
  </main></SiteShell>;
}
