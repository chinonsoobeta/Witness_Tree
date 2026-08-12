import Link from "next/link";
import type { Locale } from "@/lib/domain";

export function SiteFooter({ locale }: { locale: Locale }) {
  const links = locale === "en"
    ? [["Data", "/en/data"], ["Methods", "/en/methods"], ["Components", "/en/components"]]
    : [["Données", "/fr/donnees"], ["Méthodes", "/fr/methodes"], ["Composants", "/fr/composants"]];
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>1984–present · BC · AB · ON · QC</p>
        <nav aria-label={locale === "en" ? "Record and governance" : "Registre et gouvernance"}>
          {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </div>
    </footer>
  );
}
