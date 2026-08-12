import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site";
import { PRODUCT_NAME } from "@/lib/domain";

export const metadata: Metadata = { title: "Registre public des changements forestiers", alternates: { languages: { en: "/en", fr: "/fr" } } };

export default function FrenchHome() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap">
    <header className="masthead">
      <p className="eyebrow">Registre de preuves · 1984 à aujourd’hui</p>
      <h1>Qu’est-il arrivé à la forêt ici?</h1>
      <p className="dek">{PRODUCT_NAME.fr} aide à comprendre les changements forestiers consignés et observés dans quatre provinces. Chaque résultat indique ce que montrent les preuves, leur provenance, leur actualité et ce qu’elles ne permettent pas d’établir.</p>
      <div className="meta-row"><span>Colombie-Britannique</span><span>Alberta</span><span>Ontario</span><span>Québec</span></div>
    </header>
    <section className="content-section prose-measure">
      <div className="section-heading"><span className="num">01</span><h2>Un registre, pas un tableau de bord</h2></div>
      <p className="lead">Cherchez un lieu ou ouvrez un dossier. Consultez l’historique daté des récoltes consignées, des incendies, des perturbations et des changements observés par satellite—avec la source jointe à chaque affirmation.</p>
      <dl className="principles">
        <div className="principle"><dt>Registre officiel</dt><dd>Une autorité publique consigne un événement, un périmètre, une intervention ou un rôle désigné.</dd></div>
        <div className="principle"><dt>Observation satellitaire</dt><dd>Les images montrent une réduction du couvert arboré ou une reprise ultérieure du couvert. À elles seules, elles n’en établissent pas la cause.</dd></div>
        <div className="principle"><dt>Estimation dérivée</dt><dd>Un calcul fondé sur des registres documentés et une méthode publiée.</dd></div>
        <div className="principle"><dt>Inconnu</dt><dd>Aucun registre public faisant autorité n’a été intégré pour la question. Une absence dans ce registre n’est pas une affirmation sur ce qui s’est produit dans le monde.</dd></div>
      </dl>
    </section>
    <section className="content-section">
      <div className="section-heading"><span className="num">02</span><h2>Consulter le registre</h2></div>
      <div className="record-grid">
        <article className="record-card"><p className="eyebrow">Composants</p><h3>Les preuves avant les chiffres</h3><p>Examinez la présentation des valeurs, des inconnues, de la confiance, de la couverture et de la provenance dans le registre public.</p><Link href="/fr/composants">Ouvrir la galerie de composants</Link></article>
        <article className="record-card"><p className="eyebrow">Méthodes</p><h3>Les définitions avant les chiffres</h3><p>Consultez le dénominateur forestier, les catégories de preuves, les règles de confiance, les niveaux de couverture et la méthode d’appariement.</p><Link href="/fr/methodes">Lire les méthodes</Link></article>
        <article className="record-card"><p className="eyebrow">État des données</p><h3>Sources illustratives seulement</h3><p>Aucun jeu de données de production n’est encore intégré. Consultez le contrat strict du registre des sources et les conditions à remplir avant publication.</p><Link href="/fr/donnees">Consulter la transparence des données</Link></article>
      </div>
      <aside className="notice"><h3>Ce que ce registre n’affirme pas</h3><p>{PRODUCT_NAME.fr} n’estime pas le bois marchand, ne prédit pas la propagation des incendies, ne qualifie pas un changement détecté d’exploitation ou de déforestation, ne formule aucune conclusion juridique ou de conformité et ne déduit aucune responsabilité de la proximité.</p></aside>
    </section>
  </main></SiteShell>;
}
