import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { PRODUCT_NAME } from "@/lib/domain";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "À propos",
  alternates: localizedAlternates("fr", { en: "/en/about", fr: "/fr/a-propos" }),
};

// A translation of the owner's own words of 2026-10-03.
export default function FrenchAboutPage() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap">
    <header className="masthead"><h1>À propos d’{PRODUCT_NAME.fr}</h1></header>
    <section className="content-section prose-measure">
      <p>Bienvenue sur mon site. Je m’appelle Chinonso Obeta et je suis analyste des politiques à Vancouver, en Colombie-Britannique. Je travaille au bureau provincial des évaluations environnementales. Ce travail et mes opinions ne sont pas approuvés par le gouvernement de la Colombie-Britannique.</p>
      <p>Comme beaucoup d’autres Britanno-Colombiens, j’observe avec inquiétude le déclin continu de notre secteur forestier, où de nombreuses scieries ferment et où des gens perdent leur emploi. Au cours du dernier siècle, ce secteur a fait vivre des collectivités et des villes partout dans la province, et il est pour beaucoup une source d’emploi et de fierté.</p>
      <p>Après avoir appris la fermeture d’une autre scierie cet été, j’ai décidé de chercher à comprendre les raisons du déclin de ce secteur. Je suis parti de deux questions&#8239;: combien d’arbres reste-t-il, et où sont-ils&#8239;? Ce site est une tentative d’y répondre.</p>
      <ul className="about-links">
        <li><a href="https://www.linkedin.com/in/chinonso-obeta" hrefLang="en">Mon profil LinkedIn</a></li>
        <li><a href="https://www.chinonsoobeta.dev" hrefLang="en">Mon site personnel</a></li>
      </ul>
    </section>
  </main></SiteShell>;
}
