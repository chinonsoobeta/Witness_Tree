import type { ReactNode } from "react";
import { AddressFinderClient } from "witness-tree";

/*
 * This control takes nothing but a locale, and by design it holds no state
 * until the reader submits: the address goes out as a POST body on submit, so
 * the candidate list, the resolved districts, the near-a-boundary mixture and
 * the two failure notes all live behind a network round trip that a static
 * card cannot perform. The initial state is therefore the canonical cell, and
 * it is the state that carries the component's whole point: the field, the
 * disabled submit, and the two notes saying the address is looked up and never
 * written into the page's own address, its links or its history.
 *
 * The cells sweep the axes that do render statically: locale, and the column
 * width the control has to survive.
 */

const Frame = ({ width, children }: { width: string; children: ReactNode }) => (
  <div style={{ maxWidth: width }}>{children}</div>
);

export const Initial = () => (
  <Frame width="40rem">
    <AddressFinderClient locale="en" />
  </Frame>
);

/** The width the control gets on a phone, where the notes wrap hardest. */
export const NarrowColumn = () => (
  <Frame width="20rem">
    <AddressFinderClient locale="en" />
  </Frame>
);

export const French = () => (
  <Frame width="40rem">
    <AddressFinderClient locale="fr" />
  </Frame>
);
