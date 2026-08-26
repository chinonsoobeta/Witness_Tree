# Rename proof

`node scripts/check-rename-proof.mjs` rejects either display name from durable route segments, fixture identifiers, download and release identifiers, archive keys, and share-image filenames. It deliberately does not scan display copy or the centralized product-name token; those remain the responsibility of the brand-token gate.

`tests/rename-proof.test.mjs` verifies that the production comparison share-image generator reads `PRODUCT_NAME[locale]`, then simulates a token override in the generated SVG. The display text must change, while the image ID and filename remain unchanged. The test also rejects any residual old display name in the renamed SVG.
