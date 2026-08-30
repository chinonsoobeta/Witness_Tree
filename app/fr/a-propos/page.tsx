import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { PRODUCT_NAME } from "@/lib/domain";

export const metadata: Metadata = {
  title: "À propos",
  alternates: { languages: { en: "/en/about", fr: "/fr/a-propos" } },
};

export default function FrenchAboutPage() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap">
    <header className="masthead"><h1>À propos d’{PRODUCT_NAME.fr}</h1></header>
    <section className="content-section prose-measure">
      <h2>Texte du propriétaire à venir</h2>
      <p>Cet espace est réservé à la présentation par le propriétaire d’{PRODUCT_NAME.fr}, de son objectif et de son intendance. Aucune déclaration du propriétaire n’a été fournie pour publication.</p>
      <p>Pour la portée publiée et les limites des preuves, consultez <a href="/fr/methodes">Méthodes</a> et <a href="/fr/donnees">Données et transparence</a>.</p>
    </section>
  </main></SiteShell>;
}
