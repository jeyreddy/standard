# YMPL Project — Full Context Export
> Copy this file into any AI tool (Claude.ai, ChatGPT, Gemini, etc.) to give it complete project understanding.
> Generated from live codebase · C:\ympl · April 2026

---

## What This Project Is

**YMPL** (pronounced "simple") is a **single portable JavaScript file** (`ympl.js`) that converts messy industrial process text into structured YAML models and P&ID diagrams — and back again.

```
messy text  ──▶  YMPL 1.0 YAML  +  SVG P&ID diagram  +  Mermaid flowchart
YMPL YAML   ──▶  plain English  +  SVG P&ID diagram  +  Mermaid flowchart
```

**Primary use case:** SDK for engineering simulation and SCADA tools. Other teams call `YMPL.render(input)` and consume `result.yaml`, `result.svg`, `result.mermaid`, or `result.doc`. There is no build step — copy `ympl.js` to any app.

**Not a UI project.** The viewer (`ympl_viewer.html`) is a developer test tool only.

---

## Single-File Architecture

Everything lives in `ympl.js`. No imports, no build, works in browser and Node.js via UMD wrapper.

```
ympl.js internal sections (top → bottom):
─────────────────────────────────────────────────────────────────────
UMD wrapper          Works as window.YMPL (browser) or require() (Node)
KINDS                16 equipment/instrument categories, 500+ synonyms
TAG_KIND             ISA 5.1 tag prefix → kind map (up to 5-char prefix)
SORTED_TERMS         KINDS flattened, sorted longest-first for greedy match
FUZZY_TERMS          Terms ≥5 chars eligible for Levenshtein fuzzy match
TYPOS                Regex normaliser: spelling + field shorthand → canonical
PREAMBLE             Strips non-process sentence openers
normalize(text)      Applies PREAMBLE + TYPOS before parsing
extractNodes(text)   Left-to-right greedy scan → [{id, label, kind}]
deduplicateNodes     Removes bare back-references (e.g. "reactor" after "PFR")
reorderNodes         Topological sort of nodes to match process flow direction
buildEdges           Sequential stream edges + bypass + recycle detection
classifySignalEdges  Reclassifies instrument→instrument/valve as 'signal'
parse(text)          Full Tier 1 pipeline: normalize→extract→reorder→edges→classify
fromYaml(str)        YAML string → YmplDoc
toYaml(doc)          YmplDoc → YMPL 1.0 YAML string
toText(doc)          YmplDoc → plain English description
_pidSymbol           Per-kind ISA 5.1 SVG symbol renderer
_bubbleTag           Renders tag letters + number inside instrument bubbles
toSvg(doc)           YmplDoc → full SVG with ISA 5.1 / ISO 10628 P&ID symbols
_MERMAID_SHAPE       Per-kind Mermaid node shape encoding
toMermaid(doc)       YmplDoc → Mermaid flowchart LR string
_render(input)       Shared sync render (text or YAML input)
checkWarnings        Detects topology gaps (bypass/recycle keyword w/o edge)
_VOCAB               LLM equipment vocabulary (Lipták + Yeturu/Reddy references)
_LLM_SYSTEM          LLM system prompt for Ollama/Haiku
_llmExtract          Calls LLM and parses response YAML
renderAsync          Async Tier 1 + optional LLM fallback render
Public API           Exported object with all public functions
─────────────────────────────────────────────────────────────────────
```

---

## YMPL 1.0 Schema

```yaml
schema_version: ympl-1.0
id: feed_tank_to_v_201          # slugified title
title: Feed Tank to V-201       # human readable

nodes:
  - id: n1                      # sequential, n1 = first in flow
    label: P-101                # ISA tag ID or equipment name
    kind: pump                  # see kinds below

edges:
  - from: n1
    to: n2
    kind: stream                # stream | bypass | recycle | signal
    label: Bypass               # optional, shown on edge

meta:
  confidence: high              # high | medium | low | none
  source_text: "original input text"
```

---

## Node Kinds — Complete Reference

### Process Equipment (13 kinds)

