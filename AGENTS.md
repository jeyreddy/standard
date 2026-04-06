# YMPL — AI Agent Integration Guide
> For AI agents (Claude, GPT, Gemini, Copilot) working with this codebase.
> Read CONTEXT.md first for full project background.

---

## How to Use YMPL as an Agent

YMPL is a **JavaScript SDK**. You interact with it by reading/editing `ympl.js` and running `node test.js` to verify changes. The viewer (`ympl_viewer.html`) is for human testing only.

### Run tests after every change
```bash
cd C:\ensim\ympl
node test.js
```
All tests must pass. Do not commit if any test fails.

### Quick smoke test
```bash
node -e "
const YMPL = require('./ympl.js');
const r = YMPL.render('feed tank through P-101 to separator V-201');
console.log(r.doc.nodes.map(n => n.label + ':' + n.kind).join(', '));
"
```

---

## When Adding Vocabulary

YMPL's vocabulary lives in two places in `ympl.js`:

### 1. `KINDS` object (rules — Tier 1)
Add synonyms to the appropriate kind array. Terms are matched by longest-first greedy scan.

```js
// Example: add a new synonym for transmitter
transmitter: [
  // ... existing terms ...
  'radar transmitter',   // ← add here
],
```

Rules:
- Multi-word terms match before single-word terms (sorting is automatic)
- Add the MOST SPECIFIC term first (e.g. "differential pressure transmitter" before "transmitter")
- Do NOT duplicate terms across kinds — last match wins but creates confusion

### 2. `TAG_KIND` object (ISA tag prefix → kind)
Add new ISA tag prefixes here. Prefix regex is `[A-Za-z]{1,5}` — supports up to 5-letter prefixes.

```js
TAG_KIND = {
  // ...
  xt: 'transmitter',   // ← new prefix
}
```

### 3. `_VOCAB` string (LLM — Tier 3)
Update the LLM vocabulary prompt to mention new terms. Format:

```js
'kindname    : preferred term, synonym 1, synonym 2, ISA tag note',
```

### 4. `TYPOS` array (field shorthand normalisation)
Add regex replacements for non-standard field terms:

```js
[/\bnew_shorthand\b/gi, 'canonical term'],
```

After adding vocabulary, run `node test.js`. Add a test to `test.js` if coverage is new.

---

## When Adding a New Node Kind

1. Add to `KINDS` with term array
2. Add to `TAG_KIND` if there are ISA tag prefixes
3. Add to `COLORS` in `toSvg` (border + text + bg)
4. Add a case to `_pidSymbol` with the ISA SVG symbol
5. Add to `_MERMAID_SHAPE`
6. Update `_INSTR_KINDS` if it's an instrument kind (triggers signal edge auto-classification)
7. Add to `_VOCAB` for LLM
8. Update LLM system prompt kind list
9. Add test cases to `test.js`
10. Update `CONTEXT.md`, `CLAUDE.md`, `YMPL_USER_GUIDE.md`

---

## When Editing the SVG Renderer (`toSvg`)

- Node box is **80 × 72 px** (`NW=80, NH=72`)
- Edge connections at **(x, y+36)** left and **(x+80, y+36)** right
- Symbol center: **cx = x+40, cy = y+30** (shifted 6px up from mid to leave room for label)
- Label baseline: **y+66** (bottom 6px of box)
- Instrument bubbles carry tag letters inside — suppress external label for instrument kinds
- All symbols must work at the connection points: circle symbols should visually align with the edge entry/exit at y+36

### ISA 5.1 symbol conventions used
| Symbol | Kind |
|---|---|
| Circle + filled triangle (impeller) | pump |
| Circle + open triangle + shaft | compressor |
| Bowtie (two triangles) + actuator circle | valve / checkvalve |
| Vertical cylinder (elliptical caps) | vessel |
| Horizontal drum + dashed interface | separator |
| Tall cylinder + tray lines | column |
| Circle + agitator shaft + arms | reactor |
| Shell rectangle + U-bends | heat_exchanger |
| Tall cylinder + packing lines | absorber |
| Plain circle (field bubble) | transmitter, indicator |
| Circle + horizontal bar | controller, recorder |
| Circle + diagonal line | switch |
| Diamond + inner circle | analyzer |
| Filled diamond | element |

