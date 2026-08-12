# CI checks

Every push and pull request runs on Node 22. The workflow installs the locked
dependencies with `npm ci`, then runs the TypeScript check, lint, bilingual
parity gate, production build, and all executable Node tests.

## Bilingual parity

Run `node scripts/check-bilingual.mjs` locally. It requires these route pairs:

- `/en` and `/fr`
- `/en/components` and `/fr/composants`
- `/en/methods` and `/fr/methodes`
- `/en/data` and `/fr/donnees`

Each route must exist and include its matching `locale="en"` or `locale="fr"`
translation token with visible page content.