| Kind | ISA SVG Symbol | Example labels |
|---|---|---|
| `vessel` | Vertical cylinder with elliptical caps | Feed Tank, V-101, Reflux Drum, Surge Drum |
| `separator` | Horizontal drum with dashed interface line | V-201, HP Separator, Flash Drum, KO Drum |
| `pump` | Circle + filled impeller triangle | P-101, Reflux Pump, Charge Pump |
| `compressor` | Circle + open triangle + shaft line | K-101, Recycle Compressor |
| `valve` | Bowtie (two triangles) + actuator circle | CV-101, FCV-101, PCV-101, Anti-surge Valve |
| `checkvalve` | Same bowtie as valve | NRV-101, Check Valve |
| `heat_exchanger` | Shell rectangle + tube-bundle U-bends | E-101, Reboiler, Condenser, Fired Heater |
| `column` | Tall cylinder + horizontal tray lines | C-101, Fractionator, De-ethanizer |
| `reactor` | Circle + agitator shaft + impeller arms | R-101, CSTR, PFR, Tubular Reactor |
| `absorber` | Tall cylinder + angled packing lines | Absorber, Stripper |
| `adsorption` | Rectangle + sine-wave membrane | PSA Bed, TSA Bed, Membrane Separator |
| `relief` | Filled triangle + base bar + tail | PSV-101, Safety Valve, Rupture Disc |
| `filter` | Rectangle + diagonal screen lines | Strainer, Coalescer, Bag Filter |
| `meter` | Circle + diagonal flow arrow | Coriolis Meter, Magnetic Flowmeter, Vortex Meter |

### Instrumentation (7 kinds — ISA 5.1 / Lipták + Yeturu/Reddy)

| Kind | ISA SVG Symbol | Tag prefixes | Example labels |
|---|---|---|---|
| `transmitter` | Plain circle (field bubble) with tag letters | FT, PT, TT, LT, AT, DT, ST, WT | FT-101, PT-202, LT-301 |
| `controller` | Circle + horizontal bar (DCS) | FC/FIC, PC/PIC, TC/TIC, LC/LIC, AC/AIC, FFC, FRC | FIC-101, TIC-201 |
| `indicator` | Small plain circle (local) | FI, PI, TI, LI, AI, FG, PG, LG | PI-101, TI-201 |
| `recorder` | Circle + two horizontal bars | FR, PR, TR, LR, AR | FR-101, TR-201 |
| `switch` | Circle + diagonal line | FS/PS/TS/LS + H/L/HH/LL suffix | PSH-101, LSHH-301 |
| `analyzer` | Diamond with inner circle | QT, pH | AT-401, Gas Chromatograph |
| `element` | Filled diamond (in-line) | FE, PE, TE, LE, FM | FE-101, TE-301, Orifice Plate |

---

## Edge Kinds

| Kind | Meaning | Line style in SVG | Mermaid syntax |
|---|---|---|---|
| `stream` | Main process flow | Solid grey arrow | `-->` |
| `bypass` | Parallel path around a node | Dashed orange arc | `-. Bypass .->` |
| `recycle` | Return stream back upstream | Dashed green arc (below) | `-- Recycle -->` |
| `signal` | Instrument loop signal | Thin dashed blue | `-. Signal .->` |

Signal edges are **auto-classified**: any edge where the source is an instrument kind (transmitter, controller, indicator, recorder, switch, analyzer, element) and the target is also an instrument or valve becomes `kind: signal` automatically.

---

## ISA 5.1 Tag Auto-Resolution

Tags like `FT-101`, `LSHH-301`, `PIC-202` are parsed automatically from text. Prefix matched up to **5 characters**.

| Prefixes | → Kind |
|---|---|
| P | pump |
| K | compressor |
| C | column |
| R | reactor |
| E | heat_exchanger |
| CV, FV, LV, PV, TV, HV, XV, SV | valve |
| V, D, SEP, T, H | vessel / separator |
| FT, PT, TT, LT, AT, DT, ST, WT | transmitter |
| FC/FIC, PC/PIC, TC/TIC, LC/LIC, AC/AIC, FFC, FRC | controller |
| FI, PI, TI, LI, AI, FG, PG, TG, LG | indicator |
| FR, PR, TR, LR, AR | recorder |
| FS, PS, TS, LS + H/L/HH/LL | switch |
| FE, PE, TE, LE, FM | element |
| QT, pH | analyzer |

---

## Public API

