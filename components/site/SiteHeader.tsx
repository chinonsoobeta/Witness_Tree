import { Suspense } from "react";
import { PRODUCT_NAME, type Locale } from "@/lib/domain";
import { LocaleAnchor, LocaleLink } from "./LocaleLink";
import { ThemeToggle } from "./ThemeToggle";

const NAV = {
  en: [
    ["Explore", "/en/explore"],
    ["Compare", "/en/compare"],
    ["Wildfire", "/en/wildfire"],
    ["Account", "/en/account"],
    ["Methods", "/en/methods"],
    ["Data", "/en/data"],
    ["Search", "/en/search"],
  ],
  fr: [
    ["Explorer", "/fr/explorer"],
    ["Comparer", "/fr/comparer"],
    ["Incendies", "/fr/incendies"],
    ["Compte", "/fr/compte"],
    ["Méthodes", "/fr/methodes"],
    ["Données", "/fr/donnees"],
    ["Recherche", "/fr/recherche"],
  ],
} as const;

/**
 * The one new string this phase introduces, kept bilingual like every other label in the file.
 * It is the summary's visible text and therefore also its accessible name, so the visible label
 * and the name cannot drift apart (WCAG 2.5.3).
 */
const MENU = { en: "Menu", fr: "Menu" } as const;

export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">{locale === "en" ? "Skip to content" : "Passer au contenu"}</a>
      <div className="site-header-inner">
        <a className="wordmark" href={`/${locale}`}>{PRODUCT_NAME[locale]}</a>
        <nav className="global-nav" aria-label={locale === "en" ? "Primary navigation" : "Navigation principale"}>
          {/*
            A real disclosure, not a horizontally scrolled row. <details> needs no JavaScript, so
            the shared client bundle is untouched and the header stays a server component. Above
            the nav breakpoint the summary is hidden and the panel is forced open by CSS, so the
            same single list of links serves both layouts and nothing is duplicated in the DOM.
          */}
          <details className="nav-disclosure">
            <summary className="nav-toggle">{MENU[locale]}</summary>
            <div className="nav-panel">
              {NAV[locale].map(([label, href]) => <a key={href} href={href}>{label}</a>)}
              {/*
                The colour-theme control lives in the same panel as the links, so one
                node serves both layouts: below the nav breakpoint it is a labelled row
                inside the menu, and above it the panel is forced open as an inline row
                and the control sits at its end. Putting it in the header bar instead
                would have overflowed the pill on a narrow screen.
              */}
              <ThemeToggle locale={locale} />
            </div>
          </details>
          <Suspense fallback={<LocaleAnchor locale={locale} href={locale === "en" ? "/fr" : "/en"} />}>
            <LocaleLink locale={locale} />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
