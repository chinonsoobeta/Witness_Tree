"use client";

import type { Locale } from "@/lib/domain";

export function ReaderLocalTime({ dateTime, locale }: Readonly<{ dateTime: string; locale: Locale }>) {
  const label = new Intl.DateTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(dateTime));
  return <time dateTime={dateTime} suppressHydrationWarning>{label}</time>;
}
