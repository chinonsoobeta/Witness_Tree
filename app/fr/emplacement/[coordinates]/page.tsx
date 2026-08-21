import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocationResult } from "@/components/places";
import { SiteShell } from "@/components/site";
import { LOCATIONS, PLACES, localizedRecord, registryEntryByCoordinateId } from "@/lib/places";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ coordinates: string }> }): Promise<Metadata> {
  const { coordinates } = await params;
  const record = localizedRecord("location", coordinates, "fr");
  if (!record?.route || !record.alternate.href) return {};
  return { alternates: { languages: { en: record.alternate.href, fr: record.route } } };
}

export function generateStaticParams() { return LOCATIONS.map(({ coordinateId: coordinates }) => ({ coordinates })); }

export default async function FrenchLocationPage({ params }: Readonly<{ params: Promise<{ coordinates: string }> }>) {
  const { coordinates } = await params;
  const entry = registryEntryByCoordinateId(coordinates);
  if (!entry) notFound();
  const places = entry.location.containingPlaceIds.map((id) => PLACES.find((place) => place.id === id)).filter((place) => place !== undefined);
  return <SiteShell locale="fr"><LocationResult locale="fr" location={entry.location} places={places} /></SiteShell>;
}
