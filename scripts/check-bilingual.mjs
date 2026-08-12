import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_ROUTE_PAIRS = [
  { en: '/en', fr: '/fr' },
  { en: '/en/components', fr: '/fr/composants' },
  { en: '/en/methods', fr: '/fr/methodes' },
  { en: '/en/data', fr: '/fr/donnees' },
];

const sourceExtensions = ['.tsx', '.ts', '.jsx', '.js'];

async function routeFile(routesRoot, route) {
  const directory = path.join(routesRoot, route.replace(/^\//, ''));
  for (const extension of sourceExtensions) {
    const candidate = path.join(directory, `page${extension}`);
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

function hasLocaleContent(source, locale) {
  return source.includes(`locale="${locale}"`) && /<[a-z][^>]*>[^<\s]/i.test(source);
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
    if (!hasLocaleContent(english, 'en')) failures.push(`${pair.en}: missing required English translation token or content`);
    if (!hasLocaleContent(french, 'fr')) failures.push(`${pair.fr}: missing required French translation token or content`);
  }

  if (failures.length) throw new Error(`Bilingual parity check failed:\n- ${failures.join('\n- ')}`);
  return { pairs: pairs.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkBilingual();
  console.log(`Bilingual parity passed for ${result.pairs} route pairs.`);
}
