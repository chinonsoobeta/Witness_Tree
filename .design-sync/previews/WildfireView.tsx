import type { ReactNode } from "react";
import { WildfireView } from "witness-tree";

// WildfireView takes locale and nothing else: every string, every agency and
// every feed-status value lives inside the component
// (components/wildfire/WildfireView.tsx), which is deliberate, because the
// page's whole job is to say that Witness Tree publishes no live wildfire feed
// and to hand the reader to the four provincial agencies instead. So locale is
// the entire variant axis.
//
// It is a page, not a control: the rendered composition is 1513px tall in
// English and 1774px in French, so each cell is the top of the page at natural
// scale rather than a shrunken whole. See .design-sync/learnings/W1A.md.
//
// 26rem is the third cell on purpose: .page-wrap is width
// min(--plate, calc(100% - 40px)), so a 26rem frame gives the page a 376px
// measure, which is the app's 375px mobile reference, and the French masthead
// is the longest heading the app has to set at that width.
const PhoneFrame = ({ children }: { children: ReactNode }) => (
  <div style={{ width: "26rem", border: "1px dashed rgba(17, 17, 17, 0.2)", borderRadius: 8, overflow: "hidden" }}>
    {children}
  </div>
);

export const English = () => <WildfireView locale="en" />;

export const French = () => <WildfireView locale="fr" />;

export const NarrowFrench = () => (
  <PhoneFrame>
    <WildfireView locale="fr" />
  </PhoneFrame>
);
