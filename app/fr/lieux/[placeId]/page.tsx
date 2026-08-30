import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlacePage } from "@/components/places";
import { SiteShell } from "@/components/site";
import { PLACES, placeById } from "@/lib/places";
import { localizedAlternates } from "@/lib/site-metadata";

export async function generateMetadata({ params }: { params: Promise<{ placeId: string }> }): Promise<Metadata> {
  const { placeId } = await params;
  return {
    alternates: localizedAlternates("fr", { en: `/en/places/${placeId}`, fr: `/fr/lieux/${placeId}` }),
    robots: { index: false, follow: false },
  };
}

export function generateStaticParams() { return PLACES.map(({ id: placeId }) => ({ placeId })); }

export default async function FrenchPlacePage({ params, searchParams }: Readonly<{ params: Promise<{ placeId: string }>; searchParams: Promise<{ view?: string }> }>) {
  const [{ placeId }, query] = await Promise.all([params, searchParams]);
  const place = placeById(placeId);
  if (!place) notFound();
  return <SiteShell locale="fr"><PlacePage locale="fr" place={place} view={query.view === "table" ? "table" : "chart"} /></SiteShell>;
}
