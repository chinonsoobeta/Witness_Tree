import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlacePage } from "@/components/places";
import { SiteShell } from "@/components/site";
import { PLACES, placeById } from "@/lib/places";

export const metadata: Metadata = { alternates: { languages: { en: "/en/places", fr: "/fr/lieux" } } };

export function generateStaticParams() { return PLACES.map(({ id: placeId }) => ({ placeId })); }

export default async function FrenchPlacePage({ params, searchParams }: Readonly<{ params: Promise<{ placeId: string }>; searchParams: Promise<{ view?: string }> }>) {
  const [{ placeId }, query] = await Promise.all([params, searchParams]);
  const place = placeById(placeId);
  if (!place) notFound();
  return <SiteShell locale="fr"><PlacePage locale="fr" place={place} view={query.view === "table" ? "table" : "chart"} /></SiteShell>;
}
