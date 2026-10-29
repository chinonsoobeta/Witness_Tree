import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkBilingual, REQUIRED_ROUTE_PAIRS } from '../scripts/check-bilingual.mjs';

async function fixture(routes) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bilingual-parity-'));
  for (const [route, content] of Object.entries(routes)) {
    const directory = path.join(root, route.replace(/^\//, ''));
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'page.tsx'), content);
  }
  return root;
}

const english = 'export default function Page() { return <SiteShell locale="en"><main>English content</main></SiteShell>; }';
const french = 'export default function Page() { return <SiteShell locale="fr"><main>Contenu français</main></SiteShell>; }';

const completeRoutes = Object.fromEntries(REQUIRED_ROUTE_PAIRS.flatMap(({ en, fr }) => [[en, english], [fr, french]]));

test('parity passes when every required route has translated content', async () => {
  const root = await fixture(completeRoutes);
  assert.deepEqual(await checkBilingual({ routesRoot: root }), { pairs: REQUIRED_ROUTE_PAIRS.length });
});

test('parity fails when an injected fixture lacks the French counterpart route', async () => {
  const { '/fr/composants': omitted, ...missingFrenchComponent } = completeRoutes;
  void omitted;
  const root = await fixture(missingFrenchComponent);
  await assert.rejects(
    () => checkBilingual({ routesRoot: root }),
    /\/en\/components ↔ \/fr\/composants: missing \/fr\/composants route/,
  );
});

test('parity fails when a route lacks its required locale token or content', async () => {
  const root = await fixture({ ...completeRoutes, '/fr/composants': '<main>Contenu français</main>' });
  await assert.rejects(() => checkBilingual({ routesRoot: root }), /missing required French translation token or content/);
});

// The embedded figure is a route handler that serves its whole document, so a
// pair may be two route files; each must answer GET in its own language.
test('parity reads a route handler pair, and fails one that does not pass its own locale', async () => {
  const pair = { en: '/en/embed/[code]', fr: '/fr/integrer/[code]' };
  const handler = (locale) => `export function GET(request, { params }) { return embedResponse("${locale}", params); }`;
  const write = async (routes) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'bilingual-parity-'));
    for (const [route, content] of Object.entries(routes)) {
      await mkdir(path.join(root, route.replace(/^\//, '')), { recursive: true });
      await writeFile(path.join(root, route.replace(/^\//, ''), 'route.ts'), content);
    }
    return root;
  };
  assert.deepEqual(await checkBilingual({ routesRoot: await write({ [pair.en]: handler('en'), [pair.fr]: handler('fr') }), pairs: [pair] }), { pairs: 1 });
  const mislabelled = await write({ [pair.en]: handler('en'), [pair.fr]: handler('en') });
  await assert.rejects(
    () => checkBilingual({ routesRoot: mislabelled, pairs: [pair] }),
    /\/fr\/integrer\/\[code\]: missing required French translation token or content/,
  );
});
