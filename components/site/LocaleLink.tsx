"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/domain";
import { localeHref } from "@/lib/locale-navigation";

/**
 * The language switch has to know the current route, and only a client component can read it.
 *
 * It is deliberately its own component rather than a "use client" directive on SiteHeader. The
 * header sits in the shell on every page, so marking it client would ship the whole header and its
 * navigation to the browser to compute one href. This island keeps the header server-rendered.
 */
export function LocaleLink({ locale }: { locale: Locale }) {
  const href = localeHref(usePathname(), useSearchParams(), locale);
  return <LocaleAnchor locale={locale} href={href} />;
}

/**
 * The rendering shared with the fallback, so the two cannot drift apart in wording or attributes.
 *
 * The fallback matters: useSearchParams suspends during static rendering, and without a Suspense
 * boundary it would opt every page into client rendering. While suspended the reader still gets a
 * working link to the other language's home, which is exactly what the site did before this fix.
 */
export function LocaleAnchor({ locale, href }: { locale: Locale; href: string }) {
  return (
    <a className="locale-link" href={href} hrefLang={locale === "en" ? "fr" : "en"} lang={locale === "en" ? "fr" : "en"}>
      {locale === "en" ? "Français" : "English"}
    </a>
  );
}
