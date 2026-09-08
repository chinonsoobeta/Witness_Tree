/// <reference types="vite/client" />
import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore";
import { gatewayAlternates } from "@/lib/site-metadata";

/* eslint-disable @next/next/no-html-link-for-pages -- Vinext client links throw before gateway navigation in Sites. */

// Resolve owner-supplied photographs at build time. An absent set renders only
// the ground, and a partial set remains a static photograph without empty frames.
const availablePhotographs = import.meta.glob("../../public/gate/forest*.jpg", { eager: true, query: "?url", import: "default" });
const photographs = "../../public/gate/forest.jpg" in availablePhotographs
  ? ["forest.jpg", "forest-2.jpg", "forest-3.jpg", "forest-4.jpg"].filter((name) => `../../public/gate/${name}` in availablePhotographs)
  : [];
const slideshow = photographs.length === 4;

export const metadata: Metadata = {
  title: PRODUCT_NAME.en,
  description: `Choose English or French to enter the public forest-loss record for ${EXPLORE_COVERAGE_PERIOD.en}.`,
  alternates: gatewayAlternates,
};

export default function Home() {
  return (
    <main className={`language-gateway${slideshow ? " gateway-slideshow" : ""}`}>
      {/* Decorative owner photograph; the ground remains when the file is absent. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- A static decorative asset needs no image service. */}
      {photographs.slice(0, slideshow ? 4 : 1).map((name) => <img key={name} className="gateway-photo" src={`/gate/${name}`} alt="" role="presentation" />)}
      <p className="eyebrow">Public forest-loss record · Registre public des pertes forestières</p>
      <h1>{PRODUCT_NAME.en}</h1>
      <p className="gateway-lead">
        Choose your language. <span lang="fr">Choisissez votre langue.</span>
      </p>
      <nav aria-label="Choose a language" className="language-choices">
        <a className="btn btn--primary" href="/en">Continue in English</a>
        <a className="btn btn--outline" href="/fr" lang="fr">Continuer en français</a>
      </nav>
    </main>
  );
}
