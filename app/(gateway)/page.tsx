/// <reference types="vite/client" />
import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_PURPOSE } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore";
import { gatewayAlternates } from "@/lib/site-metadata";

/* eslint-disable @next/next/no-html-link-for-pages -- Vinext client links throw before gateway navigation in Sites. */

// Each photograph is named by where it was taken, read from the file's own
// capture metadata. No location is stated for a photograph that carries none.
const GATE_PHOTOGRAPHS = [
  { file: "forest.jpg", location: "Lillooet, British Columbia" },
  { file: "forest-2.jpg", location: "Shannon Falls Provincial Park, British Columbia" },
  { file: "forest-3.jpg", location: "McKinley Landing, Kelowna, British Columbia" },
  { file: "forest-4.jpg", location: "Stanley Park, Vancouver, British Columbia" },
] as const;

// Resolve owner-supplied photographs at build time. An absent set renders only
// the ground, and a partial set remains a static photograph without empty frames.
const availablePhotographs = import.meta.glob("../../public/gate/forest*.jpg", { eager: true, query: "?url", import: "default" });
const photographs = "../../public/gate/forest.jpg" in availablePhotographs
  ? ["forest.jpg", "forest-2.jpg", "forest-3.jpg", "forest-4.jpg"].filter((name) => `../../public/gate/${name}` in availablePhotographs)
  : [];
const slideshow = photographs.length === 4;
const shown = photographs.slice(0, slideshow ? 4 : 1);
const locations = shown.map((name) => GATE_PHOTOGRAPHS.find((photo) => photo.file === name)?.location ?? "");

export const metadata: Metadata = {
  title: PRODUCT_NAME.en,
  description: `Choose English or French to enter the public forest-loss record for ${EXPLORE_COVERAGE_PERIOD.en}.`,
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
        <nav aria-label="Choose a language" className="language-choices">
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
      <p className="gateway-location" aria-label="Where these photographs were taken">
        {locations.map((location) => <span className="gateway-location-name" key={location}>{location}</span>)}
      </p>
    </main>
  );
}
