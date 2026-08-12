export const PRECEDENCE_ORDER = [
  "fire",
  "recorded-harvest",
  "insect-disease",
  "other-intervention",
  "unmatched-detected-change",
] as const;

export type PrecedenceEventKind = (typeof PRECEDENCE_ORDER)[number];

export type PrecedenceEvent = Readonly<{
  id: string;
  hectareYearId: string;
  year: number;
  hectares: number;
  kind: PrecedenceEventKind;
  /** Required for a recorded harvest to participate in the precedence order. */
  qualifyingRecordedHarvest?: boolean;
}>;

export type PrecedenceResolution = Readonly<{
  hectareYearId: string;
  year: number;
  winner: PrecedenceEvent | null;
  retainedEvidence: readonly PrecedenceEvent[];
}>;

function precedenceRank(event: PrecedenceEvent): number | null {
  if (event.kind === "recorded-harvest" && !event.qualifyingRecordedHarvest) return null;
  return PRECEDENCE_ORDER.indexOf(event.kind);
}

/** Chooses one displayed/counting event per hectare-year without discarding any evidence. */
export function resolvePrecedence(events: readonly PrecedenceEvent[]): readonly PrecedenceResolution[] {
  const byHectareYear = new Map<string, PrecedenceEvent[]>();
  for (const event of events) {
    const group = byHectareYear.get(event.hectareYearId);
    if (group) group.push(event);
    else byHectareYear.set(event.hectareYearId, [event]);
  }

  return Array.from(byHectareYear, ([hectareYearId, retainedEvidence]) => {
    const ranked = retainedEvidence
      .map((event, index) => ({ event, index, rank: precedenceRank(event) }))
      .filter((item): item is { event: PrecedenceEvent; index: number; rank: number } => item.rank !== null)
      .sort((left, right) => left.rank - right.rank || left.index - right.index);
    const winner = ranked[0]?.event ?? null;
    const year = retainedEvidence[0]?.year;
    if (year === undefined) throw new Error("A precedence group must contain evidence.");
    if (retainedEvidence.some((event) => event.year !== year)) {
      throw new Error(`Hectare-year ${hectareYearId} contains more than one year.`);
    }
    return { hectareYearId, year, winner, retainedEvidence: [...retainedEvidence] };
  });
}

/** The sum uses only precedence winners, so each hectare-year is counted once. */
export function totalPrecedenceHectares(resolutions: readonly PrecedenceResolution[]): number {
  return resolutions.reduce((total, resolution) => total + (resolution.winner?.hectares ?? 0), 0);
}
