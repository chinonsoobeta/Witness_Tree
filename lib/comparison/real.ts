import source from "@/data/phase2-federal-riding-latest-comparison.json";
import { adaptFederalRidingComparison } from "./real-adapter";

export const federalRidingComparison = adaptFederalRidingComparison(
  source as Parameters<typeof adaptFederalRidingComparison>[0],
);
