# YMPL — Process Model Codec
## Project context for Claude Code

---

## What this project is

YMPL is a **single portable JavaScript module** (`ympl.js`) that converts messy industrial process text into structured YAML and SVG diagrams — and back again.

```
messy text  ──▶  YMPL 1.0 YAML  +  SVG diagram
YMPL YAML   ──▶  plain English  +  SVG diagram
```

This is the **canonical project folder**. All work happens here.

---

## Folder contents

```
C:\ensim\ympl\
├── ympl.js              ← the codec — single portable file, all logic here
├── ympl_viewer.html     ← browser test viewer
├── YMPL_SPEC.md         ← format specification (schema, rules, versioning)
├── YMPL_USER_GUIDE.md   ← user documentation
├── test.js              ← 35-test verification suite (node test.js)
├── package.json
├── CLAUDE.md            ← this file
└── node_modules\js-yaml
```

**Do not** reference or import anything from `C:\ensim\ympl-standalone-sdk\`. That folder is the old multi-file SDK and has been superseded.

---

## Run tests

```bash
cd C:\ensim\ympl
node test.js
```

All 35 tests must pass before any change is considered done.

---

## Architecture

### ympl.js — internal sections (in order)

| Section | What it does |
|---|---|
| UMD wrapper | Works in browser (`window.YMPL`) and Node.js (`require`) |
| `KINDS` | Full vocabulary — 354 synonyms across all equipment categories |
| `TAG_KIND` | ISA tag prefix → kind mapping (P- → pump, CV- → valve, etc.) |
| `SORTED_TERMS` | KINDS flattened and sorted longest-first for greedy match |
| `TYPOS` | Regex normaliser — fixes spelling errors before parsing |
| `PREAMBLE` | Strips non-process sentence openers |
| `normalize(text)` | Applies PREAMBLE strips + TYPOS fixes |
| `extractNodes(text)` | Left-to-right greedy scan → `[{id, label, kind}]` |
| `buildEdges(nodes, text)` | Sequential stream edges + bypass/recycle detection |
| `parse(text)` | normalize → extractNodes → buildEdges → YmplDoc |
| `fromYaml(str)` | YAML string → YmplDoc (requires js-yaml) |
| `toYaml(doc)` | YmplDoc → YAML string (inline fallback if no js-yaml) |
| `toText(doc)` | YmplDoc → plain English description |
| `toSvg(doc)` | YmplDoc → SVG string, left-to-right layout, colour by kind |
| `toMermaid(doc)` | YmplDoc → Mermaid `flowchart LR` string, shape encodes kind |
| Public API | `parse`, `fromYaml`, `toYaml`, `toText`, `toSvg`, `toMermaid`, `render` |

### Key design rules

- **Text order = flow order.** Nodes are extracted left-to-right; sequential edges follow text position. This is the fix for the old SDK's scrambled ordering.
- **Longest match wins.** `SORTED_TERMS` is sorted by term length descending so "flash drum" matches before "drum".
- **Tag IDs refine labels.** "pump P-101" → node label is "P-101", kind is pump.
- **No external logic files.** The entire vocabulary, normaliser, parser, renderer are self-contained in ympl.js.

---

## YMPL 1.0 Schema

```yaml
schema_version: ympl-1.0
id: string           # slugified title
title: string        # human readable

nodes:
  - id: n1           # n1, n2, n3...
    label: string    # display name (tag ID or term)
    kind: string     # see kinds below

edges:
  - from: n1
    to: n2
    kind: stream     # stream | bypass | recycle
    label: string    # optional, e.g. "Bypass"

meta:
  confidence: high   # high | medium | low | none
  source_text: string
```

**Node kinds:** `vessel` · `pump` · `valve` · `checkvalve` · `heat_exchanger` · `compressor` · `column` · `reactor` · `relief` · `filter` · `meter`

---

## Public API

```js
// Browser: <script src="ympl.js"></script>  (+ js-yaml CDN before it)
// Node.js: const YMPL = require('./ympl.js')

YMPL.render(input)     // text OR yaml string → { doc, yaml, svg, text, mermaid }
YMPL.parse(text)       // text → doc
YMPL.fromYaml(str)     // yaml string → doc
YMPL.toYaml(doc)       // doc → yaml string
YMPL.toText(doc)       // doc → plain English
YMPL.toSvg(doc)        // doc → SVG string
YMPL.toMermaid(doc)    // doc → Mermaid flowchart LR string
```

---

## Vocabulary coverage

- **354 synonyms** embedded inline — no external JSON files needed
- Source: `Process_WordBank_with_Synonyms.docx` (308 terms, 848+ synonyms)
- Categories: vessel (73), heat_exchanger (61), pump (25), valve (38), relief (23), column (18), compressor (10), checkvalve (7), filter/meter (12)
- ISA tag prefixes: P, CV, FV, LV, PV, TV, HV, XV, SV, E, K, V, D, T, R, C, F, FT

## Topology keywords recognised

| Phrase | Edge kind |
|---|---|
| `bypass around X`, `parallel path around X`, `crossover around X` | bypass |
| `recycle line back to X`, `return line to X`, `recirculation line back to X`, `product recycle to X` | recycle |

---

## What NOT to do

- Do not import or reference files from `C:\ensim\ympl-standalone-sdk\`
- Do not split logic into multiple files — ympl.js is intentionally one portable file
- Do not add Python code — this module is JS only
- Do not add external runtime dependencies beyond js-yaml
- Do not use the old `mainPath[]` schema — the schema is `nodes[]` + `edges[]`

---

## Reuse in other apps

Copy `ympl.js` to the target app. That is the entire deliverable.

```js
// In simulation app, engineering tool, SCADA panel, CLI — same call:
const result = YMPL.render(inputTextOrYaml);
// result.yaml    — structured model
// result.svg     — process diagram (SVG string)
// result.text    — plain English
// result.mermaid — Mermaid flowchart LR string (SDK-to-SDK / docs)
// result.doc     — { nodes, edges } object
```
