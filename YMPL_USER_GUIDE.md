# YMPL — Process Model Codec
## User Guide · v1.0

---

## What it does

YMPL converts **messy process text** into a **structured YAML model** and **SVG diagram** — and back again.

```
messy text  ──▶  YMPL YAML  +  SVG diagram
YMPL YAML   ──▶  plain text  +  SVG diagram
```

One portable file (`ympl.js`). Drops into any app — simulation, engineering, SCADA, web, CLI.

---

## Test it — the viewer

Open `ympl_viewer.html` in any browser (Chrome, Edge, Firefox). No server needed — double-click the file.

### Layout

```
┌─────────────────┬──────────────────────┬──────────────────────┐
│  Examples       │  Input               │  Output              │
│  (sidebar)      │  textarea            │  YAML / Text /       │
│                 │                      │  Diagram / Reference │
│  Click to load  │  Parse  ⚙ AI        │  ✦ AI-improved badge │
│                 │  ── warning bar ──   │                      │
└─────────────────┴──────────────────────┴──────────────────────┘
```

### Three ways to get input in

| Method | How |
|---|---|
| Click a sidebar example | Loads and parses immediately |
| Type or paste into the textarea | Press **Parse** or **Ctrl+Enter** |
| **Load file** button | Browse to any `.yaml` or `.txt` file on disk — loads and parses automatically |

### Sidebar examples

| Category | What it tests |
|---|---|
| Simple flows | Basic 3–4 node chains |
| ISA tag IDs | P-101, CV-101, V-201 auto-resolved to kind |
| Bypass & recycle | Bypass edge, recycle edge, synonym phrases |
| Messy / typos | Spelling errors normalised before parsing |
| Rich vocabulary | Word bank terms (sealless pump, fin-fan cooler, dbb valve…) |
| YAML → text + diagram | Paste YMPL YAML → get English text and diagram |

### Output tabs

| Tab | Shows |
|---|---|
| **YAML** | Generated YMPL 1.0 YAML — editable directly in the tab |
| **Text** | Plain English description of the process flow |
| **Diagram** | SVG process flow diagram |
| **Reference** | Full schema, vocabulary, and API reference |

---

## AI improvement

When the parser detects a possible topology gap (bypass or recycle keyword found but no corresponding edge built), an **orange warning bar** appears below the Parse button.

### Improve with AI — Ollama (local)

1. Click **⚙ AI** to open the AI settings row
2. Enter your Ollama URL (default: `http://localhost:11434`) and model (default: `llama3.2:1b`) — saved automatically to browser storage
3. When the warning bar appears, click **✦ Improve with AI** — or press **Ctrl+Shift+Enter** from anywhere in the input textarea
4. The codec sends the original text to Ollama, which extracts a full YMPL YAML; the result replaces the current output
5. A **✦ AI-improved** badge appears in the output tab bar when LLM output is in use

If Ollama is unreachable the Tier 1 (rule-based) result is kept and no error is shown.

### Corrections — teaching the AI

After any parse (Tier 1 or AI), the YAML tab is **editable**. You can fix node kinds, labels, or missing edges directly.

Once you're satisfied with the YAML:

1. Click **✓ Save correction** in the output tab bar
2. This stores `{ original input text → corrected YAML }` in browser storage
3. On subsequent **Improve with AI** calls, saved corrections are sent as few-shot examples in the LLM prompt — the model learns your naming conventions and domain vocabulary
4. The counter `N saved` shows how many corrections are loaded

Corrections persist across browser sessions (localStorage). Saving a correction for the same input text replaces the previous one.

---

## Input modes

### Mode 1 — Messy text → YAML + Diagram

Paste any English description of a process. Spelling errors, typos, abbreviations, ISA tag IDs — all handled.

**Examples:**

```
flash drum through trim cooler to product tank
```
```
pumpp pushes into cntrol valev and then to heet exhanger
```
```
tank 1 feeds P-101 through CV-101 to separator V-201, bypass around CV-101
```
```
suction drum to compressor K-101 to cooler E-101 to product drum, recycle line back to suction drum
```

### Mode 2 — YAML → Text + Diagram

Paste a YMPL YAML file (starts with `schema_version: ympl-1.0`) **or load one from disk using the Load file button**. The codec generates a plain English description and SVG diagram.

**Example:**

```yaml
schema_version: ympl-1.0
id: p101_train
title: P-101 Train
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
    kind: vessel
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
  source_text: manual
```

Output text: `Feed Tank → P-101 → CV-101 → V-201. Bypass from P-101 to V-201.`

### Round-trip test

1. Type messy text → Parse → copy the YAML from the YAML tab
2. Clear → paste that YAML into input → Parse
3. You get the same diagram and a plain English description

---

## Output — YMPL 1.0 Schema

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
    kind: vessel

edges:
  - from: n1
    to: n2
    kind: stream          # main flow
  - from: n2
    to: n3
    kind: stream
  - from: n3
    to: n4
    kind: stream
  - from: n2
    to: n4
    kind: bypass          # bypass edge
    label: Bypass

meta:
  confidence: high        # high | medium | low | none
  source_text: "original input"
