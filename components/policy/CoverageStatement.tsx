import type { ReactNode } from "react";
import type { Locale } from "@/lib/domain";

/**
 * The standing statement of what a view can and cannot tell the reader.
 *
 * `title` and `className` are optional so a surface that gives the statement a
 * different frame, such as the place record's identity band, can reuse the same
 * component rather than growing a parallel one that could drift from it.
 */
export function CoverageStatement({
  locale,
  title,
  className,
  children,
}: Readonly<{ locale: Locale; title?: string; className?: string; children: ReactNode }>) {
  const heading = title ?? (locale === "en" ? "What this view can tell you" : "Ce que cette vue permet de savoir");
  return (
    <aside className={className ? `coverage-statement ${className}` : "coverage-statement"} aria-label={heading}>
      <h2>{heading}</h2>
      <div>{children}</div>
    </aside>
  );
}
