import type { Locale } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore";

export function SiteFooter({ locale }: { locale: Locale }) {
  const links = locale === "en"
    ? [["Data", "/en/data"], ["Methods", "/en/methods"], ["About", "/en/about"], ["Glossary", "/en/glossary"], ["Corrections", "/en/corrections"], ["Decisions", "/en/decisions"], ["Engagement", "/en/engagement"], ["Account", "/en/account"], ["Privacy", "/en/privacy"], ["Terms", "/en/terms"], ["Releases", "/en/releases"]]
    : [["Données", "/fr/donnees"], ["Méthodes", "/fr/methodes"], ["À propos", "/fr/a-propos"], ["Glossaire", "/fr/glossaire"], ["Corrections", "/fr/corrections"], ["Décisions", "/fr/decisions"], ["Dialogue", "/fr/dialogue"], ["Compte", "/fr/compte"], ["Confidentialité", "/fr/confidentialite"], ["Conditions", "/fr/conditions"], ["Versions", "/fr/versions"]];
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="footer-coverage">{EXPLORE_COVERAGE_PERIOD.compact} · BC · AB · ON · QC</p>
        <nav className="footer-nav" aria-label={locale === "en" ? "Record and governance" : "Registre et gouvernance"}>
          {links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </div>
    </footer>
  );
}
