import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ARCHIVE_FEEDS } from '../scripts/wildfire/archive-plan.mjs';
import { FEED_CONTRACT, fetchAdmittedFeeds, fetchFeed } from '../scripts/wildfire/feed-contract.mjs';
import { configuredSources, refreshWildfire } from '../scripts/wildfire/refresh.mjs';

const feed = (id) => FEED_CONTRACT.find((entry) => entry.id === id);
const now = new Date('2026-09-13T17:00:00.250Z');

function arcgisFeature(contract, objectId, overrides = {}) {
  const properties = Object.fromEntries(contract.fields.map((field) => [field, `${field}-${objectId}`]));
  properties[contract.idField] = objectId;
  const geometry = contract.geometry[0] === 'Point'
    ? { type: 'Point', coordinates: [-114, 50] }
    : { type: 'Polygon', coordinates: [[[-120, 50], [-119, 50], [-119, 51], [-120, 50]]] };
  return { type: 'Feature', id: objectId, geometry, properties, ...overrides };
}

function wfsFeature(objectId) {
  const contract = feed('cwfis-current');
  const properties = Object.fromEntries(contract.fields.map((field) => [field, `${field}-${objectId}`]));
  Object.assign(properties, { id: objectId, latitude: 52.9, longitude: -122.1 });
  return { type: 'Feature', id: `fid-${objectId}`, geometry: { type: 'Point', coordinates: [-1743577.24, 807027.4] }, properties };
}

const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

// A stand-in ArcGIS layer: `features` is the whole layer, served in pages no larger than `serverCap`.
function arcgisServer({ features, serverCap = Infinity, countAfter, mutatePage = (page) => page, status = 200, raw }) {
  const calls = [];
  let counts = 0;
  const fetchImpl = async (url) => {
    calls.push(url);
    if (raw !== undefined) return reply(raw, status);
    const params = new URL(url).searchParams;
    if (params.get('returnCountOnly') === 'true') {
      counts += 1;
      return reply({ count: counts > 1 && countAfter !== undefined ? countAfter : features.length });
    }
    const offset = Number(params.get('resultOffset'));
    const size = Math.min(Number(params.get('resultRecordCount')), serverCap);
    const slice = features.slice(offset, offset + size);
    const page = { type: 'FeatureCollection', features: slice };
    if (offset + slice.length < features.length) page.properties = { exceededTransferLimit: true };
    return reply(mutatePage(page, offset), status);
  };
  return { calls, fetchImpl };
}

