// scenarios.js — YMPL robustness test cases
// Each scenario has:
//   id          — unique name
//   input       — raw text (messy or clean)
//   expected    — ground-truth nodes and edges (by index)
//
// expected.nodes: array of { kind, labelIncludes }
//   kind         — exact kind string
//   labelIncludes — substring the label must contain (case-insensitive)
//
// expected.edges: array of { fromIdx, toIdx, kind }
//   fromIdx / toIdx — index into expected.nodes
//   kind — 'stream' | 'bypass' | 'recycle'

module.exports = [

  // ── 1. Simple linear ──────────────────────────────────────────────────────
  {
    id: 'simple_linear',
    input: 'flash drum through trim cooler to product tank',
    expected: {
      nodes: [
        { kind: 'separator',      labelIncludes: 'flash' },
        { kind: 'heat_exchanger', labelIncludes: 'cooler' },
        { kind: 'vessel',         labelIncludes: 'tank' },
      ],
      edges: [
        { fromIdx: 0, toIdx: 1, kind: 'stream' },
        { fromIdx: 1, toIdx: 2, kind: 'stream' },
      ],
    },
  },

  // ── 2. ISA tag IDs ────────────────────────────────────────────────────────
  {
    id: 'isa_tags',
    input: 'tank feeds P-101 through CV-101 to separator V-201',
    expected: {
      nodes: [
        { kind: 'vessel',    labelIncludes: 'tank' },
        { kind: 'pump',      labelIncludes: 'P-101' },
        { kind: 'valve',     labelIncludes: 'CV-101' },
        { kind: 'separator', labelIncludes: 'V-201' },
      ],
      edges: [
        { fromIdx: 0, toIdx: 1, kind: 'stream' },
        { fromIdx: 1, toIdx: 2, kind: 'stream' },
        { fromIdx: 2, toIdx: 3, kind: 'stream' },
      ],
    },
  },

  // ── 3. Typos ──────────────────────────────────────────────────────────────
  {
    id: 'typos',
    input: 'pumpp pushes into cntrol valev and then to heet exhanger',
    expected: {
      nodes: [
        { kind: 'pump',           labelIncludes: 'pump' },
        { kind: 'valve',          labelIncludes: 'valve' },
        { kind: 'heat_exchanger', labelIncludes: 'exchanger' },
      ],
      edges: [
        { fromIdx: 0, toIdx: 1, kind: 'stream' },
        { fromIdx: 1, toIdx: 2, kind: 'stream' },
      ],
    },
  },

  // ── 4. Parallel bypass valve ──────────────────────────────────────────────
  {
    id: 'bypass_valve',
    input: 'three feed streams to H-101. H-101 to CV-101 and CV-101-BP in parallel, both to R-101. R-101 to SEP-101 to CV-102 to T-101.',
    expected: {
      nodes: [
        { kind: 'vessel',   labelIncludes: 'feed' },
        { kind: 'vessel',   labelIncludes: 'feed' },
        { kind: 'vessel',   labelIncludes: 'feed' },
        { kind: 'vessel',   labelIncludes: 'H-101' },
        { kind: 'valve',    labelIncludes: 'CV-101' },
        { kind: 'valve',    labelIncludes: 'CV-101-BP' },
        { kind: 'reactor',  labelIncludes: 'R-101' },
        { kind: 'separator',labelIncludes: 'SEP-101' },
        { kind: 'valve',    labelIncludes: 'CV-102' },
        { kind: 'vessel',   labelIncludes: 'T-101' },
      ],
      edges: [
        { fromIdx: 3, toIdx: 4, kind: 'stream' },
        { fromIdx: 3, toIdx: 5, kind: 'stream' },
        { fromIdx: 4, toIdx: 6, kind: 'stream' },
        { fromIdx: 5, toIdx: 6, kind: 'stream' },
        { fromIdx: 6, toIdx: 7, kind: 'stream' },
        { fromIdx: 7, toIdx: 8, kind: 'stream' },
        { fromIdx: 8, toIdx: 9, kind: 'stream' },
      ],
    },
  },

  // ── 5. Distillation column with recycles ─────────────────────────────────
  {
    id: 'distillation_recycle',
    input: 'feed to a distillation column. overhead vapor goes to a partial condenser, condensate returns as reflux. bottoms go to a reboiler, vapor returns to column.',
    expected: {
      nodes: [
        { kind: 'vessel',         labelIncludes: 'feed' },
        { kind: 'column',         labelIncludes: 'column' },
        { kind: 'heat_exchanger', labelIncludes: 'condenser' },
        { kind: 'heat_exchanger', labelIncludes: 'reboiler' },
      ],
      edges: [
        { fromIdx: 0, toIdx: 1, kind: 'stream' },
        { fromIdx: 1, toIdx: 2, kind: 'stream' },
        { fromIdx: 2, toIdx: 1, kind: 'recycle' },
        { fromIdx: 1, toIdx: 3, kind: 'stream' },
        { fromIdx: 3, toIdx: 1, kind: 'recycle' },
      ],
    },
  },

  // ── 6. Compressor with anti-surge ────────────────────────────────────────
  {
    id: 'compressor_antisurge',
    input: 'suction drum to centrifugal compressor K-101 with anti-surge valve ASV-101 in recycle. discharge goes to after-cooler E-101 then to high pressure separator.',
    expected: {
      nodes: [
        { kind: 'separator',      labelIncludes: 'drum' },
        { kind: 'compressor',     labelIncludes: 'K-101' },
        { kind: 'valve',          labelIncludes: 'ASV-101' },
        { kind: 'heat_exchanger', labelIncludes: 'E-101' },
        { kind: 'separator',      labelIncludes: 'separator' },
      ],
      edges: [
        { fromIdx: 0, toIdx: 1, kind: 'stream' },
        { fromIdx: 1, toIdx: 2, kind: 'recycle' },
        { fromIdx: 1, toIdx: 3, kind: 'stream' },
        { fromIdx: 3, toIdx: 4, kind: 'stream' },
      ],
    },
  },

  // ── 7. Messy free-form description ───────────────────────────────────────
  {
    id: 'messy_freeform',
    input: 'mutiple feeds connected a flow meter and then to a single tube reactor with heating jacket and outlet is passed though a seperator',
    expected: {
      nodes: [
        { kind: 'meter',     labelIncludes: 'meter' },
        { kind: 'reactor',   labelIncludes: 'reactor' },
        { kind: 'separator', labelIncludes: 'sep' },
      ],
      edges: [
        { fromIdx: 0, toIdx: 1, kind: 'stream' },
        { fromIdx: 1, toIdx: 2, kind: 'stream' },
      ],
    },
  },

  // ── 8. Absorption train ───────────────────────────────────────────────────
  {
    id: 'absorption_train',
    input: 'gas feed to absorber, lean solvent from top. rich solvent to stripper with reboiler. overhead from stripper to condenser and reflux drum.',
    expected: {
      nodes: [
        { kind: 'absorber',       labelIncludes: 'absorber' },
        { kind: 'absorber',       labelIncludes: 'stripper' },
        { kind: 'heat_exchanger', labelIncludes: 'reboiler' },
        { kind: 'heat_exchanger', labelIncludes: 'condenser' },
        { kind: 'vessel',         labelIncludes: 'drum' },
      ],
      edges: [
        { fromIdx: 0, toIdx: 1, kind: 'stream' },
        { fromIdx: 1, toIdx: 2, kind: 'stream' },
        { fromIdx: 1, toIdx: 3, kind: 'stream' },
        { fromIdx: 3, toIdx: 4, kind: 'stream' },
      ],
    },
  },

];
