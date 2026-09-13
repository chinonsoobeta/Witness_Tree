import type { ReactNode } from "react";
import { SourceCurrency } from "witness-tree";

// SourceCurrency is a section, not a page, and it reads the NRCan probe record
// directly, so the only prop is locale. In the product it is always mounted
// inside DataPage's `main.page-wrap`, which is what gives the section its
// column and vertical rhythm, so every cell reproduces that wrapper rather
// than rendering the section stranded at full bleed.
const InPage = ({ children }: { children: ReactNode }) => (
  <main className="page-wrap">{children}</main>
);

export const English = () => (
  <InPage>
    <SourceCurrency locale="en" />
  </InPage>
);

export const French = () => (
  <InPage>
    <SourceCurrency locale="fr" />
  </InPage>
);
