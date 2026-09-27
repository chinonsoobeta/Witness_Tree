import type { Locale } from "@/lib/domain";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { ShapeMeasureClient } from "./ShapeMeasureClient";

export function DrawPage({ locale, available }: Readonly<{ locale: Locale; available: boolean }>) {
  return (
    <section className="page-wrap draw-page">
      <header className="masthead">
        <h1>{locale === "en" ? "Draw and measure" : "Dessiner et mesurer"}</h1>
      </header>
      <CoverageStatement locale={locale}>
        <p>{locale === "en"
          ? "Your shape may cover land that was measured, land with no data, and land outside the mapped area. The result shows each part separately. Missing data never means no loss."
          : "Votre forme peut couvrir du territoire mesuré, du territoire sans données et du territoire hors de la zone cartographiée. Le résultat présente chaque partie séparément. Des données manquantes ne signifient jamais une absence de perte."}</p>
        <p>{locale === "en"
          ? "The map is only a guide. The measurement comes from the underlying data grid."
          : "La carte sert seulement de guide. La mesure provient de la grille de données sous-jacente."}</p>
      </CoverageStatement>
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
