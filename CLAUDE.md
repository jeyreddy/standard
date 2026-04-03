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
| `KINDS` | Full vocabulary — 16 equipment/instrument categories, 500+ synonyms |
| `TAG_KIND` | ISA 5.1 tag prefix → kind (P→pump, FT→transmitter, LSHH→switch, etc.) |
| `SORTED_TERMS` | KINDS flattened and sorted longest-first for greedy match |
| `FUZZY_TERMS` | Terms ≥5 chars eligible for Levenshtein fuzzy matching |
| `TYPOS` | Regex normaliser — fixes spelling errors + field shorthand before parsing |
| `PREAMBLE` | Strips non-process sentence openers |
| `normalize(text)` | Applies PREAMBLE strips + TYPOS fixes |
| `extractNodes(text)` | Left-to-right greedy scan → `[{id, label, kind}]` |
| `buildEdges(nodes, text)` | Sequential stream edges + bypass/recycle detection |
| `classifySignalEdges` | Reclassifies instrument→instrument/valve edges as `signal` |
| `parse(text)` | normalize → extractNodes → buildEdges → classifySignalEdges → YmplDoc |
| `fromYaml(str)` | YAML string → YmplDoc (requires js-yaml) |
| `toYaml(doc)` | YmplDoc → YAML string (inline fallback if no js-yaml) |
| `toText(doc)` | YmplDoc → plain English description |
| `toSvg(doc)` | YmplDoc → ISA 5.1 P&ID symbols, left-to-right layout |
| `toMermaid(doc)` | YmplDoc → Mermaid `flowchart LR` string, shape encodes kind |
| `_pidSymbol` | Per-kind ISA 5.1 / ISO 10628 SVG symbol (pump, valve, bubble, etc.) |
| `_bubbleTag` | Renders tag letters + loop number inside instrument bubbles |
| Public API | `parse`, `fromYaml`, `toYaml`, `toText`, `toSvg`, `toMermaid`, `render`, `renderAsync` |

### Key design rules

- **Text order = flow order.** Nodes are extracted left-to-right; sequential edges follow text position.
- **Longest match wins.** `SORTED_TERMS` sorted by term length descending so "flash drum" matches before "drum".
- **Tag IDs refine labels.** "pump P-101" → node label is "P-101", kind is pump. Prefix regex matches up to 5 chars (`[A-Za-z]{1,5}`) so `LSHH-301`, `TSHH-201` resolve correctly.
- **Signal edges auto-classified.** Any edge from an instrument kind (transmitter, controller, etc.) to another instrument or valve is marked `kind: signal` — drawn as dashed blue line.
- **ISA 5.1 symbols.** `toSvg` draws proper P&ID symbols (circle+impeller for pump, bowtie for valve, instrument bubble for transmitter/controller, etc.) not coloured rectangles.
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
    kind: stream     # stream | bypass | recycle | signal
    label: string    # optional, e.g. "Bypass"

meta:
  confidence: high   # high | medium | low | none
  source_text: string
```

**Process equipment kinds:** `vessel` · `pump` · `valve` · `checkvalve` · `heat_exchanger` · `compressor` · `column` · `reactor` · `absorber` · `adsorption` · `relief` · `filter` · `meter`

**Instrumentation kinds (ISA 5.1):** `transmitter` · `controller` · `indicator` · `recorder` · `switch` · `analyzer` · `element`

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

**Sources:**
- `Process_WordBank_with_Synonyms.docx` — process equipment (308 terms, 848+ synonyms)
- `IST_Vocabulary.docx` — instrumentation & control (Lipták Vol. 1 + Yeturu/Reddy, 86 entries)

**16 kinds, 500+ synonyms embedded inline — no external files needed:**

| Kind | Count | Examples |
|---|---|---|
| vessel | 20+ | tank, drum, reflux drum, overhead accumulator, slug catcher |
| heat_exchanger | 25+ | reboiler, condenser, fired heater, fin-fan, trim cooler |
| pump | 12 | centrifugal pump, reflux pump, metering pump, gear pump |
| valve | 14 | control valve, gate valve, anti-surge valve, check valve |
| column | 12 | fractionator, distillation column, de-ethanizer |
| reactor | 8 | CSTR, plug flow reactor, tubular reactor, Gibbs reactor |
| separator | 12 | flash drum, knockout drum, scrubber, slug catcher |
| compressor | 3 | centrifugal compressor, reciprocating compressor |
| meter | 10 | coriolis meter, magnetic flowmeter, vortex flowmeter, PD meter |
| transmitter | 15 | FT, PT, TT, LT — GWR, displacer, DP transmitter |
| controller | 12 | FIC, PIC, TIC, LIC — cascade, feedforward, split-range |
| indicator | 12 | FI, PI, TI — Bourdon gauge, dial gauge, sight glass |
| switch | 16 | FSH, PSL, LSHH, LSLL — all ISA xS variants |
| analyzer | 9 | gas chromatograph, pH analyzer, O2 analyzer |
| element | 15 | orifice plate, averaging pitot (Annubar), thermowell, RTD, PT100 |
| recorder | 7 | FR, PR, TR — chart recorder, data recorder |

**ISA 5.1 tag prefixes recognised (prefix regex `[A-Za-z]{1,5}`):**

| Prefixes | Kind |
|---|---|
| P | pump |
| CV, FV, LV, PV, TV, HV, XV, SV | valve |
| E | heat_exchanger |
| K | compressor |
| C | column |
| R | reactor |
| V, D, SEP, T, H | vessel / separator |
| FT, PT, TT, LT, AT, DT, ST, WT | transmitter |
| FC/FIC, PC/PIC, TC/TIC, LC/LIC, AC/AIC, FFC, FRC | controller |
| FI, PI, TI, LI, AI, FG, PG, TG, LG | indicator |
| FR, PR, TR, LR, AR | recorder |
| FS, PS, TS, LS + H/L/HH/LL suffix | switch |
| FE, PE, TE, LE, FM | element |
| QT, pH | analyzer |

**TYPOS normaliser also handles field shorthand:**
`annubar` → averaging pitot tube · `magmeter`/`mag flow` → magnetic flowmeter ·
`PT100`/`Pt1000` → rtd · `DVC` → valve positioner

## Topology keywords recognised

| Phrase | Edge kind | Line style |
|---|---|---|
| `bypass around X`, `parallel path around X` | bypass | dashed orange |
| `recycle line back to X`, `return line to X` | recycle | dashed green |
| instrument → instrument or valve (auto) | signal | dashed blue |

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
