import type { Locale } from "@/lib/domain";
import { PublicContentPage } from "./PublicContentPage";

export function DataPage({ locale }: Readonly<{ locale: Locale }>) {
  return <PublicContentPage kind="data" locale={locale} />;
}
