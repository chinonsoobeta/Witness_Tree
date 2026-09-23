import type { Locale } from "@/lib/domain";
import { EvidenceChip } from "@/components/policy";

const COPY = {
  en: {
    stated: "Unknown. Nothing published answers this yet.",
    limit: "That’s a gap in our records, not proof that nothing happened.",
    methods: "How to read missing records",
    methodsHref: "/en/methods",
    remedies: "What would change this answer",
    items: [
      { text: "Official boundaries for reserves, settlements and treaty or agreement lands are approved and communities have a way to reply, so those places can be listed.", link: null },
      { text: "An official harvest or fire record is added for this area, which would then be marked as an official record, not a satellite observation.", link: null },
      { text: "You file a correction against a figure that is already published.", link: { href: "/en/corrections", label: "How corrections work" } },
    ],
  },
  fr: {
    stated: "Inconnu. Rien de publié ne répond encore à cette question.",
    limit: "C’est une lacune de nos registres, et non la preuve que rien ne s’est produit.",
    methods: "Comment interpréter les registres manquants",
    methodsHref: "/fr/methodes",
    remedies: "Ce qui changerait cette réponse",
    items: [
      { text: "Les limites officielles des réserves, des établissements et des terres visées par un traité ou une entente sont approuvées et les communautés ont un moyen de répondre, de sorte que ces lieux peuvent être répertoriés.", link: null },
      { text: "Un registre officiel de récolte ou d’incendie est ajouté pour ce secteur; il serait alors marqué comme registre officiel, et non comme observation satellitaire.", link: null },
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
