import { useState } from "react";
import type { ReactNode } from "react";
import { ProvinceBar } from "witness-tree";

// Two placements, both taken from the app. On the landing page the bar is a
// static list of the four published provinces — app/en/page.tsx renders it with
// no handler, so it is a role="list" of flags and names under the hero. On the
// explore map it is a nav of buttons that refits the map to the chosen
// province; components/explore/ExploreMapClient.tsx passes placement="map",
// the current view as `selected`, and a handler that fits the bounds.
//
// The map placement is absolutely positioned over the map frame, so the cell
// supplies a positioned stand-in for that frame. The selection is real state,
// not a frozen prop: the buttons work in the card the way they do on the map.

type Province = "bc" | "ab" | "on" | "qc";

const MapFrame = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      position: "relative",
      minHeight: "150px",
      borderRadius: "12px",
      border: "1px solid var(--rule-strong)",
      background: "var(--sand)",
    }}
  >
    {children}
  </div>
);

function OnTheMap({ locale }: { locale: "en" | "fr" }) {
  const [selected, setSelected] = useState<Province>("bc");
  return (
    <MapFrame>
      <ProvinceBar locale={locale} placement="map" selected={selected} onSelect={setSelected} />
    </MapFrame>
  );
}

export const Landing = () => <ProvinceBar locale="en" />;

export const OverTheMap = () => <OnTheMap locale="en" />;

export const LandingFrench = () => <ProvinceBar locale="fr" />;

export const OverTheMapFrench = () => <OnTheMap locale="fr" />;
