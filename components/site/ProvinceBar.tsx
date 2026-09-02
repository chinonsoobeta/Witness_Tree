import { EXPLORE_MAP_VIEWS, type ExploreMapView } from "@/lib/explore";
import type { Locale } from "@/lib/domain";

const PROVINCES = {
  bc: {
    name: { en: "British Columbia", fr: "Colombie-Britannique" },
    flag: { en: "Flag of British Columbia", fr: "Drapeau de la Colombie-Britannique" },
  },
  ab: {
    name: { en: "Alberta", fr: "Alberta" },
    flag: { en: "Flag of Alberta", fr: "Drapeau de l’Alberta" },
  },
  on: {
    name: { en: "Ontario", fr: "Ontario" },
    flag: { en: "Flag of Ontario", fr: "Drapeau de l’Ontario" },
  },
  qc: {
    name: { en: "Québec", fr: "Québec" },
    flag: { en: "Flag of Québec", fr: "Drapeau du Québec" },
  },
} as const;

function UnionJack({ x = 0, y = 0, width = 18, height = 11 }: Readonly<{
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}>) {
  const middleX = x + width / 2;
  const middleY = y + height / 2;
  return <>
    <rect x={x} y={y} width={width} height={height} fill="var(--flag-union-blue)" />
    <path d={`M${x} ${y} L${x + width} ${y + height} M${x + width} ${y} L${x} ${y + height}`} stroke="var(--flag-white)" strokeWidth="2.8" />
    <path d={`M${x} ${y} L${x + width} ${y + height} M${x + width} ${y} L${x} ${y + height}`} stroke="var(--flag-red)" strokeWidth="1.2" />
    <path d={`M${middleX} ${y} V${y + height} M${x} ${middleY} H${x + width}`} stroke="var(--flag-white)" strokeWidth="3.5" />
    <path d={`M${middleX} ${y} V${y + height} M${x} ${middleY} H${x + width}`} stroke="var(--flag-red)" strokeWidth="2" />
  </>;
}

function ProvinceFlag({ province, locale }: Readonly<{
  province: ExploreMapView;
  locale: Locale;
}>) {
  const label = PROVINCES[province].flag[locale];
  if (province === "bc") return (
    <svg className="province-flag" viewBox="0 0 36 22" role="img" aria-label={label}>
      <title>{label}</title>
      <rect width="36" height="22" fill="var(--flag-white)" />
      <UnionJack width={36} />
      <path d="M0 13 Q4 10 8 13 T16 13 T24 13 T32 13 T40 13 V16 Q36 13 32 16 T24 16 T16 16 T8 16 T0 16Z" fill="var(--flag-bc-blue)" />
      <path d="M12 22 A6 6 0 0 1 24 22Z" fill="var(--flag-gold)" />
      <path d="M18 13v5M13.5 15l3 3M22.5 15l-3 3" stroke="var(--flag-gold)" strokeWidth="1" />
      <path d="M15 7h6l-1 2h-4Z" fill="var(--flag-gold)" stroke="var(--flag-white)" strokeWidth=".5" />
    </svg>
  );
  if (province === "ab") return (
    <svg className="province-flag" viewBox="0 0 36 22" role="img" aria-label={label}>
      <title>{label}</title>
      <rect width="36" height="22" fill="var(--flag-alberta-blue)" />
      <path d="M12 4h12v9c0 3.5-2.5 5-6 6.5-3.5-1.5-6-3-6-6.5Z" fill="var(--flag-white)" stroke="var(--flag-wheat)" strokeWidth=".7" />
      <path d="M12.7 7h10.6M18 4.7v4.6" stroke="var(--flag-cross-red)" strokeWidth="1.1" />
      <path d="m13 13 4-3 2 2 2-1.5 2 2.5v2H13Z" fill="var(--flag-sky)" />
      <path d="m13 14 4-2 2 2 2-1 2 1.5V17H13Z" fill="var(--flag-green)" />
      <path d="M13 17h10v1H13Z" fill="var(--flag-wheat)" />
    </svg>
  );
  if (province === "on") return (
    <svg className="province-flag" viewBox="0 0 36 22" role="img" aria-label={label}>
      <title>{label}</title>
      <rect width="36" height="22" fill="var(--flag-red)" />
      <UnionJack width={18} height={11} />
      <path d="M23 11h9v5.5c0 2-2.1 3-4.5 4-2.4-1-4.5-2-4.5-4Z" fill="var(--flag-white)" stroke="var(--flag-ontario-gold)" strokeWidth=".6" />
      <path d="M23.5 14h8v4h-8Z" fill="var(--flag-ontario-green)" />
      <path d="M24.5 12.5h6M27.5 11.5v3" stroke="var(--flag-red)" strokeWidth=".8" />
      <circle cx="25" cy="17.2" r=".55" fill="var(--flag-ontario-gold)" />
      <circle cx="27.5" cy="17.2" r=".55" fill="var(--flag-ontario-gold)" />
      <circle cx="30" cy="17.2" r=".55" fill="var(--flag-ontario-gold)" />
    </svg>
  );
  return (
    <svg className="province-flag" viewBox="0 0 36 22" role="img" aria-label={label}>
      <title>{label}</title>
      <rect width="36" height="22" fill="var(--flag-quebec-blue)" />
      <path d="M15 0h6v22h-6ZM0 8h36v6H0Z" fill="var(--flag-white)" />
      {[{ x: 7.5, y: 5 }, { x: 28.5, y: 5 }, { x: 7.5, y: 17 }, { x: 28.5, y: 17 }].map(({ x, y }) => (
        <path key={`${x}-${y}`} d="M0-3c-1 1-1.2 2-.4 2.8-1.4-.2-2 .7-1.2 1.6.5.6 1.3.5 2 .1v1.8h1.2V.5c.7.4 1.5.5 2-.1.8-.9.2-1.8-1.2-1.6.8-.8.6-1.8-.4-2.8-.4 1.2-.8 1.7-1.4 2.2C.5-2.3.2-2.8 0-3Z" fill="var(--flag-white)" transform={`translate(${x} ${y})`} />
      ))}
    </svg>
  );
}

function ProvinceItem({
  province,
  locale,
  selected,
  onSelect,
}: Readonly<{
  province: ExploreMapView;
  locale: Locale;
  selected: ExploreMapView | null;
  onSelect?: (province: ExploreMapView) => void;
}>) {
  const contents = <><ProvinceFlag province={province} locale={locale} /><span>{PROVINCES[province].name[locale]}</span></>;
  return onSelect ? (
    <button type="button" aria-pressed={selected === province} onClick={() => onSelect(province)}>{contents}</button>
  ) : (
    <span className="province-bar-item" role="listitem">{contents}</span>
  );
}

export function ProvinceBar({
  locale,
  selected = null,
  onSelect,
  placement = "landing",
}: Readonly<{
  locale: Locale;
  selected?: ExploreMapView | null;
  onSelect?: (province: ExploreMapView) => void;
  placement?: "landing" | "map";
}>) {
  const label = locale === "en" ? "Province views" : "Vues provinciales";
  const items = EXPLORE_MAP_VIEWS.map((province) => (
    <ProvinceItem key={province} province={province} locale={locale} selected={selected} onSelect={onSelect} />
  ));
  return onSelect ? (
    <nav className={`province-bar province-bar--${placement}`} aria-label={label}>{items}</nav>
  ) : (
    <div className={`province-bar province-bar--${placement}`} role="list" aria-label={label}>{items}</div>
  );
}