---

## When Adding Topology Features (bypass/recycle/signal)

Topology detection lives in `buildEdges(nodes, text)`:
- **Bypass**: patterns at Steps 3 & 4
- **Recycle**: patterns at Steps 5a & 5b
- **Signal**: `classifySignalEdges(nodes, edges)` called from `parse()` — post-process only

Signal classification rule: if source kind is in `_INSTR_KINDS` AND target is in `_INSTR_KINDS` or is `valve`/`checkvalve` → `kind: signal`.

To add a new topology pattern:
1. Add a regex in `buildEdges`
2. Add a test case in `test.js`
3. Add to `checkWarnings` if it needs a "gap detected" warning

---

## When Writing YMPL YAML Manually

Use this template:

```yaml
schema_version: ympl-1.0
id: process_slug
title: Human Readable Title
nodes:
  - id: n1
    label: P-101        # ISA tag or descriptive name
    kind: pump          # one of the 20 kinds
edges:
  - from: n1
    to: n2
    kind: stream        # stream | bypass | recycle | signal
    label: Optional     # only needed for bypass/recycle/signal labels
meta:
  confidence: high
  source_text: manual
```

**For complex topologies** (two feeds converging, three-way splits):
- Write YAML directly — the text parser cannot detect convergence from prose
- Multiple edges pointing TO the same node are valid (fan-in)
- Multiple edges pointing FROM the same node are valid (fan-out / split)
- Recycle edges are back-edges: `from: last_node, to: upstream_node, kind: recycle`

---

## Testing Conventions

Tests live in `test.js`. Each test uses `assert(condition, message)`.

```js
// Pattern for a new vocabulary test:
{
  const r = YMPL.render('your test input here');
  assert(r.doc.nodes.length === 3,           'node count');
  assert(r.doc.nodes[0].kind === 'transmitter', 'kind check');
  assert(r.doc.nodes[1].label === 'FIC-101', 'label check');
  assert(r.doc.edges[0].kind === 'signal',   'edge kind');
}
```

Run `node test.js` — output must end with `ALL TESTS PASSED`.

---

## Common Mistakes to Avoid

| Mistake | Correct approach |
|---|---|
| Splitting ympl.js | Never — it must stay a single portable file |
| Adding Python | JS only — the entire stack is JavaScript |
| Using `mainPath[]` | Use `nodes[]` + `edges[]` (YMPL 1.0 schema) |
| Importing from ympl-standalone-sdk | Dead project — use ympl.js only |
| Committing with failing tests | All 35+ tests must pass |
| Creating new files for vocabulary | Add to KINDS/TAG_KIND/TYPOS inside ympl.js |
| Adding external npm dependencies | Only js-yaml is allowed at runtime |
| Hardcoding pixel positions in SVG | Use NW/NH/cx/cy constants — layout is calculated |

---

## Quick Reference: Result Object Shape

```js
const result = YMPL.render(input);

result.doc = {
  schema_version: 'ympl-1.0',
  id: 'slug',
  title: 'Title',
  nodes: [
    { id: 'n1', label: 'P-101', kind: 'pump' },
    ...
  ],
  edges: [
    { from: 'n1', to: 'n2', kind: 'stream' },
    { from: 'n2', to: 'n3', kind: 'signal', label: 'optional' },
    { from: 'n3', to: 'n1', kind: 'recycle', label: 'Recycle' },
    ...
  ],
  meta: {
    confidence: 'high',   // high | medium | low | none
    source_text: '...'
  }
};

result.yaml     // string — YMPL 1.0 YAML
result.svg      // string — full SVG with P&ID symbols
result.mermaid  // string — Mermaid flowchart LR
result.text     // string — "P-101 → CV-101 → R-101."
result.warnings // string[] — topology gap messages
```
