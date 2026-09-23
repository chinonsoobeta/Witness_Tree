import type { ReactNode } from "react";
import type { Locale } from "@/lib/domain";

/**
 * The standing statement of what a view can and cannot tell the reader.
 *
 * By default it is one closed line under the page title that opens in place.
 * It used to be a tinted plate at the top of every page, which pushed the
 * figures a screen down on a phone and was read past rather than read. The
 * caveat is unchanged; only its weight is. A native <details> needs no script,
 * so it works in a server component and with JavaScript off.
 *
 * `variant="panel"` keeps the open, framed form for the one surface that shows
 * figures inside the statement itself: the place record's identity band.
 */
export function CoverageStatement({
  locale,
  title,
  className,
  variant = "note",
  children,
}: Readonly<{
  locale: Locale;
  title?: string;
  className?: string;
  variant?: "note" | "panel";
  children: ReactNode;
}>) {
  if (variant === "panel") {
    const heading = title ?? (locale === "en" ? "What this view can tell you" : "Ce que cette vue permet de savoir");
    return (
      <aside className={className ? `coverage-statement ${className}` : "coverage-statement"} aria-label={heading}>
        <h2>{heading}</h2>
        <div>{children}</div>
      </aside>
    );
  }
  const heading = title ?? (locale === "en" ? "What these figures can’t tell you" : "Ce que ces chiffres ne disent pas");
  return (
    <details className={className ? `coverage-note ${className}` : "coverage-note"}>
      <summary>
        <span className="mark-glyph mark-glyph--unknown" aria-hidden="true" />
        {heading}
      </summary>
      <div className="coverage-note-body">{children}</div>
    </details>
  );
}
