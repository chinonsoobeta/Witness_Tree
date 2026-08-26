import { Suspense } from "react";
import { PRODUCT_NAME, type Locale } from "@/lib/domain";
import { LocaleAnchor, LocaleLink } from "./LocaleLink";

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

export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">{locale === "en" ? "Skip to content" : "Passer au contenu"}</a>
      <div className="site-header-inner">
        <a className="wordmark" href={`/${locale}`}>{PRODUCT_NAME[locale]}</a>
        <nav className="global-nav" aria-label={locale === "en" ? "Primary navigation" : "Navigation principale"}>
          {NAV[locale].map(([label, href]) => <a key={href} href={href}>{label}</a>)}
          <Suspense fallback={<LocaleAnchor locale={locale} href={locale === "en" ? "/fr" : "/en"} />}>
            <LocaleLink locale={locale} />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
