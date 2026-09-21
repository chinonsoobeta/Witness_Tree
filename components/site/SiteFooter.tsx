import type { Locale } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore";

/*
 * Eleven links in one undifferentiated run is a list a reader scans to the
 * third item and abandons, and it is how About and Account, which are in no
 * other navigation on the site, came to sit between Glossary and Privacy
 * with nothing to say they are different kinds of destination.
 *
 * The links are grouped rather than cut. Cutting is the tempting move and it
 * is the wrong one here: the header carries four items and none of them is
 * About, Account, Privacy, Terms, Glossary, Corrections, Decisions,
 * Engagement or Releases, so a link dropped from this footer is a page with
 * no route to it at all. Three short named columns is the simplification
 * this list can actually take.
 */
const GROUPS = {
  en: [
    ["The record", [["Data", "/en/data"], ["Methods", "/en/methods"], ["Releases", "/en/releases"], ["Corrections", "/en/corrections"], ["Glossary", "/en/glossary"]]],
    ["Governance", [["About", "/en/about"], ["Decisions", "/en/decisions"], ["Engagement", "/en/engagement"]]],
    ["Your use", [["Account", "/en/account"], ["Privacy", "/en/privacy"], ["Terms", "/en/terms"]]],
  ],
  fr: [
    ["Le registre", [["Données", "/fr/donnees"], ["Méthodes", "/fr/methodes"], ["Versions", "/fr/versions"], ["Corrections", "/fr/corrections"], ["Glossaire", "/fr/glossaire"]]],
    ["Gouvernance", [["À propos", "/fr/a-propos"], ["Décisions", "/fr/decisions"], ["Dialogue", "/fr/dialogue"]]],
    ["Votre utilisation", [["Compte", "/fr/compte"], ["Confidentialité", "/fr/confidentialite"], ["Conditions", "/fr/conditions"]]],
  ],
} as const;

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="footer-coverage">{EXPLORE_COVERAGE_PERIOD.compact} · BC · AB · ON · QC</p>
        <nav className="footer-nav" aria-label={locale === "en" ? "Record and governance" : "Registre et gouvernance"}>
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
