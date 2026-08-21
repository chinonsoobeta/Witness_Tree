import type { Locale } from "@/lib/domain";
import { PublicContentPage } from "./PublicContentPage";

export function MethodologyPage({ locale }: Readonly<{ locale: Locale }>) {
  return <PublicContentPage kind="methods" locale={locale} />;
}
