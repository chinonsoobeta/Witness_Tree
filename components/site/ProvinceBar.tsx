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

/** The official flags, as published: a province's own proportions, so none is stretched to fit. */
const FLAG_FILES = {
  bc: { src: "/flags/bc.svg", width: 5, height: 3 },
  ab: { src: "/flags/ab.svg", width: 2, height: 1 },
  on: { src: "/flags/on.svg", width: 2, height: 1 },
  qc: { src: "/flags/qc.svg", width: 3, height: 2 },
} as const satisfies Record<ExploreMapView, { src: string; width: number; height: number }>;

export function ProvinceFlag({ province, locale, id }: Readonly<{
  province: ExploreMapView;
  locale: Locale;
  /** Lets a page find this drawing again, as the harvest and fire PNG export does. */
  id?: string;
}>) {
  const { src, width, height } = FLAG_FILES[province];
  // eslint-disable-next-line @next/next/no-img-element -- A static vector flag needs no image service.
  return <img className="province-flag" id={id} src={src} width={width * 10} height={height * 10} alt={PROVINCES[province].flag[locale]} />;
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
  // The province is named beside its flag, so the flag's own label would only repeat it.
  const contents = <><span aria-hidden="true"><ProvinceFlag province={province} locale={locale} /></span><span>{PROVINCES[province].name[locale]}</span></>;
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
  onSelect?: (province: ExploreMapView | null) => void;
  placement?: "landing" | "map";
}>) {
  const label = locale === "en" ? "Province views" : "Vues provinciales";
  // On the map, "All" shows the four provinces together; a province shows that
  // province alone. The landing page lists the provinces and selects nothing.
  const all = onSelect ? (
    <button key="all" type="button" className="province-bar-all" aria-pressed={selected === null} onClick={() => onSelect(null)}>
      {locale === "en" ? "All" : "Toutes"}
    </button>
  ) : null;
  const items = [all, ...EXPLORE_MAP_VIEWS.map((province) => (
    <ProvinceItem key={province} province={province} locale={locale} selected={selected} onSelect={onSelect} />
  ))];
  return onSelect ? (
    <nav className={`province-bar province-bar--${placement}`} aria-label={label}>{items}</nav>
  ) : (
    <div className={`province-bar province-bar--${placement}`} role="list" aria-label={label}>{items}</div>
  );
}
