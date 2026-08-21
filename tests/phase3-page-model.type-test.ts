import { PLACE_REGISTRY } from "@/lib/places";
import type { AnnualSummary, Location, Place, PublicFigure, PublicUnknown } from "@/lib/places";

const example = PLACE_REGISTRY[0]!;

// @ts-expect-error A public denominator cannot be a bare number.
const bareDenominator: Place = { ...example.place, forestHectares: 1_000 };
// @ts-expect-error An annual year cannot be a bare number.
const bareAnnualYear: AnnualSummary = { ...example.place.annual[0]!, year: 2024 };
// @ts-expect-error Annual hectares cannot be a bare number.
const bareAnnualHectares: AnnualSummary = { ...example.place.annual[0]!, hectares: 12 };
// @ts-expect-error Latitude cannot be a bare number.
const bareLatitude: Location = { ...example.location, latitude: 49 };
// @ts-expect-error Accuracy cannot be a bare number.
const bareAccuracy: Location = { ...example.location, accuracyMetres: 100 };
// @ts-expect-error Figure coverage is mandatory.
const figureWithoutCoverage: PublicFigure = { ...example.place.forestHectares, coverageGrade: undefined };
// @ts-expect-error Figure provenance is mandatory.
const figureWithoutProvenance: PublicFigure = { ...example.place.forestHectares, provenance: undefined };
// @ts-expect-error Unknown reasons must be localized and provenance is mandatory.
const unlocalizedUnknown: PublicUnknown = { kind: "unknown", evidence: "unknown", reason: "Missing", coverageGrade: "national-baseline" };

void bareDenominator;
void bareAnnualYear;
void bareAnnualHectares;
void bareLatitude;
void bareAccuracy;
void figureWithoutCoverage;
void figureWithoutProvenance;
void unlocalizedUnknown;
