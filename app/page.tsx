import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Witness Tree",
  description: "Choose English or French to enter the public forest-change record.",
};

export default function Home() {
  return (
    <main className="language-gateway">
      <p className="eyebrow">Public forest-change record · Registre public des changements forestiers</p>
      <h1>Witness Tree</h1>
      <p className="gateway-lead">
        Evidence about recorded and observed forest change in four Canadian provinces, from 1984 to the present.
      </p>
      <nav aria-label="Choose a language" className="language-choices">
        <Link className="primary-link" href="/en">Continue in English</Link>
        <Link className="primary-link" href="/fr" lang="fr">Continuer en français</Link>
      </nav>
    </main>
  );
}
