# Confidence-first token mapping

The topbar is a dark surface in every theme. Its tokens are defined in the bare
root, the system-dark root, and both explicit theme palettes, including nested
gallery panels. Page content continues to use the existing semantic palette.

| Topbar token | Light | Dark | Purpose |
|---|---|---|---|
| `--topbar-fill` | `#2c2c24` | `#22201a` | Bar background |
| `--topbar-ink` | `#fdfcf8` | `#f2ede3` | Wordmark and active item |
| `--topbar-ink-2` | `#ded8cf` | `#c9c2b6` | Inactive navigation |
| `--topbar-accent` | `#a9cf9b` | `#a9cf9b` | Active underline |
| `--topbar-edge` | `#948b7a` | `#7d7566` | Control edges |

| Mockup colour outside the topbar | Existing token |
|---|---|
| `#2c2c24` | `--ink` |
| `#fdfcf8` | `--ground` |
| `#ded8cf` | `--rule` |
| `#948b7a` | `--rule-strong` |
| `#e6dccd` | `--sand` |
| `#47593f` | `--accent` |

Use the existing evidence chip shapes, labels, `--edge-*` and `--tint-*` tokens
for the four evidence classes. Unknown remains a labelled class with its own
shape. `--plate` remains a width, so the shared statement is named
`CoverageStatement`.

The specification calls the topbar set a quartet but lists five tokens. The
implementation follows all five table entries, including the control edge.
