# YMPL — YAML Markup for Process Language
## Specification · Version 1.0
## Date: 2026-03-31

---

## 1. Purpose

YMPL is an open, lightweight schema for describing industrial process flows.

A YMPL document captures:
- what equipment exists in a process
- how that equipment is connected
- what topology relationships exist (main flow, bypass, recycle)

A YMPL document does **not** capture:
- thermodynamic state (temperatures, pressures, compositions)
- instrument tag databases
- control logic
- simulation parameters

Those concerns belong to the layers that consume YMPL — simulation engines, engineering tools, SCADA systems. YMPL is the interchange format between them.

---

## 2. Design principles

- **Human-readable.** Any process engineer reads and understands a YMPL file without training.
- **Minimal by default.** A valid document needs only `schema_version`, `nodes`, and `edges`.
- **Generated or authored.** YMPL documents can be hand-written, generated from text, or exported from tools.
- **Portable.** Plain YAML. No binary, no vendor lock-in.
- **Stable IDs.** Node IDs are stable references. Labels may change; IDs should not.

---

## 3. File format

- File extension: `.yaml` or `.yml`
- Encoding: UTF-8
- YAML version: 1.1 or 1.2 compliant
- First key must be `schema_version: ympl-1.0`

---

## 4. Top-level structure

```yaml
schema_version: ympl-1.0       # required — must be exactly "ympl-1.0"
id: string                      # required — unique slug, lowercase, underscores
title: string                   # required — human readable name
nodes: [ Node ]                 # required — list of equipment nodes
edges: [ Edge ]                 # required — list of connections (may be empty)
meta: Meta                      # optional — provenance and confidence
```

---

## 5. Node object

```yaml
- id: string       # required — unique within document, e.g. n1, n2, v101, p101
  label: string    # required — display name, e.g. "Feed Tank", "P-101", "CV-101"
  kind: Kind       # required — equipment category (see §6)
```

### Rules

- `id` must be unique within the document.
- `id` should be stable — do not change IDs once a document is shared.
- `label` is the human-facing name. Use ISA tag IDs where available (P-101, not "pump 1").
- `kind` must be one of the values defined in §6.

---

## 6. Node kinds

| Kind | Description | Typical examples |
|---|---|---|
| `vessel` | Pressure vessels, tanks, drums, separators, accumulators | Flash drum, feed tank, overhead accumulator, ko drum |
| `pump` | Centrifugal, reciprocating, dosing, gear pumps | P-101, centrifugal pump, mag-drive pump |
| `valve` | Control valves, isolation valves, block valves | CV-101, gate valve, ball valve, dbb valve |
| `checkvalve` | Non-return valves, backflow preventers | NRV, check valve, swing check |
| `heat_exchanger` | Shell & tube, plate, air coolers, reboilers, condensers | E-101, trim cooler, fin-fan cooler, reboiler |
| `compressor` | Centrifugal, reciprocating, screw compressors, blowers | K-101, blower, recip compressor |
| `column` | Distillation, absorption, stripping columns | C-101, fractionator, absorber |
| `reactor` | Fixed bed, CSTR, PFR, batch reactors | R-101, reactor, cstr |
| `relief` | PSVs, rupture discs, conservation vents | PSV-101, rupture disc, p/v valve |
| `filter` | Strainers, coalescers, mist eliminators | Strainer, coalescer |
| `meter` | Flow meters, orifice plates, Coriolis meters | FT-101, orifice plate |
| `unknown` | Equipment that cannot be classified | Use only when kind cannot be determined |

---

## 7. Edge object

```yaml
- from: string     # required — id of source node
  to: string       # required — id of target node
  kind: EdgeKind   # optional — defaults to "stream"
  label: string    # optional — display label, e.g. "Bypass", "Recycle"
```

### Rules

- `from` and `to` must reference valid node `id` values within the same document.
- Self-loops (`from` == `to`) are not valid.
- Multiple edges between the same pair of nodes are allowed (e.g. a stream edge and a bypass edge).
- Direction is significant: `from` is upstream, `to` is downstream.

