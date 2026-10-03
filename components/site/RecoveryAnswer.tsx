import Link from "next/link";
import { ConditionRecoveryHeadline } from "@/components/explore/ConditionRecoveryFigures";
import { formatPercent, type Locale } from "@/lib/domain";
import { conditionRecoveryView } from "@/lib/explore/condition-recovery";

const COPY = {
  en: {
    heading: "Did the trees grow back?",
    byProvince: "Treed again after the latest loss, by province",
    withheld: "Withheld",
    explore: "See recovery by region on the map",
    href: "/en/explore?mode=condition-recovery",
    meaning: "This measures trees coming back, not the return of the forest that was there.",
  },
  fr: {
    heading: "Les arbres ont-ils repoussé ?",
    byProvince: "Redevenu boisé après la dernière perte, par province",
    withheld: "Non présenté",
    explore: "Voir le rétablissement par région sur la carte",
    href: "/fr/explorer?mode=condition-recovery",
    meaning: "On mesure le retour des arbres, et non celui de la forêt qui s’y trouvait.",
  },
} as const;

/** The home page's answer on recovery, from the admitted release; nothing at all without one. */
export function RecoveryAnswer({ locale }: Readonly<{ locale: Locale }>) {
  const view = conditionRecoveryView();
  const four = view?.rows.find((row) => row.kind === "four-provinces");
  if (!view || !four) return null;
  const text = COPY[locale];
  const provinces = view.rows.filter((row) => row.kind === "province");
  return (
    <section className="content-section recovery-answer" aria-labelledby="recovery-answer">
      <h2 id="recovery-answer">{text.heading}</h2>
      <ConditionRecoveryHeadline four={four} locale={locale} />
      <p>{text.meaning}</p>
      <p className="eyebrow">{text.byProvince}</p>
      <ul className="recovery-answer-provinces">
        {provinces.map((row) => (
          <li key={row.id}>
            <span>{row.name[locale]}</span>{" "}
            <strong>{row.latestRecoveredPercent === null ? text.withheld : formatPercent(Math.round(row.latestRecoveredPercent * 10) / 10, locale)}</strong>
          </li>
        ))}
      </ul>
      <p><Link className="btn btn--primary" href={text.href}>{text.explore}</Link></p>
    </section>
  );
}
