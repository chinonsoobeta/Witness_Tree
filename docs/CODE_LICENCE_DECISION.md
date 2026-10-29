# Code licence decision packet

Prepared 2026-10-28 for the accountable owner. **Decision pending. Nothing in
this packet changes a licence.** `LICENSE`, `package.json`, `README.md` and the
Terms page are unchanged; `LICENSE` itself says a replacement may happen "only
through an explicit repository change following legal review".

This packet is not legal advice and does not record a legal opinion. It sets
out the facts in the repository, the options, their trade-offs for this
project, a recommendation for the owner's legal review, and the exact edits
each option would need. The review, not this packet, decides.

## 1. The decision asked

Should the site's own code (and, separately, its own written documentation) be
offered under an open licence, and if so which one, with what scope and what
exclusions? The data the site presents is outside this decision: each dataset
keeps its source's licence, and no code or documentation licence can change
that.

## 2. Current state

### What the repository says

| Surface | What it says today |
| --- | --- |
| `LICENSE` | "Copyright (c) 2026 Witness Tree contributors / All rights reserved." No permission to use, copy, modify, distribute, sublicense or sell "this software or its documentation". Replacement only by an explicit change after legal review. |
| `README.md`, "Data and licences" | Code is "distributed under an all-rights-reserved notice, not an open-source licence"; data keeps its source-specific licence; licence review is listed among the launch gates in `docs/EXTERNAL_GATES.md`. |
| `package.json` | No `license` field. `"private": true`, so npm will not publish the package. The package name `witness-tree` is a local build identifier; `scripts/check-persistent-identifiers.mjs` deliberately scopes published identifiers to `app/`, `lib/` and `components/`. |
| Terms page (`components/governance/terms-licences.ts`) | Last line of the licence list: "The site’s own code has no open-source licence yet." / "Le code du site n’a pas encore de licence libre." The rest of the list names each data source and its licence and credit line, plus BC Sans (SIL OFL 1.1) and the public-domain flags. |
| `DATA_LICENSES.md` | "The repository’s code licence does not apply to third-party data." Its table still describes only the illustrative fixtures (see review item R9). |
| `docs/THIRD_PARTY.md` | BC Sans under SIL OFL 1.1 (package source under Apache-2.0); the four province flags as public-domain vector files. |
| `docs/EXTERNAL_GATES.md`, Legal review | Complete only for the recorded Phase 0 scope (`data/phase0-legal-signoff-owner-record-2026-08-27.json`), which says a "materially changed legal surface, source licence ... or release scope requires a new scoped review". A code licence change is such a change. There is no gate row for the code licence today. |
| GitHub | `chinonsoobeta/Witness_Tree` is public. GitHub's licence detector reports "Other". No forks on 2026-10-28. |

### What the notice covers, and what it does not

The all-rights-reserved notice covers the project's own code and its own
documentation. It does not cover data: every dataset keeps its source's
licence, as `DATA_LICENSES.md` and the Terms page record. Because the
repository is public on GitHub, people can read it and use GitHub's own fork
button under GitHub's terms of service, but the notice gives no permission to
copy, run, modify or redistribute the code anywhere else. Legal review should
confirm how far GitHub's terms reach (R1).

### What is actually in the repository

The scope of any licence has to match the files. A licence that claimed to
cover everything here would claim more than the owner can grant.

