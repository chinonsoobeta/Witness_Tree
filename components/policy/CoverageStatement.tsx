import type { ReactNode } from "react";
import type { Locale } from "@/lib/domain";

export function CoverageStatement({ locale, children }: Readonly<{ locale: Locale; children: ReactNode }>) {
  const title = locale === "en" ? "What this view can tell you" : "Ce que cette vue permet de savoir";
  return (
    <aside className="coverage-statement" aria-label={title}>
      <h2>{title}</h2>
      <div>{children}</div>
    </aside>
  );
}
