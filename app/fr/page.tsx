import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch, ProvinceBar, SiteShell } from "@/components/site";
import { ProvinceRecordList } from "@/components/site/ProvinceRecordList";
import { CumulativeHeadline } from "@/components/site/CumulativeHeadline";
import { RecoveryAnswer } from "@/components/site/RecoveryAnswer";
import { PRODUCT_NAME } from "@/lib/domain";
import { HARVEST_FIRE_ROUTES } from "@/lib/harvest-fire";
import { EXPLORE_PRODUCTION_LAYER, provinceSpanDisplayRows } from "@/lib/explore";
import { provinceSpanReach } from "@/lib/explore/period";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("fr", { en: "/en", fr: "/fr" });

const SPAN_ROWS = provinceSpanDisplayRows({ fromYear: 1984, toYear: 2022 });

/* Voir la note sur app/en/page.tsx : mêmes sections, mêmes liens. */
export default function FrenchHome() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap">
    <header className="masthead masthead--record">
      <h1>{"Qu’est-il arrivé à la forêt ici ?"}</h1>
      <p className="dek">{PRODUCT_NAME.fr} montre les pertes forestières en Colombie-Britannique, en Alberta, en Ontario et au Québec de 1984 à 2022, à partir d’images satellitaires et de registres publics.</p>
      <p className="masthead-note"><Link href="/fr/explorer">Explorer la carte</Link></p>
      <HomeSearch locale="fr" />
      <ProvinceBar locale="fr" />
    </header>

    {/*
      The answer to the question in the h1, immediately under it.
      It carries its own denominator, its own unmapped share and its own
      minimum, so it stays honest when it is read alone.
    */}
    <CumulativeHeadline locale="fr" />

    <section className="content-section home-provinces" aria-labelledby="registre-actuel">
      <h2 id="registre-actuel">Par province, {provinceSpanReach("fr")}</h2>
      <ProvinceRecordList rows={SPAN_ROWS} locale="fr" labelledBy="registre-actuel" />
      <p className="home-provinces-more">
        <Link href="/fr/explorer?from=1984&year=2022">Voir les quatre provinces sur la carte, {provinceSpanReach("fr")}</Link>
        {" · "}
        <Link href="/fr/inconnu">Ce que le registre ne peut pas voir</Link>
      </p>
      <p><small>Le registre ne couvre que ces quatre provinces.</small></p>
    </section>

    <nav className="content-section home-doors" aria-labelledby="home-doors">
      <h2 id="home-doors" className="sr-only">Où aller ensuite</h2>
      <div className="record-grid">
        <article className="record-card"><h3>La carte</h3><p>Les pertes forestières dans les quatre provinces, année par année.</p><Link href="/fr/explorer">Explorer la carte</Link></article>
        {/* The id keeps Explore's old link to the home rankings landing on their way in. */}
        <article className="record-card" id="ridings-most-lost"><h3>Circonscriptions et villes</h3><p>Comparez deux lieux, ou voyez lesquels ont perdu le plus de forêt.</p><Link href="/fr/comparer?rank=cities#rankings">Comparer les circonscriptions et les villes</Link></article>
        <article className="record-card"><h3>Récolté ou brûlé</h3><p>Ce qui a été récolté et ce qui a brûlé, par province et par année.</p><Link href={HARVEST_FIRE_ROUTES.fr}>Voir la récolte et les feux</Link></article>
      </div>
    </nav>

    <section className="content-section home-more" aria-label="Autres pages du registre">
      <RecoveryAnswer locale="fr" />
      <p>Les chiffres officiels de récolte, les volumes de bois et tous les téléchargements se trouvent sur la page <Link href="/fr/donnees">Données</Link>.</p>
    </section>

    <section className="content-section home-caveat" aria-labelledby="limites">
      <h2 id="limites" className="sr-only">Ce que ce site n’affirme pas</h2>
      <p>Un satellite peut voir que des arbres ont disparu, mais pas pourquoi, et la perte détectée est un minimum. Ces chiffres portent sur la période {provinceSpanReach("fr", "from")}. <Link href="/fr/methodes#limits">Ce que ce site n’affirme pas et comment fonctionnent les méthodes</Link></p>
      <p><small>{"Source du contexte : "}{EXPLORE_PRODUCTION_LAYER.attribution.fr} <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>Catalogue source</a>.</small></p>
    </section>
  </main></SiteShell>;
}
