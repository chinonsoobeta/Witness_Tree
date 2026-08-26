import Link from "next/link";
import type { Locale } from "@/lib/domain";

export function SiteFooter({ locale }: { locale: Locale }) {
  const links = locale === "en"
    ? [["Data", "/en/data"], ["Methods", "/en/methods"], ["Glossary", "/en/glossary"], ["Corrections", "/en/corrections"], ["Decisions", "/en/decisions"], ["Engagement", "/en/engagement"], ["Privacy", "/en/privacy"], ["Terms", "/en/terms"], ["Releases", "/en/releases"]]
    : [["Données", "/fr/donnees"], ["Méthodes", "/fr/methodes"], ["Glossaire", "/fr/glossaire"], ["Corrections", "/fr/corrections"], ["Décisions", "/fr/decisions"], ["Dialogue", "/fr/dialogue"], ["Confidentialité", "/fr/confidentialite"], ["Conditions", "/fr/conditions"], ["Versions", "/fr/versions"]];
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>{locale === "en" ? "Canada, 1984 to the latest admitted source year · Big Four focus: BC · AB · ON · QC" : "Canada, de 1984 à la plus récente année source admise · quatre provinces prioritaires : C.-B. · Alb. · Ont. · Qc"}</p>
        <nav aria-label={locale === "en" ? "Record and governance" : "Registre et gouvernance"}>
          {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </div>
    </footer>
  );
}
