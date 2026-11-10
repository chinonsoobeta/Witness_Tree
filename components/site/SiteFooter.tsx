import type { Locale } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore";
import { ThemeToggle } from "./ThemeToggle";

/*
 * The pages the header does not carry, in two short named groups. About moved
 * to the header; Releases, Decisions, Engagement and Privacy were retired from
 * the public site on 2026-10-03. Account left the footer on 2026-11-10 (K1):
 * accounts are not active, so a link to it promised a service that does not
 * run. The page stays at its address for anyone who has it. Methods
 * leads "The record" since 2026-11-10 (L5): it is the way in to the glossary,
 * how figures are marked and what the record cannot see.
 */
const GROUPS = {
  en: [
    ["The record", [["Methods", "/en/methods"], ["Glossary", "/en/glossary"], ["Corrections", "/en/corrections"]]],
    ["Your use", [["Terms", "/en/terms"]]],
  ],
  fr: [
    ["Le registre", [["Méthodes", "/fr/methodes"], ["Glossaire", "/fr/glossaire"], ["Corrections", "/fr/corrections"]]],
    ["Votre utilisation", [["Conditions", "/fr/conditions"]]],
  ],
} as const;

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        {/*
          The colour-theme control sits here, under the coverage line, since
          2026-11-10 (L3): in the header it took the room of three menu items.
          Every page that has the header has this footer (SiteShell), so it is
          on every page, and it is reached by Tab after the page's content.
          It is outside the nav, because it is a setting, not a link.
        */}
        <div className="footer-meta">
          <p className="footer-coverage">{EXPLORE_COVERAGE_PERIOD.compact} · BC · AB · ON · QC</p>
          <ThemeToggle locale={locale} />
        </div>
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
