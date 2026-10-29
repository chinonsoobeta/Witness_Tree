import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site";
import { PRODUCT_NAME } from "@/lib/domain";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("fr", { en: "/en/about", fr: "/fr/a-propos" });

// A translation of the owner's own words of 2026-10-03, with the closing
// paragraph reframed on 2026-10-28 as in English. A draft awaiting his review.
export default function FrenchAboutPage() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap">
    <header className="masthead"><h1>À propos d’{PRODUCT_NAME.fr}</h1></header>
    <section className="content-section prose-measure">
      <p>Bienvenue sur mon site. Je m’appelle Chinonso Obeta et je suis analyste des politiques à Vancouver, en Colombie-Britannique. Je travaille au bureau provincial d’évaluation environnementale. Ce travail et mes opinions ne sont pas approuvés par le gouvernement de la Colombie-Britannique.</p>
      <p>Comme beaucoup d’autres Britanno-Colombiens, j’observe avec inquiétude le déclin continu de notre secteur forestier, où de nombreuses scieries ferment et où des gens perdent leur emploi. Au cours du dernier siècle, ce secteur a fait vivre des collectivités et des villes partout dans la province, et il est pour beaucoup une source d’emploi et de fierté.</p>
      <p>Après avoir appris la fermeture d’une autre scierie cet été, j’ai décidé de chercher à comprendre les raisons du déclin de ce secteur. Ce site rassemble ce que les registres publics peuvent montrer sur la forêt de la Colombie-Britannique, de l’Alberta, de l’Ontario et du Québec{"\u202F"}:</p>
      <ul>
        <li>La superficie forestière que les satellites ont détectée comme perdue, et où. <Link href="/fr/explorer">Explorer la carte</Link> ou <Link href="/fr/recherche">chercher un lieu</Link>.</li>
        <li>Si les arbres ont repoussé après la perte. <Link href="/fr/explorer?mode=condition-recovery">Voir l’état et le rétablissement</Link>.</li>
        <li>Ce qui a été récolté et ce qui a brûlé, province par province. <Link href="/fr/donnees/recolte-et-incendies">Voir la récolte et les feux par province</Link>.</li>
        <li>Le volume de bois récolté chaque année, à côté du volume que chaque province permettait de couper{"\u202F"}: <Link href="/fr/donnees/volume-recolte-bc">Colombie-Britannique</Link>{"\u202F"}; <Link href="/fr/donnees/volume-recolte-provinces">Alberta, Ontario et Québec</Link>.</li>
      </ul>
      <p>Ce site n’estime pas combien d’arbres il reste ni combien de bois pourrait encore être coupé, car les images satellitaires montrent où la forêt a été perdue, et non le volume de bois sur pied. <Link href="/fr/methodes">Lire comment le registre est construit</Link>.</p>
      <ul className="about-links">
        <li><a href="https://www.linkedin.com/in/chinonso-obeta" hrefLang="en">Mon profil LinkedIn</a></li>
        <li><a href="https://www.chinonsoobeta.dev" hrefLang="en">Mon site personnel</a></li>
      </ul>
    </section>
  </main></SiteShell>;
}