```js
// Node.js
const YMPL = require('./ympl.js');

// Browser
// <script src="https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js"></script>
// <script src="ympl.js"></script>  →  window.YMPL

// ── Main entry point ──────────────────────────────────────────────────────────
const result = YMPL.render(input);
// input: messy text string OR YMPL YAML string (starting with 'schema_version:')
// returns:
//   result.doc      { schema_version, id, title, nodes, edges, meta }
//   result.yaml     YMPL 1.0 YAML string
//   result.svg      SVG string — full P&ID diagram with ISA 5.1 symbols
//   result.mermaid  Mermaid flowchart LR string
//   result.text     Plain English: "P-101 → CV-101 → R-101."
//   result.warnings Array of topology gap messages (empty = clean parse)

// ── Async with LLM fallback ───────────────────────────────────────────────────
const result = await YMPL.renderAsync(input, {
  llm: {
    provider: 'ollama',                    // 'ollama' or 'haiku'
    url:      'http://localhost:11434',
    model:    'llama3.2:1b',
    examples: [{ input: '...', yaml: '...' }]  // optional few-shot corrections
  }
});
// result.usedLlm: boolean — true if LLM improved the result

// ── Individual converters ─────────────────────────────────────────────────────
YMPL.parse(text)        // text → doc
YMPL.fromYaml(str)      // yaml string → doc
YMPL.toYaml(doc)        // doc → YAML string
YMPL.toText(doc)        // doc → plain English
YMPL.toSvg(doc)         // doc → SVG string
YMPL.toMermaid(doc)     // doc → Mermaid flowchart LR string
YMPL.checkWarnings(doc.nodes, doc.edges, sourceText)  // → string[]
```

---

## Vocabulary Sources

Two documents compiled into KINDS inline — no external files at runtime:

| Source | Coverage |
|---|---|
| `Process_WordBank_with_Synonyms.docx` | Process equipment: vessel, pump, valve, heat_exchanger, column, reactor, separator, absorber, adsorption, relief, filter, meter |
| `IST_Vocabulary.docx` (AIRCO, April 2026) | Instrumentation: transmitter, controller, indicator, recorder, switch, analyzer, element — based on Lipták's Instrument Engineers' Handbook Vol. 1 (4th Ed.) and Yeturu/Reddy Industrial Instrumentation |

### TYPOS normaliser — field shorthand handled

| Input | → Canonical |
|---|---|
| `annubar` | averaging pitot tube |
| `magmeter`, `mag flow` | magnetic flowmeter |
| `PT100`, `Pt1000`, `PRTD` | rtd |
| `DVC` | valve positioner |
| `4-20 mA` (in context) | transmitter |
| `pumpp`, `cntrol valev` | pump, control valve |
| `seprator`, `kompressur` | separator, compressor |

---

## Three-Tier Parsing

1. **Tier 1 — Rule-based** (always runs): TYPOS → extractNodes → reorderNodes (topological) → buildEdges → classifySignalEdges. Handles most standard P&ID descriptions and all ISA tag chains.

2. **Tier 2 — Warning detection**: `checkWarnings` flags topology gaps (bypass/recycle keyword found but no corresponding edge built). These warnings trigger the LLM offer in the viewer.

3. **Tier 3 — LLM fallback** (optional, user-triggered): Sends original text to Ollama or Claude Haiku with the full YMPL schema + vocabulary prompt. LLM returns YAML which is then validated by `fromYaml`. Tier 1 result kept if LLM fails. Few-shot corrections from user's saved examples are prepended to the prompt.

---

## Topology the Parser Handles

| Pattern | Example | Result |
|---|---|---|
| Arrow chain | `FT-101 → FIC-101 → CV-101 → R-101` | Sequential stream + signal edges |
| Bypass | `separator with bypass around CV-101` | bypass edge |
| Recycle | `recycle line back to feed tank` | recycle edge |
| Instrument loop | `FT-101 → FIC-101 → CV-101` | signal edges (auto) |
| Inverted verb | `V-201 receives flow from P-101` | correct order P-101 → V-201 |
| Upstream/downstream | `E-101 upstream of R-101` | correct ordering |

**Parser limitation:** Two streams converging at one node (e.g. two feeds meeting at a preheat exchanger) must be expressed in YAML directly — the text parser builds a linear chain and cannot auto-detect convergence points from prose. Use `fromYaml` / hand-authored YAML for split/merge topologies.

---

## Example: Simple Text Parse

**Input:**
```
feed tank through P-101 through CV-101 to separator V-201, bypass around CV-101
```

