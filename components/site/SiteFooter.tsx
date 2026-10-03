import type { Locale } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore";

/*
 * The pages the header does not carry, in two short named groups. About moved
 * to the header; Releases, Decisions, Engagement and Privacy were retired from
 * the public site on 2026-10-03.
 */
const GROUPS = {
  en: [
    ["The record", [["Corrections", "/en/corrections"], ["Glossary", "/en/glossary"]]],
    ["Your use", [["Account", "/en/account"], ["Terms", "/en/terms"]]],
  ],
  fr: [
    ["Le registre", [["Corrections", "/fr/corrections"], ["Glossaire", "/fr/glossaire"]]],
    ["Votre utilisation", [["Compte", "/fr/compte"], ["Conditions", "/fr/conditions"]]],
  ],
} as const;

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="footer-coverage">{EXPLORE_COVERAGE_PERIOD.compact} · BC · AB · ON · QC</p>
        <nav className="footer-nav" aria-label={locale === "en" ? "More pages" : "Autres pages"}>
          {GROUPS[locale].map(([group, links]) => (
            <div className="footer-group" key={group}>
              <p className="footer-group-label">{group}</p>
              <ul aria-label={group}>
                {links.map(([label, href]) => <li key={href}><a href={href}>{label}</a></li>)}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
