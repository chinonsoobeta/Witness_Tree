import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocationResult } from "@/components/places";
import { SiteShell } from "@/components/site";
import { LOCATIONS, PLACES, locationById } from "@/lib/places";

export const metadata: Metadata = { alternates: { languages: { en: "/en/location", fr: "/fr/emplacement" } } };

export function generateStaticParams() { return LOCATIONS.map(({ id: locationId }) => ({ locationId })); }

export default async function FrenchLocationPage({ params }: Readonly<{ params: Promise<{ locationId: string }> }>) {
  const { locationId } = await params;
  const location = locationById(locationId);
  if (!location) notFound();
  return <SiteShell locale="fr"><LocationResult locale="fr" location={location} places={PLACES.filter((place) => location.containingPlaceIds.includes(place.id))} /></SiteShell>;
}
