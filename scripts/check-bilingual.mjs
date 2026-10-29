import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_ROUTE_PAIRS = [
  { en: '/en', fr: '/fr' },
  { en: '/en/components', fr: '/fr/composants' },
  { en: '/en/methods', fr: '/fr/methodes' },
  { en: '/en/data', fr: '/fr/donnees' },
  { en: '/en/data/official-harvest-comparison', fr: '/fr/donnees/comparaison-recolte-officielle' },
  { en: '/en/data/bc-harvest-volume', fr: '/fr/donnees/volume-recolte-bc' },
  { en: '/en/data/provincial-harvest-volume', fr: '/fr/donnees/volume-recolte-provinces' },
  { en: '/en/data/harvest-and-fire', fr: '/fr/donnees/recolte-et-incendies' },
  { en: '/en/unknown', fr: '/fr/inconnu' },
  { en: '/en/compare', fr: '/fr/comparer' },
  { en: '/en/wildfire', fr: '/fr/incendies' },
  { en: '/en/account', fr: '/fr/compte' },
  { en: '/en/explore', fr: '/fr/explorer' },
  { en: '/en/search', fr: '/fr/recherche' },
  { en: '/en/places/[dataVersion]/[geography]/[code]', fr: '/fr/lieux/[dataVersion]/[geography]/[code]' },
  { en: '/en/places/[dataVersion]/[geography]/[code]/print', fr: '/fr/lieux/[dataVersion]/[geography]/[code]/print' },
  { en: '/en/components/example-places/[placeId]', fr: '/fr/composants/exemples-lieux/[placeId]' },
  { en: '/en/location/[locationId]', fr: '/fr/emplacement/[locationId]' },
  { en: '/en/glossary', fr: '/fr/glossaire' },
  { en: '/en/corrections', fr: '/fr/corrections' },
  { en: '/en/terms', fr: '/fr/conditions' },
  { en: '/en/embed/[dataVersion]/[geography]/[code]', fr: '/fr/integrer/[dataVersion]/[geography]/[code]' },
];

const sourceExtensions = ['.tsx', '.ts', '.jsx', '.js'];

// A route is a page, or a route handler that serves a whole document itself
// (the embedded figure, which carries no Next.js runtime).
async function routeFile(routesRoot, route) {
  const directory = path.join(routesRoot, route.replace(/^\//, ''));
  for (const name of ['page', 'route']) {
    for (const extension of sourceExtensions) {
      const candidate = path.join(directory, `${name}${extension}`);
      try {
        await access(candidate);
        return candidate;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  return null;
}

// A page renders its locale's shell; a route handler's GET passes its locale to the renderer.
function hasLocaleContent(source, locale, file) {
  if (path.basename(file).startsWith('route.')) {
    return /export\s+(?:async\s+)?function\s+GET\b/.test(source) && new RegExp(`\\(\\s*"${locale}"`).test(source);
  }
  return source.includes(`locale="${locale}"`) && /export\s+default\s+(?:async\s+)?function/.test(source);
}

export async function checkBilingual({ routesRoot, pairs = REQUIRED_ROUTE_PAIRS } = {}) {
  const root = routesRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app');
  const failures = [];

  for (const pair of pairs) {
    const [englishFile, frenchFile] = await Promise.all([routeFile(root, pair.en), routeFile(root, pair.fr)]);
    if (!englishFile || !frenchFile) {
      failures.push(`${pair.en} ↔ ${pair.fr}: missing ${!englishFile ? pair.en : pair.fr} route`);
      continue;
    }
    const [english, french] = await Promise.all([readFile(englishFile, 'utf8'), readFile(frenchFile, 'utf8')]);
    if (!hasLocaleContent(english, 'en', englishFile)) failures.push(`${pair.en}: missing required English translation token or content`);
    if (!hasLocaleContent(french, 'fr', frenchFile)) failures.push(`${pair.fr}: missing required French translation token or content`);
  }

  if (failures.length) throw new Error(`Bilingual parity check failed:\n- ${failures.join('\n- ')}`);
  return { pairs: pairs.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkBilingual();
  console.log(`Bilingual parity passed for ${result.pairs} route pairs.`);
}
