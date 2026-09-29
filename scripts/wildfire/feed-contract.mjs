/**
 * The snapshot contract for the four owner-admitted current-wildfire feeds. Endpoints live here and nowhere else:
 * a URL supplied at run time is not a cleared feed. Every rule rejects rather than repairs, so a feed that returns
 * nothing, a capped or partial page set, a changed schema or an unusable geometry fails that feed alone and the
 * snapshot store keeps serving its last good data.
 *
 * Raw snapshots keep every record the agency returned. The BC V10755 quarantine and the rule that a provincial
 * agency prevails over CWFIS within its province both apply when records are released or displayed, never here,
 * because the raw archive must stay an unaltered copy of what was published.
 */

const TIMEOUT_MS = 60_000;
const MAX_PAGES = 50;
const USER_AGENT = 'WitnessTree-wildfire-refresh (+https://github.com/chinonsoobeta/Witness_Tree)';
// Generous bounds around Canada, in degrees. A coordinate outside them means a projection or axis-order change.
const CANADA = { west: -142, east: -52, south: 41, north: 84 };

export const FEED_CONTRACT = Object.freeze([
  Object.freeze({
    id: 'cwfis-current',
    agency: 'Natural Resources Canada, Canadian Wildland Fire Information System',
    kind: 'wfs',
    endpoint: 'https://geoserver.cwfif.nrcan.gc.ca/geoserver/ows',
    typeName: 'public:cwfif_national_activefires',
    crs: 'urn:ogc:def:crs:EPSG::3978',
    // The server's CountDefault. A result that reaches it may have been cut off.
    maxFeatures: 10000,
    idField: 'id',
    geometry: ['Point'],
    fields: ['id', 'agency_code', 'region_code', 'national_fire_id', 'agency_fire_id', 'national_fire_cause', 'fire_type_ics',
      'severity_nearest_dsr', 'fire_was_prescribed', 'percent_contained', 'fire_size', 'response_type', 'stage_of_control_status',
      'situation_report_date', 'status_date', 'latitude', 'longitude', 'fire_year', 'status_year', 'record_start', 'record_end'],
  }),
  Object.freeze({
    id: 'bc-wildfire',
    agency: 'Government of British Columbia, BC Wildfire Service',
    kind: 'arcgis',
    layer: 'https://services6.arcgis.com/ubm4tcTYICKBpist/ArcGIS/rest/services/BCWS_FirePerimeters_PublicView/FeatureServer/0',
    pageSize: 1000,
    idField: 'OBJECTID',
    geometry: ['Polygon', 'MultiPolygon'],
    fields: ['FIRE_NUMBER', 'VERSION_NUMBER', 'FIRE_YEAR', 'FIRE_SIZE_HECTARES', 'SOURCE', 'TRACK_DATE', 'LOAD_DATE', 'FIRE_STATUS',
      'FEATURE_CODE', 'FEATURE_AREA_SQM', 'FEATURE_LENGTH_M', 'OBJECTID', 'GlobalID', 'Shape__Area', 'Shape__Length', 'FIRE_URL'],
  }),
  Object.freeze({
    id: 'ab-wildfire',
    agency: 'Government of Alberta, Alberta Wildfire',
    kind: 'arcgis',
    layer: 'https://geospatial.alberta.ca/mimas/rest/services/wildfire/alberta_fire_status/FeatureServer/0',
    pageSize: 1000,
    idField: 'OBJECTID',
    geometry: ['Point'],
    fields: ['LABEL', 'FIRE_NUMBER', 'FIRE_TYPE', 'FIRE_STATUS', 'RESP_AREA', 'RESPONSE_TYPE', 'INCIDENT_TYPE', 'AREA_ESTIMATE',
      'ASSESSMENT_ASSISTANCE_DATE', 'GENERAL_CAUSE', 'LATITUDE', 'LONGITUDE', 'FIRE_STATUS_DATE', 'FIRE_YEAR', 'CO_FLAG', 'SIZE_CLASS', 'OBJECTID'],
  }),
  Object.freeze({
    id: 'on-fire-disturbance',
    agency: 'Government of Ontario, Land Information Ontario',
    kind: 'arcgis',
    layer: 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/51',
    pageSize: 2000,
    idField: 'OBJECTID',
    geometry: ['Polygon', 'MultiPolygon'],
    fields: ['OBJECTID', 'FIRENUMB', 'CUR_SIZE', 'REFERENCE', 'FIRETYPE', 'STATUS', 'DATE_MAPPED'],
  }),
]);

