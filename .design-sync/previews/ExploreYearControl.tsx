import { useState } from "react";
import { ExploreYearControl } from "witness-tree";

/*
 * The dual-handle span slider that drives everything else on the Explore page.
 * It is a client control with real interaction state, so each cell owns a small
 * amount of state and lets the control move: the readout under the handles is
 * the component's own, not a caption written here.
 *
 * The variant axis is the two shapes a selection can take. Handles one year
 * apart mean a single annual interval and the readout says so in words
 * ("Change between 2021 and 2022"); handles further apart mean a multi-year
 * span. Those read differently and a design has to accommodate both.
 */
type State = { mode: "map"; presentation: "province"; data: "map"; year: number; fromYear?: number };

const ANNUAL: State = { mode: "map", presentation: "province", data: "map", year: 2022 };
const SPAN: State = { mode: "map", presentation: "province", data: "map", year: 2018, fromYear: 1990 };

function Control({ initial, locale }: { initial: State; locale: "en" | "fr" }) {
  const [state, setState] = useState(initial);
  return (
    <ExploreYearControl
      locale={locale}
      state={state}
      onYearChange={(year) => setState((current) => ({ ...current, year }))}
      onIntervalChange={(interval) =>
        setState((current) => ({ ...current, fromYear: interval.fromYear, year: interval.toYear }))
      }
    />
  );
}

/** Handles one year apart: a single annual interval. */
export const AnnualInterval = () => <Control initial={ANNUAL} locale="en" />;

/** Handles apart: a multi-year span, which reads as a range rather than a change. */
export const MultiYearSpan = () => <Control initial={SPAN} locale="en" />;

export const French = () => <Control initial={SPAN} locale="fr" />;
