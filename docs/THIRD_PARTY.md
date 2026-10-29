# Third-party notices

## BC Sans

This project includes [@bcgov/bc-sans](https://github.com/bcgov/bc-sans) for the BC Sans web font. BC Sans is the standard font for B.C. Government digital services and is a modified version of Noto Sans with support for Indigenous languages in British Columbia.

The package is distributed under the SIL Open Font License 1.1. Its repository also includes Apache-2.0 licensing material for the package source. See the package's `LICENSE`, `LICENSE_OFL.txt`, and [README](https://github.com/bcgov/bc-sans) for the complete terms and notices.

The place share cards (`lib/share/receipt.tsx`) embed BC Sans in generated PNG images. They are rendered from the package's unmodified `BCSans-Regular.woff` and `BCSans-Bold.woff` files, which the OFL 1.1 permits when the font is bundled with or embedded in a work, provided the font is not sold by itself. The font files are not altered, renamed or redistributed separately; `npm run check:share-images` binds their SHA-256 digests.

## Province flag icons

The shared province bar and the harvest and fire page show the official flags of [British Columbia](https://commons.wikimedia.org/wiki/File:Flag_of_British_Columbia.svg), [Alberta](https://commons.wikimedia.org/wiki/File:Flag_of_Alberta.svg), [Ontario](https://commons.wikimedia.org/wiki/File:Flag_of_Ontario.svg), and [Québec](https://commons.wikimedia.org/wiki/File:Flag_of_Quebec.svg). Each linked source page identifies its vector file as public domain. The unmodified vector files are served from `public/flags/` (`bc.svg`, `ab.svg`, `on.svg`, `qc.svg`) and are not loaded from Wikimedia at runtime.
