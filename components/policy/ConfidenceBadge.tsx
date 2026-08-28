import type { ConfidenceResult, Locale } from "@/lib/domain";

const CONFIDENCE_LABELS = {
  high: { en: "High", fr: "Élevée" },
  medium: { en: "Medium", fr: "Moyenne" },
  limited: { en: "Limited", fr: "Limitée" },
  unknown: { en: "Unknown", fr: "Inconnue" },
} as const;

const CONFIDENCE_BARS = {
  high: 3,
  medium: 2,
  limited: 1,
  unknown: 0,
} as const;

export type ConfidenceBadgeProps = Readonly<{
  confidence: ConfidenceResult;
  locale: Locale;
}>;

export function ConfidenceBadge({ confidence, locale }: ConfidenceBadgeProps) {
  const label = CONFIDENCE_LABELS[confidence.level][locale];
  const reason = confidence.reason[locale];
  const filledBars = CONFIDENCE_BARS[confidence.level];

  return (
    <button type="button" className="confidence" aria-label={`${label}: ${reason}`} title={reason}>
      <span>{label}</span>{" "}
      <span className="confidence-bars" aria-hidden="true">
        {[0, 1, 2].map((bar) => (
          <span key={bar}>{bar < filledBars ? "▮" : "▯"}</span>
        ))}
      </span>
      <span className="sr-only">{reason}</span>
    </button>
  );
}