test('the contract names exactly the four owner-admitted feeds, over HTTPS, and never SOPFEU', () => {
  assert.deepEqual(FEED_CONTRACT.map((entry) => entry.id).sort(), [...ARCHIVE_FEEDS].sort());
  assert.ok(!FEED_CONTRACT.some((entry) => /sopfeu/i.test(JSON.stringify(entry))));
  for (const entry of FEED_CONTRACT) {
    assert.match(entry.layer ?? entry.endpoint, /^https:\/\//);
    assert.ok(entry.fields.includes(entry.idField));
  }
});

test('an ArcGIS feed is paged in stable order until the service stops reporting a cap, keeping every raw record', async () => {
  const bc = feed('bc-wildfire');
  const features = [1, 2, 3, 4, 5].map((id) => arcgisFeature(bc, id));
  features[2].properties.FIRE_NUMBER = 'V10755';
  const server = arcgisServer({ features, serverCap: 2 });
  const result = await fetchFeed({ feed: bc, fetchImpl: server.fetchImpl, now });
  assert.equal(result.response.features.length, 5);
  assert.ok(result.response.features.some((feature) => feature.properties.FIRE_NUMBER === 'V10755'), 'quarantine is a release rule, not a raw-capture rule');
  assert.deepEqual(result.sourceResponse, { agency: bc.agency, endpoint: bc.layer, featureCount: 5, pages: 3 });
  const pages = server.calls.map((url) => new URL(url).searchParams).filter((params) => params.get('f') === 'geojson');
  assert.deepEqual(pages.map((params) => params.get('resultOffset')), ['0', '2', '4']);
  assert.ok(pages.every((params) => params.get('orderByFields') === 'OBJECTID ASC' && params.get('outSR') === '4326'));
});

test('an ArcGIS feed is rejected when empty, capped, partial, changing, drifted, misplaced or broken', async () => {
  const ab = feed('ab-wildfire');
  const on = feed('on-fire-disturbance');
  const three = () => [1, 2, 3].map((id) => arcgisFeature(ab, id));
  const cases = [
    ['empty', { features: [] }, /empty/],
    ['capped with nothing returned', { features: three(), mutatePage: (page) => ({ ...page, features: [], properties: { exceededTransferLimit: true } }) }, /capped but returned no features/],
    ['partial', { features: three(), mutatePage: (page) => ({ type: 'FeatureCollection', features: page.features.slice(0, 2) }) }, /partial: 2 features returned, service reports 3/],
    ['changed while paging', { features: three(), countAfter: 4 }, /changed while paging/],
    ['missing field', { features: three().map((feature) => { delete feature.properties.FIRE_STATUS; return feature; }) }, /schema drift .*missing \[FIRE_STATUS\]/],
    ['added field', { features: three().map((feature) => ({ ...feature, properties: { ...feature.properties, NEW_FIELD: 1 } })) }, /schema drift .*unexpected \[NEW_FIELD\]/],
    ['duplicate id', { features: [arcgisFeature(ab, 1), arcgisFeature(ab, 1)] }, /duplicate OBJECTID/],
    ['null geometry', { features: [arcgisFeature(ab, 1, { geometry: null })] }, /geometry null/],
    ['wrong geometry', { features: [arcgisFeature(ab, 1, { geometry: { type: 'Polygon', coordinates: [[[-114, 50], [-113, 50], [-113, 51], [-114, 50]]] } })] }, /geometry Polygon, expected Point/],
    ['swapped axes', { features: [arcgisFeature(ab, 1, { geometry: { type: 'Point', coordinates: [50, -114] } })] }, /outside Canada/],
    ['non-finite coordinate', { features: [arcgisFeature(ab, 1, { geometry: { type: 'Point', coordinates: [-114, null] } })] }, /invalid coordinates/],
    ['HTTP failure', { features: three(), status: 503, raw: 'unavailable' }, /HTTP 503/],
    ['HTML error page', { features: three(), raw: '<html>maintenance</html>' }, /not JSON/],
    ['service error in a 200', { features: three(), raw: { error: { code: 400, message: 'Invalid query' } } }, /service error: Invalid query/],
  ];
  for (const [name, server, pattern] of cases) {
    await assert.rejects(() => fetchFeed({ feed: ab, fetchImpl: arcgisServer(server).fetchImpl, now }), pattern, name);
  }
  const multipolygon = arcgisFeature(on, 1, { geometry: { type: 'MultiPolygon', coordinates: [[[[-84, 46], [-83, 46], [-83, 47], [-84, 46]]]] } });
  assert.equal((await fetchFeed({ feed: on, fetchImpl: arcgisServer({ features: [multipolygon] }).fetchImpl, now })).response.features.length, 1);
});

test('CWFIS is read at the refresh instant and rejected unless every matched record came back in the admitted projection', async () => {
  const cwfis = feed('cwfis-current');
  const collection = (overrides = {}) => ({
    type: 'FeatureCollection', numberMatched: 2, numberReturned: 2, features: [wfsFeature(1), wfsFeature(2)],
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3978' } }, ...overrides,
  });
  const urls = [];
  const ok = await fetchFeed({ feed: cwfis, now, fetchImpl: async (url) => { urls.push(url); return reply(collection()); } });
  assert.equal(ok.response.features.length, 2);
  assert.equal(ok.sourceResponse.asOf, '2026-09-13T17:00:00Z');
  const params = new URL(urls[0]).searchParams;
  assert.equal(params.get('CQL_FILTER'), "record_start<='2026-09-13T17:00:00Z' AND record_end>='2026-09-13T17:00:00Z'");
  assert.equal(params.get('outputFormat'), 'application/json');
  const cases = [
    ['empty', collection({ numberMatched: 0, numberReturned: 0, features: [] }), /empty/],
    ['partial', collection({ numberMatched: 3 }), /partial/],
    ['capped', collection({ numberMatched: 10000, numberReturned: 10000 }), /capped/],
    ['projection drift', collection({ crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } } }), /coordinate reference/],
    ['schema drift', collection({ features: [wfsFeature(1), { ...wfsFeature(2), properties: { id: 2, latitude: 50, longitude: -120 } }] }), /schema drift/],
    ['outside Canada', collection({ features: [wfsFeature(1), { ...wfsFeature(2), properties: { ...wfsFeature(2).properties, latitude: -33 } }] }), /outside Canada/],
  ];
  for (const [name, body, pattern] of cases) {
    await assert.rejects(() => fetchFeed({ feed: cwfis, now, fetchImpl: async () => reply(body) }), pattern, name);
  }
});

test('one rejected feed fails alone, and the store keeps serving its last good snapshot', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wildfire-feed-contract-'));
  const layers = Object.fromEntries(FEED_CONTRACT.filter((entry) => entry.kind === 'arcgis').map((entry) => [entry.layer, arcgisServer({ features: [arcgisFeature(entry, 1)] })]));
  const cwfisBody = { type: 'FeatureCollection', numberMatched: 1, numberReturned: 1, features: [wfsFeature(1)], crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3978' } } };
  let bcBroken = false;
  const fetchImpl = async (url) => {
    if (url.startsWith(feed('cwfis-current').endpoint)) return reply(cwfisBody);
    const layer = Object.keys(layers).find((key) => url.startsWith(`${key}/`));
    if (bcBroken && layer === feed('bc-wildfire').layer) return reply('down', 502);
    return layers[layer].fetchImpl(url);
  };
  const first = await refreshWildfire({ root: directory, now, fetchSources: () => fetchAdmittedFeeds({ fetchImpl, now }) });
  assert.equal(first.ok, true);
  assert.equal(first.current.snapshots.length, 4);
  bcBroken = true;
  const later = new Date(now.getTime() + 60_000);
  const second = await refreshWildfire({ root: directory, now: later, fetchSources: () => fetchAdmittedFeeds({ fetchImpl, now: later }) });
  assert.equal(second.ok, true);
  assert.equal(second.current.snapshots.length, 3);
  assert.ok(second.current.sources.some((source) => source.id === 'bc-wildfire'), 'BC keeps its last good data');
  const status = JSON.parse(await readFile(path.join(directory, 'current-status.json'), 'utf8'));
  const bc = status.sources.find((source) => source.id === 'bc-wildfire');
  assert.equal(bc.status, 'retrying');
  assert.match(bc.error, /bc-wildfire: HTTP 502/);
  assert.equal(second.current.sourceResponses['bc-wildfire'].rejected, 'bc-wildfire: HTTP 502');
});

test('a run-time endpoint list stops the refresh before any request is made', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests += 1; return reply({}); };
  await assert.rejects(
    () => configuredSources({ env: { WILDFIRE_SOURCE_URLS: '[{"id":"sopfeu","url":"https://example.test"}]' }, fetchImpl, now }),
    /WILDFIRE_SOURCE_URLS is set/,
  );
  assert.equal(requests, 0);
});
