import type { Metadata } from "next";

export const metadata: Metadata = {
  other: { "content-language": "fr" },
};

export default function FrenchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div lang="fr">{children}</div>;
}
