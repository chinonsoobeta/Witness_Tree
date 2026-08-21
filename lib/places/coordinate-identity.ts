const COORDINATE_PRECISION = 6;

export function coordinatePermalinkId(latitude: number, longitude: number): string {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("Coordinate permalink latitude must be finite and within -90..90.");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Coordinate permalink longitude must be finite and within -180..180.");
  const encode = (value: number) => {
    const normalized = Object.is(value, -0) ? 0 : value;
    return `${normalized < 0 ? "n" : "p"}${Math.abs(normalized).toFixed(COORDINATE_PRECISION).replace(".", "d")}`;
  };
  return `lat-${encode(latitude)}-lon-${encode(longitude)}`;
}
