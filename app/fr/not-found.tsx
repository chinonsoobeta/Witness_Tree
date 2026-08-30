import Link from "next/link";
import { SiteShell } from "@/components/site";

export default function NotFound() {
  return (
    <SiteShell locale="fr">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <p className="eyebrow">404</p>
          <h1>Page introuvable</h1>
          <p className="dek">Cette adresse ne fait pas partie du registre public des changements forestiers.</p>
        </header>
        <nav className="content-section prose-measure" aria-label="Poursuivre à partir de cette page">
          <ul className="link-list">
            <li className="card card--lift"><Link href="/fr/explorer">Explorer les changements forestiers</Link></li>
            <li className="card card--lift"><Link href="/fr/recherche">Rechercher dans le registre</Link></li>
            <li className="card card--lift"><Link href="/fr">Retourner à l’accueil</Link></li>
          </ul>
        </nav>
      </main>
    </SiteShell>
  );
}
