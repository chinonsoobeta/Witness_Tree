import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore";

export const metadata: Metadata = {
  title: PRODUCT_NAME.en,
  description: "Choose English or French to enter the public forest-change record.",
};

export default function Home() {
  return (
    <main className="language-gateway blob-ground">
      {/* Decoration only, and clipped by .blob-ground so a narrow viewport gains no scrollbar. */}
      <div className="blob blob--1" aria-hidden="true" />
      <div className="blob blob--2" aria-hidden="true" />
      <p className="eyebrow">Public forest-change record · Registre public des changements forestiers</p>
      <h1>{PRODUCT_NAME.en}</h1>
      <p className="gateway-lead">
        Evidence about recorded and observed forest change in four Canadian provinces, from {EXPLORE_COVERAGE_PERIOD.en}.
      </p>
      <nav aria-label="Choose a language" className="language-choices">
        <Link className="btn btn--primary" href="/en">Continue in English</Link>
        <Link className="btn btn--outline" href="/fr" lang="fr">Continuer en français</Link>
      </nav>
    </main>
  );
}
