// Inverse Lambert Conformal Conic (2SP) on GRS 1980, for the national grid:
//   +proj=lcc +lat_0=49 +lon_0=-95 +lat_1=49 +lat_2=77 +datum=NAD83
//
// The tile writer needs lon/lat and the geometry is in projected metres, so
// this runs once per vertex across hundreds of millions of patches. Shelling
// out to gdaltransform per feature is not an option, so the inverse is done
// here and checked against gdaltransform in tests/phase2-lcc.test.mjs.

const A = 6378137; // GRS 1980 semi-major axis, metres
const F = 1 / 298.257222101; // GRS 1980 inverse flattening
const E = Math.sqrt(2 * F - F * F); // first eccentricity
const DEG = Math.PI / 180;

const LAT_0 = 49 * DEG;
const LON_0 = -95 * DEG;
const LAT_1 = 49 * DEG;
const LAT_2 = 77 * DEG;

const m = (lat) => Math.cos(lat) / Math.sqrt(1 - E * E * Math.sin(lat) ** 2);
const t = (lat) => Math.tan(Math.PI / 4 - lat / 2) / ((1 - E * Math.sin(lat)) / (1 + E * Math.sin(lat))) ** (E / 2);

const M1 = m(LAT_1);
const M2 = m(LAT_2);
const T1 = t(LAT_1);
const T2 = t(LAT_2);
const T0 = t(LAT_0);

// Standard parallels differ, so n comes from the two-parallel form.
export const N = (Math.log(M1) - Math.log(M2)) / (Math.log(T1) - Math.log(T2));
const BIG_F = M1 / (N * T1 ** N);
const RHO_0 = A * BIG_F * T0 ** N;

/** Projected metres to [longitude, latitude] in degrees. */
export function inverseLcc(x, y) {
  const dy = RHO_0 - y;
  const rho = Math.sign(N) * Math.sqrt(x * x + dy * dy);
  const theta = Math.atan2(Math.sign(N) * x, Math.sign(N) * dy);
  const tValue = (rho / (A * BIG_F)) ** (1 / N);

  // Snyder's iterative latitude solution; the series converges in a handful of
  // rounds at these eccentricities, and the loop is bounded so a pathological
  // input cannot hang a run of hundreds of millions of vertices.
  let lat = Math.PI / 2 - 2 * Math.atan(tValue);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const sin = Math.sin(lat);
    const next = Math.PI / 2 - 2 * Math.atan(tValue * ((1 - E * sin) / (1 + E * sin)) ** (E / 2));
    if (Math.abs(next - lat) < 1e-12) {
      lat = next;
      break;
    }
    lat = next;
  }
  return [(theta / N + LON_0) / DEG, lat / DEG];
}
