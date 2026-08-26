import type { Metadata } from "next";

export const metadata: Metadata = {
  other: { "content-language": "en" },
};

export default function EnglishLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div lang="en">{children}</div>;
}
