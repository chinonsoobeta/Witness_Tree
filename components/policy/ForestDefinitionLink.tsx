import { FOREST_DEFINITION, type Locale } from "@/lib/domain";

export function ForestDefinitionLink({ locale, children }: Readonly<{ locale: Locale; children: React.ReactNode }>) {
  return <a href={FOREST_DEFINITION.glossaryPath[locale]}>{children}</a>;
}
