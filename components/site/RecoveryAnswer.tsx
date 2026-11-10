import Link from "next/link";
import { formatHectares, formatNumber, formatPercent, type Locale } from "@/lib/domain";
import { conditionRecoveryView } from "@/lib/explore/condition-recovery";

/*
 * The home page's answer on recovery, in one line (audit 2026-11-10, A5).
 * The province breakdown, the decades and the causes are in Explore's
 * Condition and recovery view, where this links. The line keeps what bounds
 * the figure: the area it is a share of, what "treed" measures, and the area
 * that is Unknown.
 */
const COPY = {
  en: {
    question: "Did the trees grow back?",
    answer: (share: string, lost: string, unknown: string) =>
      `${share} of the ~${lost} million ha that lost tree cover was treed again for at least 5 years in a row after its latest loss. That counts trees, not the forest that was there. ${unknown} is Unknown and left out.`,
    withheld: "Withheld",
    explore: "See condition and recovery on the map",
    href: "/en/explore?mode=condition-recovery",
  },
  fr: {
    question: "Les arbres ont-ils repoussé\u202F?",
    answer: (share: string, lost: string, unknown: string) =>
      `${share} des quelque ${lost}\u00a0millions d’hectares qui ont perdu leur couvert arboré ont été de nouveau boisés au moins 5\u00a0années de suite après leur dernière perte. On compte les arbres, et non la forêt qui s’y trouvait. ${unknown} sont inconnus et exclus.`,
    withheld: "Non présenté",
    explore: "Voir l’état et le rétablissement sur la carte",
    href: "/fr/explorer?mode=condition-recovery",
  },
} as const;

/** Nothing at all without an admitted release. */
export function RecoveryAnswer({ locale }: Readonly<{ locale: Locale }>) {
  const view = conditionRecoveryView();
  const four = view?.rows.find((row) => row.kind === "four-provinces");
  if (!view || !four) return null;
  const text = COPY[locale];
  const share = four.latestRecoveredPercent === null
    ? text.withheld
    : formatPercent(Math.round(four.latestRecoveredPercent * 10) / 10, locale);
  return (
    <p className="home-recovery">
      <strong>{text.question}</strong>{" "}
      {text.answer(
        share,
        formatNumber(Math.round(four.lostHectares / 1e5) / 10, locale, 1),
        formatHectares(Math.round(four.unknownHectares), locale, 0),
      )}{" "}
      <Link href={text.href}>{text.explore}</Link>
    </p>
  );
}
