import type { ReactNode } from "react";
import type { Locale } from "@/lib/domain";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function SiteShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <div className="site-shell"><SiteHeader locale={locale} />{children}<SiteFooter locale={locale} /></div>;
}
