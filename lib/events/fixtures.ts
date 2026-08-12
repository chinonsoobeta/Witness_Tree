import type { FtaInput } from "./types";

export const EXAMPLE_FTA_EVENTS: readonly FtaInput[] = Object.freeze([
  { status: "example", id: "bc-pending", province: "BC", lifecycle: "PENDING", tenure: "Crown", year: 2025, hectares: 10 },
  { status: "example", id: "bc-active-unknown", province: "BC", lifecycle: "ACTIVE", tenure: "unknown", subtype: "thinning", year: 2025, hectares: 5 },
  { status: "example", id: "bc-retired-reserve", province: "BC", lifecycle: "RETIRED", tenure: "reserve", subtype: "salvage", year: 2024, hectares: 8 },
  { status: "example", id: "ab-retired", province: "AB", lifecycle: "RETIRED", tenure: "private", subtype: "partial-cut", year: 2023, hectares: 12 },
]);
