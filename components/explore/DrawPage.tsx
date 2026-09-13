import type { Locale } from "@/lib/domain";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
import { ShapeMeasureClient } from "./ShapeMeasureClient";

export function DrawPage({ locale, available }: Readonly<{ locale: Locale; available: boolean }>) {
  return (
    <section className="page-wrap draw-page">
      <header className="masthead">
        <h1>{locale === "en" ? "Draw and measure" : "Dessiner et mesurer"}</h1>
      </header>
      <CoverageStatement locale={locale}>
        <p>{locale === "en"
          ? "A shape can cross measured land, blocks without data, and land outside the mapped area. The result separates these coverage states before showing a range. Missing coverage never means no loss."
          : "Une forme peut traverser du territoire mesuré, des blocs sans données et du territoire hors de la zone cartographiée. Le résultat distingue ces états de couverture avant d’afficher une fourchette. Une couverture manquante ne signifie jamais une absence de perte."}</p>
        <p>{locale === "en"
          ? "The measurement comes from the source grid. The drawn map is a guide; it is not the measurement."
          : "La mesure provient de la grille source. La carte dessinée sert de guide ; elle ne constitue pas la mesure."}</p>
      </CoverageStatement>
      <EvidenceLegend locale={locale} />
      {available ? <ShapeMeasureClient locale={locale} /> : (
        <p className="no-record-result" role="status">{locale === "en"
          ? "– Area measurement is not available on this site yet. No result has been calculated."
          : "– La mesure de zone n’est pas encore offerte sur ce site. Aucun résultat n’a été calculé."}</p>
      )}
      <p><a href={locale === "en" ? "/en/explore" : "/fr/explorer"}>
        {locale === "en" ? "Back to Explore" : "Retour à Explorer"}
      </a></p>
    </section>
  );
}
