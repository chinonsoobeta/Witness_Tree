"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PRODUCT_NAME, type Locale } from "@/lib/domain";
import { localeHref } from "@/lib/locale-navigation";

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
  const pathname = usePathname();
  const alternate = localeHref(pathname, useSearchParams(), locale);
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">{locale === "en" ? "Skip to content" : "Passer au contenu"}</a>
      <div className="site-header-inner">
        <Link className="wordmark" href={`/${locale}`}>{PRODUCT_NAME[locale]}</Link>
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
