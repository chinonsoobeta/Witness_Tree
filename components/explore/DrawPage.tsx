import type { Locale } from "@/lib/domain";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { federalRidingComparison } from "@/lib/comparison";
import type { InitialCircle } from "@/lib/shapes/circle";
import { ShapeMeasureClient } from "./ShapeMeasureClient";

// The federal ridings the Compare page can actually show. A link to any other
// riding would quietly open a different pair, so those get an Explore link.
const COMPARABLE_FEDERAL_IDS = federalRidingComparison.comparisonRows.map((row) => row.id);

export function DrawPage({
  locale,
  available,
  initialCircle = null,
  addressLookup = false,
  districtLookup = false,
}: Readonly<{
  locale: Locale;
  available: boolean;
  initialCircle?: InitialCircle | null;
  addressLookup?: boolean;
  districtLookup?: boolean;
}>) {
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
      {available ? (
        <ShapeMeasureClient
          locale={locale}
          initialCircle={initialCircle}
          addressLookup={addressLookup}
          districtLookup={districtLookup}
          comparableFederalIds={COMPARABLE_FEDERAL_IDS}
        />
      ) : (
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