---

## 8. Edge kinds

| Kind | Description |
|---|---|
| `stream` | Main process flow — the primary path through the equipment |
| `bypass` | An alternative path that skips one or more nodes |
| `recycle` | A return path flowing backwards (downstream node back to upstream node) |

If `kind` is omitted, `stream` is assumed.

---

## 9. Meta object

```yaml
meta:
  confidence: Confidence   # optional — see §10
  source_text: string      # optional — original text input that generated this document
```

---

## 10. Confidence levels

Applies when a YMPL document is generated from text (not hand-authored).

| Value | Meaning |
|---|---|
| `high` | 3 or more nodes found; topology is unambiguous |
| `medium` | 2 nodes found |
| `low` | 1 node found; source or target is missing |
| `none` | No equipment recognised in the input |

Hand-authored documents should omit `confidence` or set it to `high`.

---

## 11. Complete example — simple flow

```yaml
schema_version: ympl-1.0
id: feed_to_separator
title: Feed to Separator

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

meta:
  confidence: high
  source_text: feed tank feeds P-101 through CV-101 to separator V-201
```

---

## 12. Complete example — with bypass and recycle

```yaml
schema_version: ympl-1.0
id: compressor_circuit
title: Compressor Circuit

nodes:
  - id: n1
    label: Suction Drum
    kind: vessel
  - id: n2
    label: K-101
    kind: compressor
  - id: n3
    label: CV-101
    kind: valve
  - id: n4
    label: E-101
    kind: heat_exchanger
  - id: n5
    label: Product Drum
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
  - from: n4
    to: n5
    kind: stream
  - from: n2
    to: n4
    kind: bypass
    label: Bypass
  - from: n5
    to: n1
    kind: recycle
    label: Recycle

meta:
  confidence: high
  source_text: manual
```

---

## 13. Validation rules

| Rule | Severity | Check |
|---|---|---|
| schema_version present | error | First key must be `schema_version: ympl-1.0` |
| id present | error | Top-level `id` must exist and be non-empty |
| title present | error | Top-level `title` must exist and be non-empty |
| nodes is list | error | `nodes` must be a YAML sequence |
| node.id unique | error | No two nodes share the same `id` |
| node.id present | error | Every node must have `id` |
| node.label present | error | Every node must have `label` |
| node.kind valid | error | `kind` must be one of the values in §6 |
| edge.from exists | error | `from` must reference a valid node `id` |
| edge.to exists | error | `to` must reference a valid node `id` |
| edge no self-loop | error | `from` must not equal `to` |
| edge.kind valid | warning | If present, `kind` must be stream, bypass, or recycle |
| confidence valid | warning | If present, must be high, medium, low, or none |
| isolated nodes | warning | Nodes with no edges are allowed but flagged |

---

## 14. Versioning

- This document describes `ympl-1.0`.
- The `schema_version` field carries the version.
- Future versions will increment the minor number for backwards-compatible additions (`ympl-1.1`) and the major number for breaking changes (`ympl-2.0`).
- A parser that reads `ympl-1.0` should reject documents with a different major version.

---

## 15. Relationship to other formats

| Format | Relationship |
|---|---|
| VPlant VIDS | YMPL is a simplified subset — YMPL carries topology only; VPlant carries full instrument, simulation, and P&ID data |
| DEXPI / ISO 15926 | YMPL is not alignment-compatible but uses ISA naming conventions |
| JSON | YMPL documents can be trivially represented as JSON using standard YAML-to-JSON conversion |

---

## 16. Files

| File | Purpose |
|---|---|
| `ympl.js` | Reference implementation — text ↔ YMPL codec |
| `ympl_viewer.html` | Interactive test viewer |
| `YMPL_USER_GUIDE.md` | Usage guide |
| `YMPL_SPEC.md` | This document |
