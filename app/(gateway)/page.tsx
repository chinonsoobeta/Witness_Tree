import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore";
import { gatewayAlternates } from "@/lib/site-metadata";

/* eslint-disable @next/next/no-html-link-for-pages -- Vinext client links throw before gateway navigation in Sites. */

export const metadata: Metadata = {
  title: PRODUCT_NAME.en,
  description: "Choose English or French to enter the public forest-loss record.",
  alternates: gatewayAlternates,
};

export default function Home() {
  return (
    <main className="language-gateway blob-ground">
      {/* Decoration only, and clipped by .blob-ground so a narrow viewport gains no scrollbar. */}
      <div className="blob blob--1" aria-hidden="true" />
      <div className="blob blob--2" aria-hidden="true" />
      <p className="eyebrow">Public forest-loss record · Registre public des pertes forestières</p>
      <h1>{PRODUCT_NAME.en}</h1>
      <p className="gateway-lead">
        Evidence about recorded and detected forest loss in four Canadian provinces, from {EXPLORE_COVERAGE_PERIOD.en}.
      </p>
      <nav aria-label="Choose a language" className="language-choices">
        <a className="btn btn--primary" href="/en">Continue in English</a>
        <a className="btn btn--outline" href="/fr" lang="fr">Continuer en français</a>
      </nav>
    </main>
  );
}
