import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CORRECTIONS_RECIPIENT_ENV,
  CORRECTIONS_RECIPIENT_ROLE,
  correctionMailBody,
  correctionMailSubject,
  correctionMailtoHref,
  correctionsRecipient,
  plausibleRecipientEmail,
}
// @ts-expect-error Node test runner needs extensions.
from "../lib/corrections/contact.ts";
import { GovernancePage }
// @ts-expect-error Node test runner needs extensions.
from "../components/governance/GovernancePage.tsx";
// @ts-expect-error Node test runner needs extensions.
import { PRODUCT_NAME } from "../lib/domain/brand.ts";
import EnglishCorrections
// @ts-expect-error Node test runner needs extensions.
from "../app/en/corrections/page.tsx";
import FrenchCorrections
// @ts-expect-error Node test runner needs extensions.
from "../app/fr/corrections/page.tsx";

const VALID = "corrections.lead+site@example.org";
const locales = ["en", "fr"] as const;

test("the recipient gate is closed when the variable is unset or blank", () => {
  assert.equal(CORRECTIONS_RECIPIENT_ENV, "CORRECTIONS_RECIPIENT_EMAIL");
  assert.equal(correctionsRecipient({}), null);
  assert.equal(correctionsRecipient({ CORRECTIONS_RECIPIENT_EMAIL: "" }), null);
  assert.equal(correctionsRecipient({ CORRECTIONS_RECIPIENT_EMAIL: "   " }), null);
});

test("an implausible address is treated as unset", () => {
  for (const value of [
    "not-an-address",
    "@example.org",
    "someone@",
    "someone@example",
    "someone@example.c",
    "some one@example.org",
    "someone@@example.org",
    ".someone@example.org",
    "some..one@example.org",
    "someone@-example.org",
    "someone@example.org?bcc=other@example.org",
    "someone@example.org&body=x",
    "someone@example.org#x",
    "some%40one@example.org",
    "\"someone\"@example.org",
    "Someone <someone@example.org>",
    "a@b.org,c@d.org",
    `${"a".repeat(250)}@example.org`,
  ]) {
    assert.equal(plausibleRecipientEmail(value), null, value);
    assert.equal(correctionsRecipient({ CORRECTIONS_RECIPIENT_EMAIL: value }), null, value);
  }
});

test("a plausible address opens the gate with the bilingual role", () => {
  const recipient = correctionsRecipient({ CORRECTIONS_RECIPIENT_EMAIL: `  ${VALID}\n` });
  assert.deepEqual(recipient, { email: VALID, role: CORRECTIONS_RECIPIENT_ROLE });
  assert.ok(CORRECTIONS_RECIPIENT_ROLE.en.trim() && CORRECTIONS_RECIPIENT_ROLE.fr.trim());
});

test("the prefilled subject and body are in the reader's language and URL-encoded", () => {
  const recipient = correctionsRecipient({ CORRECTIONS_RECIPIENT_EMAIL: VALID })!;
  const expected = {
    en: ["Correction request", ["Page link:", "Exact words or number:", "Date and time:", "Language:", "Why it looks wrong:", "Official source, if any:"]],
    fr: ["Demande de correction", ["Lien de la page\u202F:", "Mots ou chiffre exacts\u202F:", "Date et heure\u202F:", "Langue\u202F:", "Pourquoi l’information semble erronée\u202F:", "Source officielle, s’il y a lieu\u202F:"]],
  } as const;
  for (const locale of locales) {
    const [subject, fields] = expected[locale];
    assert.equal(correctionMailSubject(locale), subject);
    assert.equal(correctionMailBody(locale), `${fields.join("\r\n\r\n")}\r\n`);

    const href = correctionMailtoHref(recipient, locale);
    assert.equal(href, `mailto:${VALID}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(correctionMailBody(locale))}`);
    // RFC 6068: spaces are %20 (never +), line breaks are %0D%0A, and the
    // query carries only a subject and a body.
    const query = href.slice(href.indexOf("?") + 1);
    assert.doesNotMatch(query, /[ \r\n+]/);
    assert.match(query, /%0D%0A%0D%0A/);
    const params = new URLSearchParams(query);
    assert.deepEqual([...params.keys()], ["subject", "body"]);
    assert.equal(decodeURIComponent(query.split("&")[0]!.slice("subject=".length)), subject);
    assert.equal(decodeURIComponent(query.split("&")[1]!.slice("body=".length)), correctionMailBody(locale));

    for (const name of [PRODUCT_NAME.en, PRODUCT_NAME.fr]) {
      assert.ok(!decodeURIComponent(href).toLowerCase().includes(name.toLowerCase()), `${locale} link names the product`);
      assert.ok(!href.toLowerCase().includes(encodeURIComponent(name).toLowerCase()), `${locale} link names the product`);
    }
  }
});

