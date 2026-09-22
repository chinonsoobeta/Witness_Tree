import type { Locale } from "@/lib/domain";
import { EvidenceChip } from "@/components/policy";

const COPY = {
  en: {
    stated: "Unknown. Nothing has been published that answers this.",
    limit: "This is a limit of the available record, not evidence that no event occurred.",
    methods: "How to read missing records",
    methodsHref: "/en/methods",
    remedies: "What would change this answer",
    items: [
      { text: "Official boundaries for reserves, settlements, and treaty or agreement lands are admitted and the right-of-reply route is live, so those places can be listed.", link: null },
      { text: "An official harvest authority or fire perimeter is integrated for this area, which would carry the official-record mark rather than satellite observation.", link: null },
      { text: "You file a correction against a figure that is already published.", link: { href: "/en/corrections", label: "How corrections work" } },
    ],
  },
  fr: {
    stated: "Inconnu. Rien n’a été publié qui réponde à cette question.",
    limit: "Il s’agit d’une limite du registre disponible, et non d’une preuve qu’aucun événement n’a eu lieu.",
    methods: "Comment interpréter les registres manquants",
    methodsHref: "/fr/methodes",
    remedies: "Ce qui changerait cette réponse",
    items: [
      { text: "Les limites officielles des réserves, des établissements et des terres visées par un traité ou une entente sont admises et la voie de droit de réponse est en place, de sorte que ces lieux peuvent être répertoriés.", link: null },
      { text: "Une autorité de récolte officielle ou un périmètre d’incendie est intégré pour ce secteur, ce qui porterait la marque du registre officiel plutôt que celle de l’observation satellitaire.", link: null },
      { text: "Vous déposez une correction visant un chiffre déjà publié.", link: { href: "/fr/corrections", label: "Fonctionnement des corrections" } },
    ],
  },
} as const;

/**
 * The Unknown state, stated rather than apologised for.
 *
 * Unknown is a designed answer here, not a failed lookup: the panel names the
 * conclusion first, then the reason it was reached, then what it does not mean,
 * and only then what would turn it into a figure. `remedies` is off by default
 * because two call sites render this twice inside one block, and a list of three
 * ways out printed twice on one screen reads as noise rather than as a route.
 */
export function NoRecordResult({
  locale,
  reason,
  remedies = false,
}: Readonly<{ locale: Locale; reason: string; remedies?: boolean }>) {
  const copy = COPY[locale];
  return (
    <div className="no-record-result">
      <EvidenceChip evidence="unknown" locale={locale} />
      <p className="no-record-stated">{copy.stated}</p>
      <p className="no-record-reason"><strong>– {reason}</strong></p>
      <p>{copy.limit}</p>
      {remedies ? (
        <div className="no-record-remedies">
          <p className="no-record-remedies-label">{copy.remedies}</p>
          <ol className="no-record-remedy-list">
            {copy.items.map((item) => (
              <li key={item.text}>
                {item.text}
                {item.link ? <> <a href={item.link.href}>{item.link.label}</a></> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <a href={copy.methodsHref}>{copy.methods}</a>
    </div>
  );
}