| Material | Where | Who holds the rights | Note for the licence scope |
| --- | --- | --- | --- |
| Application, method and check code | `app/`, `components/`, `lib/`, `scripts/` (including 68 Python files), `worker/`, `tests/`, `db/`, `drizzle/`, `infra/`, root config files | The project | The main subject of the decision |
| Written documentation | `README.md`, `docs/*.md`, `CLAUDE.md`, other root `.md` files | The project, except quoted third-party text | Some docs record correspondence (permission requests, the BC FOI exchange); third-party text in them is not the project's to licence (R6) |
| Implementation plan | `docs/specification/Witness Tree Implementation Plan.docx` | The owner | Owner decides whether it is published under a documentation licence or excluded |
| Machine-checked records | `data/` (340 files) | Mixed: project-authored evidence and decisions, some carrying values derived from sources | Values from sources keep the source licence; see R9 and R10 |
| Vendored MapLibre GL JS 6.9.0 | `public/maplibre/6.9.0/` | MapLibre contributors, BSD-3-Clause (stated in the file header) | Not listed in `docs/THIRD_PARTY.md` today (R5) |
| BC Sans | npm `@bcgov/bc-sans` 2.1.0, imported once in root CSS | Province of British Columbia, SIL OFL 1.1 | Not vendored; ships in the built site |
| Province flags | `public/flags/*.svg` | Public domain, per Wikimedia Commons | Stay public domain |
| Gate photographs | `public/gate/*.jpg` | The owner (commit #156 records them as the owner's own) | Decoration; recommended excluded from any open licence |
| Brand images | `public/og.png`, `public/favicon.svg` (and `public/favicon.ico`, a 32 px rendering of it), `public/apple-touch-icon.png` | The project | Carry or stand for the name; recommended excluded |
| Template icons | `public/file.svg`, `public/globe.svg`, `public/window.svg` | Next.js starter template (MIT) | No reference found in `app/` or `components/`; candidates for deletion (R5) |
| npm dependencies | `package-lock.json` only; `node_modules/` is not committed | Their authors | Production tree is permissive (MIT, Apache-2.0, ISC, BSD) except BC Sans (OFL), `caniuse-lite` (CC BY 4.0, data) and the optional `sharp`/libvips platform binaries (LGPL-3.0-or-later). None are copied into the repository, so none constrain the choice below. |

### Contributor record

All 198 commits on `main` were made by the owner (two spellings of one name
and one email), except one commit by `vercel[bot]` (#212, "Install Vercel Web
Analytics", 47 lines across three files). Of 215 pull requests, 213 were
opened by the owner and 2 by the Vercel app. 128 commits carry an AI
co-author trailer (Claude or Codex). No outside person has contributed code,
so the owner can choose any licence without asking anyone else, subject to R2
and R3.

## 3. Why this matters for this project

**Reproducibility is the credibility claim.** The site asks readers to trust
figures because they can be traced and recomputed. The Phase 9 gate requires a
quarterly reproduction of a published figure from the immutable raw archive
and a recorded method version, and `data/raw-archive-reproduction-drill.json`
records a byte-exact reproduction drill. Today only the owner may run that
code. An outside reproduction, the strongest form of the claim, needs a
licence that lets someone else copy and run the method code.

**Journalists and researchers want to inspect the method.** Reading the code
on GitHub is possible now. Running it, quoting substantial parts of it in a
methods appendix, or adapting a check for a related study is not permitted
under the current notice. Newsrooms and universities usually need a named
licence before their counsel lets staff reuse code.

**Contributions.** With no licence, an outside correction to the method code
arrives without stated terms, and the project cannot safely merge it. Any open
licence settles the inbound terms; Apache-2.0 does so expressly (section 5).

**Forks that could misrepresent figures.** This is the main worry about
opening the code, and no licence solves it. An open-source licence cannot
forbid a fork from changing a method and publishing different numbers;
licences that try are not open-source. The levers that do help are:

- the name, which a code licence should not grant (below);
- attribution and notice requirements that travel with the code (strongest
  under Apache-2.0, through the `NOTICE` file);
- the data licences themselves, whose attribution and non-endorsement
  conditions bind anyone who redistributes the data, whatever the code
  licence;
- the published method versions, release records and bulk-download manifest,
  which let anyone check a fork's figure against the recorded release.

Keeping all rights reserved does not prevent misrepresentation either: anyone
can misquote a public figure without copying a line of code.

**The product name.** The plan keeps the name in one token
(`lib/domain/brand.ts`) and out of persistent identifiers so the project can be
renamed. `docs/NAME_CLEARANCE.md` records that the name is not legally cleared:
only a preliminary exact-name screen exists, the professional trademark and
confusion review is open, and "witness tree" is a descriptive surveying and
forestry term already used by an art project. A code licence must therefore
not grant any right in the name, and forks must not be able to present
themselves as this site. Two consequences:

- the chosen licence should exclude trademark and name rights expressly, or the
  `NOTICE`/README should say so where the licence is silent;
- the copyright line currently reads "Witness Tree contributors". Every
  permissive licence requires forks to keep the copyright notice, so this line
  would put the product name into every fork permanently. A legal person
  (the owner) is the more accurate holder and leaves the name out (R3).

## 4. Options

Every option leaves the data licences exactly as they are. None of them can
relicense data, and each fork that redistributes data must still meet each
source's attribution conditions.

### Option A: keep all rights reserved

| Aspect | Effect here |
| --- | --- |
| Allows | Reading on GitHub and GitHub-internal forking under GitHub's terms. Nothing else. |
| Prevents | Lawful outside reproduction, reuse of checks, quoting large parts, contributions on clear terms. |
| Contributors | No inbound terms; outside pull requests cannot safely be merged. |
| Third-party notices | No change. BC Sans OFL and MapLibre BSD-3 apply to their own files regardless. |
| Data licences | Unchanged. |

Simplest and fully reversible later. It is in tension with the site's own
reproducibility argument, and the Terms sentence "no open-source licence yet"
already signals that this is a waiting state.

### Option B: MIT

| Aspect | Effect here |
| --- | --- |
| Allows | Any use, copy, modification, sublicensing and sale, including closed forks, provided the copyright and permission notice is kept. |
| Prevents | Very little. No patent clause, no trademark clause, no requirement to mark changes. |
| Contributors | Short and widely understood. No express inbound clause; projects commonly rely on "inbound = outbound" or add a Developer Certificate of Origin sign-off. |
| Third-party notices | Compatible with BC Sans OFL (the font stays under OFL as a separate component) and MapLibre BSD-3. |
| Data licences | Unchanged. The licence is silent about data and names, so README and Terms must say both are excluded. |

Easiest for agencies and newsrooms to accept. The weakest at carrying the
name exclusion and data-attribution reminders into forks, because MIT has no
`NOTICE` mechanism and no trademark clause.

### Option C: Apache-2.0

| Aspect | Effect here |
| --- | --- |
| Allows | Same practical freedoms as MIT, including closed forks. |
| Prevents | Section 4(b): modified files must carry prominent change notices, which helps a reader tell a fork's method from this one. Section 4(d): forks that distribute must keep a readable copy of the attribution notices in `NOTICE`. Section 6: no permission to use the licensor's "trade names, trademarks, service marks, or product names" beyond describing origin. Section 3: a patent licence from contributors, which ends for anyone who sues over patents in the work. |
| Contributors | Section 5 makes contributions licensed under Apache-2.0 by default unless the contributor states otherwise. No CLA needed at this size. |
| Third-party notices | Compatible with MapLibre BSD-3 and with BC Sans; the BC Sans package source is itself Apache-2.0. The `NOTICE` file can list the third-party components so the list travels with forks. |
| Data licences | Unchanged. `NOTICE` can restate that the data is not covered and keeps its source licences; legal review should confirm how much of that statement a fork must carry, since 4(d) applies to attribution notices, not to added conditions (R8). |

The patent grant is of modest practical value for a data site; the trademark
clause and the change-marking and `NOTICE` mechanisms are the parts that fit
this project. The cost is a longer licence text and one more file to maintain.

### Option D: AGPL-3.0

| Aspect | Effect here |
| --- | --- |
| Allows | Use, modification and redistribution, provided derived works stay under AGPL-3.0. |
| Prevents | Closed forks. Section 13: anyone who modifies the code and lets users interact with it over a network must offer those users the modified source. |
| Contributors | Copyleft keeps improvements public. Owners of AGPL projects often require a contributor licence agreement to keep the right to relicense, which deters contributors. |
| Third-party notices | Compatible with MapLibre BSD-3 and Apache-2.0 dependencies; BC Sans stays under OFL as a separate font. |
| Data licences | Unchanged. AGPL's source-offer duty covers code only; it does not make anyone publish data. Section 7(e) lets the licensor add a term declining trademark rights, which would be needed for the name. |

AGPL would make a modified public fork publish its modified method, which
sounds attractive for an accountability site. In practice, many agencies,
newsrooms and universities have internal open-source policies that restrict or
forbid AGPL code, and a newsroom that adapts a component into its own web
stack would take on the network source-offer duty for that stack. It also does
not stop a fork from publishing different figures; it only makes the fork's
code available, which the project could already check against its own release
records. It would narrow the audience the reproducibility argument is meant to
reach.

### Option E: split (code open, documentation under CC BY 4.0, data untouched)

| Aspect | Effect here |
| --- | --- |
| Allows | Code under a software licence (B, C or D); the project's own written documentation under CC BY 4.0, which permits reuse and adaptation with attribution and an indication of changes. |
| Prevents | CC BY 4.0 section 2(b)(2): patent and trademark rights are not licensed. Attribution must name the creator and link the licence. |
| Contributors | Two licences to explain. Documentation contributions follow CC BY 4.0. |
| Third-party notices | No interaction with BC Sans or MapLibre; those are code and font assets, not documentation. Quoted third-party correspondence in `docs/` must be excluded (R6). |
| Data licences | Unchanged. Several data sources (Données Québec, for example) also use CC BY 4.0; a docs licence must not be read as relicensing them, so the README must keep the data line separate. |

Creative Commons itself advises against CC licences for software, so the split
uses each licence for what it is designed for. Methods prose, figure notes and
decision records are what journalists most often want to quote; CC BY makes
that plainly lawful with credit.

### Summary

| | Outside reproduction lawful | Closed forks | Express name exclusion | Notices travel with forks | Agency/newsroom friction | Data licences |
| --- | --- | --- | --- | --- | --- | --- |
| A. All rights reserved | No | No | Not needed | n/a | High (nothing to use) | Unchanged |
| B. MIT | Yes | Yes | No (state it in README) | Copyright line only | Lowest | Unchanged |
| C. Apache-2.0 | Yes | Yes | Yes (s. 6) | `NOTICE` (s. 4(d)) and change marks (s. 4(b)) | Low | Unchanged |
| D. AGPL-3.0 | Yes | No | Only with a s. 7(e) term | Full source to network users | High | Unchanged |
| E. Split (C + CC BY 4.0 docs) | Yes | Yes | Yes (both licences) | As C, plus docs attribution | Low | Unchanged |

## 5. Recommendation for legal review

**Recommended: Option E with Apache-2.0 for the code.** Code under Apache-2.0;
the project's own written documentation under CC BY 4.0; data, the
photographs, the brand images and the name excluded; the copyright holder
changed from "Witness Tree contributors" to the owner. This is a
recommendation for the owner's legal review, not a conclusion.

Reasons:

1. It makes the reproducibility claim real: anyone may lawfully run the method
   and check code against the raw archive and recorded method version.
2. Apache-2.0 is the permissive licence that addresses this project's two
   specific risks in its own text: section 6 withholds the name while the name
   is uncleared, and sections 4(b) and 4(d) make forks mark their changes and
   carry the `NOTICE` that points readers back to the source licences.
3. A permissive licence keeps agencies, newsrooms and universities able to
   reuse the code, which is the audience the site is built for. AGPL's extra
   protection does not address misrepresentation of figures, and would deter
   that audience.
4. CC BY 4.0 suits the methods prose and decision records better than a
   software licence, and it also excludes trademark rights.
5. The owner is the sole human contributor, so the change needs no one else's
   consent today; it becomes harder once outside contributions arrive under no
   stated terms.

If the review prefers fewer moving parts, Option C (Apache-2.0 for code and
documentation together) keeps reasons 1 to 3 and drops the second licence.

Until the review is done, Option A stays in force.

## 6. Change lists

Each list is the complete set of edits for that option. Apply one list only,
in one pull request, after the review. Run `npm run test:unit` and `npm test`
afterwards; no current test asserts the Terms licence sentence. The French
drafts below need the professional bilingual review that the Phase 8 gate
already requires.

The Terms drafts say "the site’s name" rather than the name itself, so the
string does not bypass `PRODUCT_NAME`.

### Option A: keep all rights reserved

- `LICENSE`: unchanged, or, if the review agrees with R3, change only the
  holder line to `Copyright (c) 2026 Chinonso Obeta`.
- `package.json`: optionally add `"license": "UNLICENSED"` (npm's value for
  "not licensed for use by others"). Keep `"private": true`.
- `README.md`: unchanged.
- Terms page: unchanged, or make it final rather than provisional:
  - EN: "The site’s own code and documentation are not under an open licence; all rights are reserved."
  - FR: "Le code et la documentation du site ne sont pas sous licence libre ; tous droits réservés."
- `NOTICE`: none.
- `docs/EXTERNAL_GATES.md`, new row at the end of the Phase 0 table:

  ```
  | Code and documentation licence | Owner decision after scoped legal review, recorded with date, licence(s), scope, exclusions and copyright holder | Decided YYYY-MM-DD: all rights reserved retained for code and documentation, per `data/code-licence-decision-YYYY-MM-DD.json`. Data keeps each source's licence. Revisit before the Phase 9 quarterly reproduction gate. |
  ```

### Option B: MIT

- `LICENSE`: the MIT text from <https://opensource.org/license/mit> (SPDX
  `MIT`, <https://spdx.org/licenses/MIT.html>), with the line
  `Copyright (c) 2026 Chinonso Obeta` (subject to R3), followed by a short
  scope statement after the licence text:

  ```
  Scope: this licence covers the code in this repository. It does not cover
  data (see DATA_LICENSES.md), the photographs in public/gate/, the images
  public/og.png, public/favicon.svg, public/favicon.ico and
  public/apple-touch-icon.png, or the site's name, and grants no right to
  use the name.
  ```

- `package.json`: `"license": "MIT"`. Keep `"private": true`.
- `README.md`, replacing the first sentence of the licence paragraph:

  > The code is available under the [MIT License](LICENSE). The licence does not cover data, the site's photographs or brand images, or the site's name, and grants no right to use the name. [DATA_LICENSES.md](DATA_LICENSES.md) records ...

- Terms page:
  - EN: "The site’s own code is available under the MIT License. It does not cover the data above, which keeps each source’s licence, or the site’s name."
  - FR: "Le code du site est offert sous la licence MIT. Elle ne s’applique ni aux données ci-dessus, qui restent sous la licence de chaque source, ni au nom du site."
- `NOTICE`: none required. Add MapLibre GL JS (BSD-3-Clause) to
  `docs/THIRD_PARTY.md` (R5).
- `docs/EXTERNAL_GATES.md` row, as in Option A, with the state:
  "Decided YYYY-MM-DD: code under MIT; documentation, data, photographs, brand images and the name excluded ..."

### Option C: Apache-2.0

- `LICENSE`: the verbatim text of <https://www.apache.org/licenses/LICENSE-2.0.txt>
  (SPDX `Apache-2.0`), unmodified. On 2026-10-28 that file was 202 lines with
  SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`;
  check the copy against that hash. The copyright line and scope go in
  `NOTICE`, not in `LICENSE`.
- `package.json`: `"license": "Apache-2.0"`. Keep `"private": true`.
- `README.md`:

  > The code is available under the [Apache License 2.0](LICENSE); see [NOTICE](NOTICE) for attribution and scope. The licence does not cover data, the site's photographs or brand images, or the site's name (section 6 of the licence grants no right to use it). [DATA_LICENSES.md](DATA_LICENSES.md) records ...

- Terms page:
  - EN: "The site’s own code is available under the Apache License 2.0. It does not cover the data above, which keeps each source’s licence, or the site’s name."
  - FR: "Le code du site est offert sous la licence Apache 2.0. Elle ne s’applique ni aux données ci-dessus, qui restent sous la licence de chaque source, ni au nom du site."
- `NOTICE`: as in the recommended option below, without the documentation
  paragraph.
- `docs/EXTERNAL_GATES.md` row state: "Decided YYYY-MM-DD: code and documentation under Apache-2.0; data, photographs, brand images and the name excluded ..."

### Option D: AGPL-3.0

- `LICENSE`: the verbatim text of <https://www.gnu.org/licenses/agpl-3.0.txt>
  (661 lines on 2026-10-28, SHA-256
  `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`), plus a
  separate additional-terms file under section 7(e) declining trademark and
  name rights, and a scope statement as in Option B. The review must choose
  `AGPL-3.0-only` or `AGPL-3.0-or-later`.
- `package.json`: `"license": "AGPL-3.0-only"` (or `AGPL-3.0-or-later`). Keep `"private": true`.
- Source offer: the deployed site must link to its corresponding source
  (section 13 binds forks; the owner, as sole copyright holder, is not bound
  by it, but a visible source link keeps the project consistent with what it
  asks of forks). That is a new footer link and copy in both languages.
- `README.md`:

  > The code is available under the [GNU Affero General Public License, version 3](LICENSE). Anyone who runs a modified version as a network service must offer its users the modified source. The licence does not cover data, the site's photographs or brand images, or the site's name. [DATA_LICENSES.md](DATA_LICENSES.md) records ...

- Terms page:
  - EN: "The site’s own code is available under the GNU Affero General Public License, version 3. It does not cover the data above, which keeps each source’s licence, or the site’s name."
  - FR: "Le code du site est offert sous la licence publique générale GNU Affero, version 3. Elle ne s’applique ni aux données ci-dessus, qui restent sous la licence de chaque source, ni au nom du site."
- `NOTICE`: not a formal AGPL concept; the scope statement and third-party list
  go in `docs/THIRD_PARTY.md` and the additional-terms file.
- `docs/EXTERNAL_GATES.md` row state: "Decided YYYY-MM-DD: code under AGPL-3.0-only with a section 7(e) name exclusion ..."

### Recommended: Option E, Apache-2.0 code and CC BY 4.0 documentation

1. **`LICENSE`**: the verbatim Apache-2.0 text as in Option C (SHA-256
   `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`).
   The full text is not pasted here so that the committed file can be checked
   byte for byte against the canonical copy.
2. **`LICENSE-DOCS`** (new): the verbatim CC BY 4.0 legal code from
   <https://creativecommons.org/licenses/by/4.0/legalcode.txt> (396 lines on
   2026-10-28, SHA-256
   `9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411`).
3. **`NOTICE`** (new), draft:

   ```
   Copyright 2026 Chinonso Obeta

   This product includes software developed for the public forest-loss record
   at https://www.witnesstree.ca.

   Scope
   - The code in this repository is licensed under the Apache License,
     Version 2.0 (LICENSE).
   - The project's own written documentation (README.md and the Markdown files
     in docs/, except text quoted from third parties) is licensed under the
     Creative Commons Attribution 4.0 International licence (LICENSE-DOCS).
   - Neither licence covers: data, which keeps each source's own licence and
     attribution requirements (DATA_LICENSES.md and the site's Terms page);
     the photographs in public/gate/; the images public/og.png,
     public/favicon.svg, public/favicon.ico and public/apple-touch-icon.png;
     or the site's name.
     Neither licence grants any right to use the name.

   Figures
   A modified version that publishes figures should not present them as
   figures from this project. Each published figure here is bound to a
   recorded method version and release record.

   Third-party components
   - MapLibre GL JS 6.9.0 (public/maplibre/6.9.0/): BSD-3-Clause,
     https://github.com/maplibre/maplibre-gl-js/blob/v6.9.0/LICENSE.txt
   - BC Sans (npm @bcgov/bc-sans): SIL Open Font License 1.1, Province of
     British Columbia
   - Province flags (public/flags/): public domain
   ```

   The domain line names the site; the review should decide whether a domain
   is acceptable in a notice that forks must carry, or whether to drop it
   (R4). The "Figures" paragraph is a request, not a licence condition.

4. **`package.json`**: `"license": "Apache-2.0"`. The documentation licence
   has no npm field; the `NOTICE` records it. Keep `"private": true`.
5. **`README.md`**, replacing the first sentence of the licence paragraph:

   > The code is available under the [Apache License 2.0](LICENSE), and the project's own written documentation under [Creative Commons Attribution 4.0 International](LICENSE-DOCS); [NOTICE](NOTICE) sets out the scope. Neither covers data, the site's photographs or brand images, or the site's name, and neither grants a right to use the name. Data retains its source-specific licence. [DATA_LICENSES.md](DATA_LICENSES.md) records ...

6. **Terms page** (`components/governance/terms-licences.ts`, last line of each list):
   - EN: "The site’s own code is available under the Apache License 2.0, and its written documentation under Creative Commons Attribution 4.0 International. Neither covers the data above, which keeps each source’s licence, the site’s photographs, or the site’s name."
   - FR: "Le code du site est offert sous la licence Apache 2.0, et sa documentation écrite, sous la licence Creative Commons Attribution 4.0 International. Ni l’une ni l’autre ne s’applique aux données ci-dessus, qui restent sous la licence de chaque source, aux photographies du site ou au nom du site."
7. **`docs/THIRD_PARTY.md`**: add a MapLibre GL JS section (BSD-3-Clause,
   vendored at `public/maplibre/6.9.0/`).
8. **`docs/EXTERNAL_GATES.md`**, new row at the end of the Phase 0 table:

   ```
   | Code and documentation licence | Owner decision after scoped legal review, recorded with date, licence(s), scope, exclusions and copyright holder | Decided YYYY-MM-DD per `data/code-licence-decision-YYYY-MM-DD.json`: code under Apache-2.0, the project's own documentation under CC BY 4.0. Data keeps each source's licence; photographs, brand images and the name are excluded, and no right to the name is granted. This does not clear the name, grant source rights, or close any other gate. |
   ```

9. **Optional deletions**: `public/file.svg`, `public/globe.svg`,
   `public/window.svg` if the review confirms they are unused starter
   leftovers (R5).

## 7. What the legal review should confirm before the change merges

| # | Question | Why it matters here |
| --- | --- | --- |
| R1 | What the current notice and GitHub's terms of service together permit for a public repository | Establishes what changes, and whether anyone has relied on the public code |
| R2 | Contributor status: the owner authored every human commit; one `vercel[bot]` commit (#212) installed analytics; 128 commits carry AI co-author trailers | Confirms the owner can grant the licence alone, and how AI-assisted authorship should be described in the copyright notice under Canadian law |
| R3 | The copyright holder: change "Witness Tree contributors" to the owner (or an entity) | The current line puts an uncleared product name into every fork and names no legal person |
| R4 | Name and trademark: the licence and `NOTICE` grant no right to the name; whether the domain line in `NOTICE` is acceptable; how this sits with the open professional trademark review in `docs/NAME_CLEARANCE.md` | The name is not cleared and the plan keeps it out of persistent identifiers |
| R5 | Code copied from third parties and its licences: vendored MapLibre GL JS (BSD-3-Clause, header present, missing from `docs/THIRD_PARTY.md`); the three Next.js starter icons; any snippet adapted from elsewhere that a search of headers did not find | The licence must not claim rights the project does not hold, and BSD-3 requires its notice to be kept |
| R6 | Documentation scope: which `docs/` files quote third-party correspondence (permission requests, the FOI exchange) and must be excluded from CC BY 4.0; whether the implementation plan `.docx` is included | The project can only license its own text |
| R7 | BC Sans: the installed npm package contains only an Apache-2.0 `LICENSE` file, while the OFL text is in the upstream repository; confirm the font's OFL notice is preserved in the built site and in forks | `docs/THIRD_PARTY.md` must stay true |
| R8 | Data attribution in forks: whether the `NOTICE` and README wording is enough to remind forks that each source's attribution and non-endorsement conditions still apply, and that 4(d) does not turn those reminders into licence conditions | The code licence cannot carry data obligations; the data licences do that themselves |
| R9 | `DATA_LICENSES.md` still says no production dataset is distributed and lists only fixtures, while the Terms page lists real sources and the bulk-downloads gate records published real data | The code licence's scope boundary points at this file, so it must be current before the change lands |
| R10 | `data/` records: which files are project-authored records (eligible for CC BY 4.0) and which carry source-derived values; whether sources listed on the Terms page without a named open licence (Elections BC, Elections Ontario, the Québec DGEQ/CRE divisions) restrict redistribution of anything in the repository | Forks need `data/` for the checks to run; it must be clear what they may copy |
| R11 | That the change is a new scoped legal review under the Phase 0 record, with its own dated record | The Phase 0 sign-off does not cover a changed licence surface |
| R12 | The French Terms sentence and README wording after professional translation | The bilingual review gate applies to legal text |