**Output YAML:**
```yaml
schema_version: ympl-1.0
id: feed_tank_to_v_201
title: Feed Tank to V-201
nodes:
  - id: n1
    label: Feed Tank
    kind: vessel
  - id: n2
    label: P-101
    kind: pump
  - id: n3
    label: CV-101
    kind: valve
  - id: n4
    label: V-201
    kind: separator
edges:
  - from: n1
    to: n2
    kind: stream
  - from: n2
    to: n3
    kind: stream
  - from: n3
    to: n4
    kind: stream
  - from: n2
    to: n4
    kind: bypass
    label: Bypass
meta:
  confidence: high
  source_text: "feed tank through P-101 through CV-101 to separator V-201, bypass around CV-101"
```

## Example: Instrument Loop

**Input:**
```
FE-101 → FT-101 → FIC-101 → CV-101
```

**Output YAML:**
```yaml
schema_version: ympl-1.0
nodes:
  - id: n1
    label: FE-101
    kind: element
  - id: n2
    label: FT-101
    kind: transmitter
  - id: n3
    label: FIC-101
    kind: controller
  - id: n4
    label: CV-101
    kind: valve
edges:
  - from: n1
    to: n2
    kind: signal
  - from: n2
    to: n3
    kind: signal
  - from: n3
    to: n4
    kind: signal
```

## Example: Complex Topology (YAML-authored)

See `scenarios/hydrotreater.yaml` — two-feed hydrotreater with:
- Hydrocarbon feed (10,000 kg/hr, ~2 wt% S): Feed Tank → P-101 → FCV-101 → E-101
- H2 feed (150 kg/hr, 450 psig): H2 Header → K-101 → FCV-102 → E-101
- Main flow: E-101 → R-101 (fixed-bed PFR) → E-102 → V-101 (HP separator)
- Gas outlet: V-101 → PCV-101 (to vent) + K-102 recycle compressor → E-101
- Liquid product: V-101 → P-102

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Single file | Portable — copy ympl.js to any app, no install, no bundler |
| Text order = flow order | Greedy left-to-right scan preserves process sequence naturally |
| Longest match wins | "flash drum" matched before "drum" via SORTED_TERMS |
| Signal auto-classification | Instrument→instrument/valve edges always signal, no manual tagging |
| ISA 5.1 P&ID symbols in SVG | Symbols encode equipment type visually (circle=instrument, bowtie=valve, etc.) |
| Tag prefix up to 5 chars | Allows LSHH, TSHH, PSLL, TSLL to resolve correctly |
| Mermaid output | Text-based symbolic representation for SDK-to-SDK and documentation |
| No Python | JS only — runs in browser and Node without any runtime dependency except js-yaml |
| LLM as Tier 3 only | Rule-based Tier 1 is always fast and offline; LLM is optional improvement |

---

## Files in C:\ympl\

```
ympl.js              ← THE codec — single portable file, all logic
ympl_viewer.html     ← browser test/demo tool (Fit/1:1 toggle for wide diagrams)
YMPL_SPEC.md         ← YMPL 1.0 format specification
YMPL_USER_GUIDE.md   ← user documentation
CLAUDE.md            ← developer architecture reference (for Claude Code)
CONTEXT.md           ← this file — full context export for any AI tool
AGENTS.md            ← AI agent integration guide
test.js              ← verification suite (node test.js — all must pass)
start.bat            ← double-click to start viewer (node serve.js)
serve.js             ← local HTTP server + Anthropic API proxy
scenarios/
  hydrotreater.yaml  ← two-feed hydrotreater example (complex topology)
```

---

## What NOT to do (hard constraints)

- Do not split ympl.js into multiple files
- Do not add Python code — JS only
- Do not add runtime dependencies beyond js-yaml
- Do not use `mainPath[]` schema — schema is `nodes[]` + `edges[]`
- Do not reference `C:\ympl-standalone-sdk\` — that is the old superseded SDK
- Do not modify the YMPL 1.0 schema without updating YMPL_SPEC.md and test.js
- All 35+ tests in test.js must pass after every change

---

## Current Git State

Repository: `github.com:jeyreddy/standard.git`  
Branch: `main`  
Recent commits (newest first):
- `74f96a0` Fix SVG diagram display + add hydrotreater scenario
- `7db9ab0` Update CLAUDE.md and YMPL_USER_GUIDE.md
- `07ad05a` Add IST_Vocabulary.docx terms to KINDS, TYPOS, and LLM prompt
- `f049448` Add full ISA 5.1 instrumentation vocabulary, symbols, and signal edges
- `9c5710d` Replace box nodes with ISA 5.1 / ISO 10628 P&ID symbols in SVG output
- `f3943c4` Add toMermaid() output and start.bat launcher