test("no recipient address is written into the source", () => {
  for (const path of ["../lib/corrections/contact.ts", "../components/governance/GovernancePage.tsx", "../app/en/corrections/page.tsx", "../app/fr/corrections/page.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /[A-Za-z0-9._+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, path);
  }
});

const NO_ROUTE = {
  en: "There’s no way to send it to us yet, so check back here; don’t send personal information to any address this page doesn’t list. Your notes don’t open a case or start the response clock.",
  fr: "Il n’y a pas encore de moyen de nous l’envoyer\u202F: revenez consulter cette page\u202F; n’envoyez aucun renseignement personnel à une adresse que cette page n’indique pas. Vos notes n’ouvrent pas de demande et ne déclenchent aucun délai de réponse.",
} as const;
const SEND_HEADING = { en: "Send a correction", fr: "Envoyer une correction" } as const;

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;");

test("without a recipient the corrections page keeps today's wording and offers no link", () => {
  for (const locale of locales) {
    const html = renderToStaticMarkup(<GovernancePage kind="corrections" locale={locale} />);
    assert.equal(renderToStaticMarkup(<GovernancePage kind="corrections" locale={locale} correctionsRecipient={null} />), html);
    assert.ok(html.includes(NO_ROUTE[locale]), locale);
    assert.ok(!html.includes(SEND_HEADING[locale]));
    assert.doesNotMatch(html, /mailto:|@/);
  }
});

test("with a recipient the corrections page shows the send block in both languages", () => {
  const recipient = correctionsRecipient({ CORRECTIONS_RECIPIENT_EMAIL: VALID })!;
  const expected = {
    en: [
      `Recipient: ${CORRECTIONS_RECIPIENT_ROLE.en}, ${VALID}.`,
      "Include only your reply address and the details above. Don’t add any other personal information, and don’t include anything about other people.",
      "Sending an email doesn’t open a production correction case or start the response clock",
      ">Write a correction email</a>",
      "then send them as described below.",
    ],
    fr: [
      `Destinataire\u202F: ${CORRECTIONS_RECIPIENT_ROLE.fr}, ${VALID}.`,
      "N’indiquez que votre adresse de réponse et les renseignements ci-dessus. N’ajoutez aucun autre renseignement personnel et rien qui concerne d’autres personnes.",
      "L’envoi d’un courriel n’ouvre pas de dossier de correction de production et ne déclenche aucun délai de réponse",
      ">Rédiger un courriel de correction</a>",
      "puis envoyez-les comme il est indiqué ci-dessous.",
    ],
  } as const;
  for (const locale of locales) {
    const html = renderToStaticMarkup(<GovernancePage kind="corrections" locale={locale} correctionsRecipient={recipient} />);
    assert.ok(html.includes(`<h2>${SEND_HEADING[locale]}</h2>`), locale);
    assert.ok(!html.includes(NO_ROUTE[locale]), locale);
    for (const phrase of expected[locale]) assert.ok(html.includes(escapeHtml(phrase)), `${locale}: ${phrase}`);
    assert.ok(html.includes(`href="${escapeHtml(correctionMailtoHref(recipient, locale))}"`), locale);
    // The instructions anchor still lands on the interim instructions, and the
    // send block follows it.
    assert.ok(html.indexOf('id="correction-instructions"') < html.indexOf(SEND_HEADING[locale]));
    assert.equal((html.match(/mailto:/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<form|onclick|data-analytics|data-track/i);
  }
  // Other governance pages ignore the recipient.
  const glossary = renderToStaticMarkup(<GovernancePage kind="glossary" locale="en" correctionsRecipient={recipient} />);
  assert.doesNotMatch(glossary, /mailto:/);
});

test("the corrections routes read the recipient from the environment when rendered", () => {
  const previous = process.env[CORRECTIONS_RECIPIENT_ENV];
  try {
    delete process.env[CORRECTIONS_RECIPIENT_ENV];
    assert.ok(renderToStaticMarkup(<EnglishCorrections />).includes(NO_ROUTE.en));
    assert.ok(renderToStaticMarkup(<FrenchCorrections />).includes(NO_ROUTE.fr));

    process.env[CORRECTIONS_RECIPIENT_ENV] = "not an address";
    assert.ok(renderToStaticMarkup(<EnglishCorrections />).includes(NO_ROUTE.en));

    process.env[CORRECTIONS_RECIPIENT_ENV] = VALID;
    const english = renderToStaticMarkup(<EnglishCorrections />);
    const french = renderToStaticMarkup(<FrenchCorrections />);
    assert.ok(english.includes(`<h2>${SEND_HEADING.en}</h2>`) && english.includes(`mailto:${VALID}?subject=Correction%20request`));
    assert.ok(french.includes(`<h2>${SEND_HEADING.fr}</h2>`) && french.includes(`mailto:${VALID}?subject=Demande%20de%20correction`));
  } finally {
    if (previous === undefined) delete process.env[CORRECTIONS_RECIPIENT_ENV];
    else process.env[CORRECTIONS_RECIPIENT_ENV] = previous;
  }
});
