import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocationResult } from "@/components/places";
import { SiteShell } from "@/components/site";
import { LOCATIONS, PLACES, locationById } from "@/lib/places";
import { localizedAlternates } from "@/lib/site-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locationId: string }> }): Promise<Metadata> {
  const { locationId } = await params;
  return {
    alternates: localizedAlternates("en", { en: `/en/location/${locationId}`, fr: `/fr/emplacement/${locationId}` }),
    robots: { index: false, follow: false },
  };
}

export function generateStaticParams() { return LOCATIONS.map(({ id: locationId }) => ({ locationId })); }

export default async function EnglishLocationPage({ params }: Readonly<{ params: Promise<{ locationId: string }> }>) {
  const { locationId } = await params;
  const location = locationById(locationId);
  if (!location) notFound();
  return <SiteShell locale="en"><LocationResult locale="en" location={location} places={PLACES.filter((place) => location.containingPlaceIds.includes(place.id))} /></SiteShell>;
}
