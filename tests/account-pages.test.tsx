import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountStatusPage }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../components/account/AccountStatusPage.tsx";

test("English and French account status pages state the same unavailable service and planned safeguards", () => {
  const en = renderToStaticMarkup(<AccountStatusPage locale="en" />); const fr = renderToStaticMarkup(<AccountStatusPage locale="fr" />);
  for (const text of ["Accounts are not active", "Sign-up", "sign-in", "unavailable", "25", "5,000 km²", "verified email", "data version", "within 30 days", "Canadian managed PostgreSQL", "row-level security", "Encryption", "transactional email", "rate limiting", "Privacy review", "not emergency direction"]) assert.match(en, new RegExp(text, "i"));
  for (const text of ["Les comptes ne sont pas actifs", "L’inscription", "connexion", "pas disponibles", "25", "5 000 km²", "courriel vérifiée", "version exacte", "30 jours", "PostgreSQL géré au Canada", "sécurité des lignes", "Chiffrement", "courriel transactionnel", "limitation du débit", "Examen de la confidentialité", "ne constituent pas des directives d’urgence"]) assert.match(fr, new RegExp(text, "i"));
  assert.match(en, /href="\/en\/privacy"/); assert.match(en, /href="\/en\/terms"/); assert.match(fr, /href="\/fr\/confidentialite"/); assert.match(fr, /href="\/fr\/conditions"/); assert.equal(/<form|type="submit"/i.test(`${en}${fr}`), false);
});
