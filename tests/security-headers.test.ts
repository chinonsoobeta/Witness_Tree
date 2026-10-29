import assert from "node:assert/strict";
import test from "node:test";
// The matcher next.config headers use.
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match.js";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import nextConfig from "../next.config.ts";

/*
 * Two classes of route: an embedded figure, which any site may frame, and
 * everything else, which no site may. Every path must fall under exactly one
 * header rule, or a path could get both X-Frame-Options: DENY and an open
 * frame-ancestors, or neither. tests/rendered-html.test.mjs checks the same
 * headers on real responses, and tests/browser/embed-framing.spec.ts in a browser.
 */

type Rule = { source: string; headers: { key: string; value: string }[] };

const EMBEDS = ["/en/embed/1984-2022-v1/csd-2021/5924034", "/fr/integrer/1984-2022-v1/federal-2023/59001"];
const OTHERS = ["/", "/en", "/fr", "/en/places/1984-2022-v1/csd-2021/5924034", "/fr/lieux/1984-2022-v1/csd-2021/5924034", "/en/places/1984-2022-v1/csd-2021/5924034/opengraph-image", "/api/oembed", "/en/embed", "/en/embed/", "/fr/integrer", "/fr/embed/1984-2022-v1/csd-2021/5924034", "/en/embedded/x", "/_next/static/chunks/a.js", "/favicon.ico"];

async function rulesFor(pathname: string): Promise<Rule[]> {
  const rules = (await nextConfig.headers!()) as Rule[];
  return rules.filter((rule) => getPathMatch(rule.source, { removeUnnamedParams: true, strict: true })(pathname) !== false);
}

const header = (rule: Rule, key: string) => rule.headers.find((entry) => entry.key === key)?.value;
const directive = (policy: string | undefined, name: string) => policy?.split("; ").find((part) => part.startsWith(`${name} `));

test("an embed path may be framed by any site and runs no script; it sends no X-Frame-Options", async () => {
  for (const pathname of EMBEDS) {
    const rules = await rulesFor(pathname);
    assert.equal(rules.length, 1, pathname);
    const policy = header(rules[0]!, "Content-Security-Policy");
    assert.equal(directive(policy, "frame-ancestors"), "frame-ancestors *", pathname);
    assert.equal(directive(policy, "script-src"), "script-src 'none'", pathname);
    assert.equal(header(rules[0]!, "X-Frame-Options"), undefined, pathname);
    for (const key of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) assert.ok(header(rules[0]!, key), `${pathname} ${key}`);
  }
});

test("every other path refuses to be framed, with DENY and frame-ancestors 'none'", async () => {
  for (const pathname of OTHERS) {
    const rules = await rulesFor(pathname);
    assert.equal(rules.length, 1, pathname);
    assert.equal(header(rules[0]!, "X-Frame-Options"), "DENY", pathname);
    assert.equal(directive(header(rules[0]!, "Content-Security-Policy"), "frame-ancestors"), "frame-ancestors 'none'", pathname);
  }
});
