import Link from "next/link";
import type { Locale } from "@/lib/domain";

const NAV = {
  en: [
    ["Compare", "/en/compare"],
    ["Wildfire", "/en/wildfire"],
    ["Methods", "/en/methods"],
    ["Data", "/en/data"],
  ],
  fr: [
    ["Comparer", "/fr/comparer"],
    ["Incendies", "/fr/incendies"],
    ["Méthodes", "/fr/methodes"],
    ["Données", "/fr/donnees"],
  ],
} as const;

export function SiteHeader({ locale }: { locale: Locale }) {
  const alternate = locale === "en" ? "/fr" : "/en";
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">{locale === "en" ? "Skip to content" : "Passer au contenu"}</a>
      <div className="site-header-inner">
        <Link className="wordmark" href={`/${locale}`}>Witness Tree</Link>
        <nav className="global-nav" aria-label={locale === "en" ? "Primary navigation" : "Navigation principale"}>
          {NAV[locale].map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
          <Link className="locale-link" href={alternate} hrefLang={locale === "en" ? "fr" : "en"}>
            {locale === "en" ? "Français" : "English"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
