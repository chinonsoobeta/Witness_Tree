import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_PURPOSE } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore";
import { gatewayAlternates, siteMetadata } from "@/lib/site-metadata";

/* eslint-disable @next/next/no-html-link-for-pages -- The gateway navigates between separate locale root layouts. */

// Each photograph is named by where it was taken, read from the file's own
// capture metadata, in both languages. No location is stated for a photograph
// that carries none.
const GATE_PHOTOGRAPHS = [
  { file: "forest.jpg", location: { en: "Shannon Falls Provincial Park, British Columbia", fr: "Parc provincial Shannon Falls, Colombie-Britannique" } },
  { file: "forest-2.jpg", location: { en: "Lillooet, British Columbia", fr: "Lillooet, Colombie-Britannique" } },
  { file: "forest-3.jpg", location: { en: "McKinley Landing, Kelowna, British Columbia", fr: "McKinley Landing, Kelowna, Colombie-Britannique" } },
  { file: "forest-4.jpg", location: { en: "Stanley Park, Vancouver, British Columbia", fr: "Parc Stanley, Vancouver, Colombie-Britannique" } },
] as const;

// Resolve owner-supplied photographs at build time. An absent set renders only
// the ground, and a partial set remains a static photograph without empty frames.
const photographs = existsSync(join(process.cwd(), "public/gate/forest.jpg"))
  ? GATE_PHOTOGRAPHS.map(({ file }) => file).filter((name) => existsSync(join(process.cwd(), "public/gate", name)))
  : [];
const slideshow = photographs.length === 4;
const shown = photographs.slice(0, slideshow ? 4 : 1);
const locations = shown.flatMap((name) => GATE_PHOTOGRAPHS.find((photo) => photo.file === name)?.location ?? []);

// The gateway is in both languages, so its title and description are too.
const TITLE = `${PRODUCT_NAME.en} / ${PRODUCT_NAME.fr}`;
const DESCRIPTION = `Choose English or French to enter the public forest-loss record for ${EXPLORE_COVERAGE_PERIOD.en}. / Choisissez l’anglais ou le français pour entrer dans le registre public des pertes forestières de ${EXPLORE_COVERAGE_PERIOD.fr}.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { ...siteMetadata.openGraph, title: TITLE, description: DESCRIPTION },
  twitter: { ...siteMetadata.twitter, title: TITLE, description: DESCRIPTION },
  alternates: gatewayAlternates,
};

export default function Home() {
  return (
    <main className={`language-gateway${slideshow ? " gateway-slideshow" : ""}`}>
      {/* Decorative owner photographs; the ground remains when the files are absent. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- A static decorative asset needs no image service. */}
      {shown.map((name) => <img key={name} className="gateway-photo" src={`/gate/${name}`} alt="" role="presentation" />)}
      <div className="gateway-scrim" aria-hidden="true" />
      <div className="gateway-panel">
        <div className="gateway-intro">
          <h1 className="gateway-welcome">
            <span>Welcome to {PRODUCT_NAME.en}</span>
            <span aria-hidden="true"> | </span>
            <span lang="fr">Bienvenue à l’{PRODUCT_NAME.fr}</span>
          </h1>
          <p className="gateway-lead">{PRODUCT_PURPOSE.en}</p>
          <div className="gateway-rule" aria-hidden="true" />
          <p className="gateway-lead" lang="fr">{PRODUCT_PURPOSE.fr}</p>
        </div>
        <nav aria-label="Choose a language / Choisir une langue" className="language-choices">
          <a className="gateway-choice gateway-choice--en" href="/en">
            <span className="gateway-choice-name">English</span>
            <span className="gateway-choice-sub">Continue in English →</span>
          </a>
          <a className="gateway-choice gateway-choice--fr" href="/fr" lang="fr">
            <span className="gateway-choice-name">Français</span>
            <span className="gateway-choice-sub">Continuer en français →</span>
          </a>
        </nav>
      </div>
      <p className="gateway-location" aria-label="Where these photographs were taken / Où ces photos ont été prises">
        {locations.map((location) => (
          <span className="gateway-location-name" key={location.en}>
            <span>{location.en}</span>{" "}
            <span lang="fr">{location.fr}</span>
          </span>
        ))}
      </p>
    </main>
  );
}