```

**Node kinds:** `vessel` · `pump` · `valve` · `checkvalve` · `heat_exchanger` · `compressor` · `column` · `reactor` · `relief` · `filter` · `meter`

**Edge kinds:** `stream` (main flow) · `bypass` · `recycle`

---

## Vocabulary — what it understands

### Equipment (450+ synonyms from the Process Word Bank)

| Kind | Recognised terms (examples) |
|---|---|
| vessel | tank, drum, separator, flash drum, suction drum, overhead accumulator, ko drum, slug catcher, hot well, day tank, slop tank, seal pot, blowdown drum, buffer vessel… |
| pump | pump, centrifugal pump, dosing pump, sealless pump, mag-drive pump, diaphragm pump, multistage pump, reflux pump, charge pump, duty pump… |
| valve | valve, control valve, gate valve, ball valve, dbb valve, esdv, anti-surge valve, blowdown valve, motor operated valve, hand operated valve, spectacle blind, back pressure regulator, bpr… |
| checkvalve | check valve, nrv, non-return valve, backflow preventer, swing check, wafer check, dual disc check valve… |
| heat_exchanger | heat exchanger, trim cooler, fin-fan cooler, s&t heat exchanger, reboiler, condenser, fired heater, furnace, air-cooled heat exchanger, hairpin exchanger, waste heat boiler, u-tube bundle… |
| compressor | compressor, blower, fan, recip compressor, turbocompressor, screw compressor, recycle compressor, gas expander… |
| column | column, fractionator, distillation column, absorber, stripper, sour water stripper… |
| reactor | reactor, cstr, pfr, fixed bed reactor, fluidised bed reactor… |
| relief | psv, rupture disc, conservation vent, safety valve, p/v valve… |
| filter | strainer, coalescer, basket strainer, y-strainer, duplex strainer, bag filter, cartridge filter, mist eliminator… |

### ISA tag IDs (auto-resolved)

| Prefix | Kind |
|---|---|
| P-101 | pump |
| CV-101, FV-101, LV-101, PV-101 | valve |
| E-101 | heat_exchanger |
| K-101 | compressor |
| V-101, D-101, T-101 | vessel |
| C-101 | column |
| R-101 | reactor |

### Topology keywords

| Phrase | Effect in YAML |
|---|---|
| `bypass around X` | bypass edge from predecessor → successor of X |
| `parallel path around X` | same as bypass |
| `crossover around X` | same as bypass |
| `recycle line back to X` | recycle edge from last node → X |
| `return line to X` | same as recycle |
| `recirculation line back to X` | same as recycle |
| `product recycle to X` | same as recycle |

### Typo normalisation (examples)

`pumpp` → pump · `cntrol valev` → control valve · `heet exhanger` → heat exchanger ·
`seprator` → separator · `kompressur` → compressor · `blwer` → blower ·
`frum` → from · `thru` → through · `receeeeyycle` → recycle

---

## Embedding in an app

### Browser

```html
<script src="https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js"></script>
<script src="ympl.js"></script>
<script>
  const result = YMPL.render("flash drum through trim cooler to product tank");
  document.getElementById('diagram').innerHTML = result.svg;
  document.getElementById('yaml-out').value    = result.yaml;
</script>
```

### Node.js

```js
const YMPL = require('./ympl.js');

const result = YMPL.render("flash drum through trim cooler to product tank");
console.log(result.yaml);   // YMPL 1.0 YAML
console.log(result.text);   // "Flash Drum → Trim Cooler → Product Tank."
// result.svg  — SVG string, write to file or serve
// result.doc  — { nodes, edges, ... } JS object
```

### Working with the doc object directly

```js
const doc  = YMPL.parse("feed tank through P-101 to separator");
const yaml = YMPL.toYaml(doc);
const svg  = YMPL.toSvg(doc);
const text = YMPL.toText(doc);

// Round-trip from YAML
const doc2 = YMPL.fromYaml(yamlString);
```

### AI improvement — `renderAsync`

```js
// User explicitly triggered (e.g. button click / keyboard shortcut)
const result = await YMPL.renderAsync(text, {
  llm: {
    provider: 'ollama',
    url:      'http://localhost:11434',
    model:    'llama3.2:1b',
    // Optional: few-shot corrections loaded from storage
    examples: [{ input: 'co2 tank to bpr to reactor', yaml: '...' }]
  }
});

if (result.usedLlm) {
  console.log('AI-improved result');
} else {
  console.log('LLM unavailable — Tier 1 result');
  console.log(result.warnings);  // e.g. ['bypass keyword detected but no bypass edge built']
}
```

The LLM is **never called automatically** — only when `options.llm` is passed. Degrades gracefully: if the LLM call fails, the synchronous Tier 1 result is returned.

---

## Confidence levels

| Level | Meaning |
|---|---|
| `high` | 3+ nodes found, topology is clear |
| `medium` | 2 nodes found |
| `low` | 1 node found — source/target missing |
| `none` | No equipment recognised |

Low/none confidence usually means the input needs more context, or contains terms not yet in the vocabulary. Use **Improve with AI** (Ctrl+Shift+Enter) to let an LLM attempt a better extraction.

---

## Files

| File | Purpose |
|---|---|
| `ympl.js` | The codec — copy this to any app |
| `ympl_viewer.html` | Test viewer — open in browser |
| `YMPL_USER_GUIDE.md` | This document |
