import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { colon, labelled, semicolon } from "../lib/domain/localized.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { ConfidenceBadge } from "../components/policy/ConfidenceBadge.tsx";

/*
 * French sets a space before a colon and a semicolon. The hand-written French
 * copy in this repository always did; the labels composed at render time, from
 * a translated fragment plus a value, did not, because their punctuation lived
 * in the JSX instead of in a translation.
 *
 * These tests are about the composition helpers and one rendered example. The
 * broader guarantee, that no component composes its own colon again, is the
 * source scan at the bottom: it is a lint that lives here rather than in a gate
 * script because what it protects is a rendering rule, and this is where the
 * rendering rules are tested.
 */

const NARROW_NO_BREAK_SPACE = " ";

test("French punctuation carries a narrow no-break space, English carries none", () => {
  assert.equal(colon("en"), ":");
  assert.equal(colon("fr"), `${NARROW_NO_BREAK_SPACE}:`);
  assert.equal(semicolon("en"), ";");
  assert.equal(semicolon("fr"), `${NARROW_NO_BREAK_SPACE};`);

  assert.equal(labelled("en", "Scale bar", "500 km"), "Scale bar: 500 km");
  assert.equal(
    labelled("fr", "Barre d’échelle", "500 km"),
    `Barre d’échelle${NARROW_NO_BREAK_SPACE}: 500 km`,
  );

  // U+202F, not U+00A0 and not a plain space. A plain space would let a line
  // break strand the colon at the start of a line; a full no-break space is
  // wider than French setting wants.
  assert.ok(!colon("fr").includes(" "));
  assert.ok(!colon("fr").includes(" "));
});

test("a rendered French label spaces its colon and an English one does not", () => {
  const confidence = {
    level: "medium",
    ruleId: "CONF-MEDIUM-001",
    reason: {
      en: "Attribution is partial.",
      fr: "L’attribution est partielle.",
    },
  } as const;

  const french = renderToStaticMarkup(
    <ConfidenceBadge confidence={confidence} locale="fr" />,
  );
  const english = renderToStaticMarkup(
    <ConfidenceBadge confidence={confidence} locale="en" />,
  );

  assert.match(french, new RegExp(`${NARROW_NO_BREAK_SPACE}:\\s`));
  assert.ok(!/[^\s]:\s/.test(french.replace(/<[^>]*>/g, " ")));
  assert.match(english, /[A-Za-z]:\s/);

  // The reason belongs to the accessible name and appears once. It used to be
  // repeated in a span asking for a .sr-only class that did not exist, so it
  // rendered on screen as well.
  const visible = french.replace(/ aria-label="[^"]*"/g, "").replace(/ title="[^"]*"/g, "");
  assert.ok(!visible.includes("attribution est partielle"));
});
