import type { Locale } from "@/lib/domain";

export function SiteFooter({ locale }: { locale: Locale }) {
  const links = locale === "en"
    ? [["Data", "/en/data"], ["Methods", "/en/methods"], ["Glossary", "/en/glossary"], ["Corrections", "/en/corrections"], ["Decisions", "/en/decisions"], ["Engagement", "/en/engagement"], ["Privacy", "/en/privacy"], ["Terms", "/en/terms"], ["Releases", "/en/releases"]]
    : [["Données", "/fr/donnees"], ["Méthodes", "/fr/methodes"], ["Glossaire", "/fr/glossaire"], ["Corrections", "/fr/corrections"], ["Décisions", "/fr/decisions"], ["Dialogue", "/fr/dialogue"], ["Confidentialité", "/fr/confidentialite"], ["Conditions", "/fr/conditions"], ["Versions", "/fr/versions"]];
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>1984–present · BC · AB · ON · QC</p>
        <nav aria-label={locale === "en" ? "Record and governance" : "Registre et gouvernance"}>
          {links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </div>
    </footer>
  );
}