export class FeedRejected extends Error {}

const reject = (feed, why) => {
  throw new FeedRejected(`${feed.id}: ${why}`);
};

async function getJson(fetchImpl, url, feed) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    reject(feed, `request failed: ${error?.message ?? error}`);
  }
  if (!response.ok) reject(feed, `HTTP ${response.status}`);
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    reject(feed, 'response is not JSON');
  }
  // ArcGIS reports query failures as HTTP 200 with an error object.
  if (body?.error) reject(feed, `service error: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body;
}

const inCanada = (lon, lat) => Number.isFinite(lon) && Number.isFinite(lat)
  && lon >= CANADA.west && lon <= CANADA.east && lat >= CANADA.south && lat <= CANADA.north;

function positions(coordinates, out = []) {
  if (!Array.isArray(coordinates)) return out;
  if (typeof coordinates[0] === 'number' || coordinates.length === 0) out.push(coordinates);
  else for (const child of coordinates) positions(child, out);
  return out;
}

function validateFeatures(feed, features) {
  if (!Array.isArray(features) || features.length === 0) reject(feed, 'empty: no features returned');
  const expected = new Set(feed.fields);
  const ids = new Set();
  features.forEach((feature, index) => {
    const where = `feature ${index}`;
    if (feature?.type !== 'Feature' || feature.properties == null || typeof feature.properties !== 'object') reject(feed, `${where} is not a GeoJSON Feature with properties`);
    const keys = Object.keys(feature.properties);
    const missing = feed.fields.filter((field) => !(field in feature.properties));
    const unexpected = keys.filter((key) => !expected.has(key));
    if (missing.length || unexpected.length) {
      reject(feed, `schema drift at ${where}: missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}]`);
    }
    const id = feature.properties[feed.idField];
    if (id == null || ids.has(id)) reject(feed, `${where} has a missing or duplicate ${feed.idField} (${id})`);
    ids.add(id);
    const type = feature.geometry?.type;
    if (!feed.geometry.includes(type)) reject(feed, `${where} has geometry ${type ?? 'null'}, expected ${feed.geometry.join(' or ')}`);
    const points = positions(feature.geometry.coordinates);
    if (points.length === 0 || points.some((point) => point.length < 2 || !point.every(Number.isFinite))) reject(feed, `${where} has invalid coordinates`);
    // CWFIS geometry is projected (EPSG:3978), so its published latitude and longitude are what can be bounded.
    const located = feed.kind === 'wfs'
      ? inCanada(feature.properties.longitude, feature.properties.latitude)
      : points.every(([lon, lat]) => inCanada(lon, lat));
    if (!located) reject(feed, `${where} lies outside Canada, so the coordinate reference has changed`);
  });
}

async function fetchArcgis(feed, fetchImpl) {
  const query = (params) => `${feed.layer}/query?${new URLSearchParams({ where: '1=1', ...params })}`;
  const count = async () => {
    const body = await getJson(fetchImpl, query({ returnCountOnly: 'true', f: 'json' }), feed);
    if (!Number.isInteger(body?.count)) reject(feed, 'feature count is missing');
    return body.count;
  };
  const expected = await count();
  if (expected === 0) reject(feed, 'empty: the service reports no features');
  const features = [];
  let pages = 0;
  for (;;) {
    if (pages === MAX_PAGES) reject(feed, `still capped after ${MAX_PAGES} pages`);
    const page = await getJson(fetchImpl, query({
      outFields: '*', returnGeometry: 'true', outSR: '4326', orderByFields: `${feed.idField} ASC`,
      resultOffset: String(features.length), resultRecordCount: String(feed.pageSize), f: 'geojson',
    }), feed);
    pages += 1;
    if (page?.type !== 'FeatureCollection' || !Array.isArray(page.features)) reject(feed, `page ${pages} is not a GeoJSON FeatureCollection`);
    features.push(...page.features);
    // The flag appears at the top level on some servers and under properties on others.
    const capped = page.exceededTransferLimit === true || page.properties?.exceededTransferLimit === true;
    if (!capped) break;
    if (page.features.length === 0) reject(feed, `page ${pages} is capped but returned no features`);
  }
  if (features.length !== expected) reject(feed, `partial: ${features.length} features returned, service reports ${expected}`);
  const after = await count();
  if (after !== expected) reject(feed, `the feed changed while paging (${expected} before, ${after} after)`);
  validateFeatures(feed, features);
  return {
    response: { type: 'FeatureCollection', features },
    sourceResponse: { agency: feed.agency, endpoint: feed.layer, featureCount: features.length, pages },
  };
}

async function fetchWfs(feed, fetchImpl, now) {
  // The layer holds every record version since the service began, so only the records valid at this instant are current.
  const instant = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const url = `${feed.endpoint}?${new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: feed.typeName, outputFormat: 'application/json',
    count: String(feed.maxFeatures), CQL_FILTER: `record_start<='${instant}' AND record_end>='${instant}'`,
  })}`;
  const body = await getJson(fetchImpl, url, feed);
  if (body?.type !== 'FeatureCollection' || !Array.isArray(body.features)) reject(feed, 'response is not a GeoJSON FeatureCollection');
  if (body.crs?.properties?.name !== feed.crs) reject(feed, `coordinate reference ${body.crs?.properties?.name ?? 'missing'}, expected ${feed.crs}`);
  const { numberMatched, numberReturned } = body;
  if (!Number.isInteger(numberMatched) || !Number.isInteger(numberReturned)) reject(feed, 'numberMatched or numberReturned is missing');
  if (numberMatched === 0) reject(feed, 'empty: no records are current at this instant');
  if (numberMatched >= feed.maxFeatures) reject(feed, `capped: ${numberMatched} records reach the ${feed.maxFeatures} limit`);
  if (numberReturned !== numberMatched || body.features.length !== numberMatched) {
    reject(feed, `partial: ${body.features.length} features returned, ${numberMatched} matched`);
  }
  validateFeatures(feed, body.features);
  return {
    response: body,
    sourceResponse: { agency: feed.agency, endpoint: feed.endpoint, asOf: instant, featureCount: body.features.length, pages: 1 },
  };
}

export function fetchFeed({ feed, fetchImpl = globalThis.fetch, now = new Date() }) {
  if (feed.kind === 'arcgis') return fetchArcgis(feed, fetchImpl);
  if (feed.kind === 'wfs') return fetchWfs(feed, fetchImpl, now);
  return reject(feed, `unknown feed kind ${feed.kind}`);
}

/** Fetch every admitted feed. A rejected feed becomes an error entry, so the others still publish. */
export async function fetchAdmittedFeeds({ fetchImpl = globalThis.fetch, now = new Date(), feeds = FEED_CONTRACT } = {}) {
  return Promise.all(feeds.map(async (feed) => {
    try {
      return { id: feed.id, ...(await fetchFeed({ feed, fetchImpl, now })) };
    } catch (error) {
      const message = String(error?.message ?? error);
      return { id: feed.id, error: message, sourceResponse: { agency: feed.agency, rejected: message } };
    }
  }));
}
