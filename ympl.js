// ympl.js  ·  YMPL Process Model Codec  ·  v1.0
// ─────────────────────────────────────────────────────────────────────────────
// Single portable file. Works in browser (script tag) and Node.js (require).
// Optional dependency: js-yaml (for YAML parsing from string).
//
// API
//   YMPL.render(input)     messy text OR yaml string → { doc, yaml, svg, text }
//   YMPL.parse(text)       messy text → doc
//   YMPL.fromYaml(str)     yaml string → doc
//   YMPL.toYaml(doc)       doc → yaml string
//   YMPL.toText(doc)       doc → plain English description
//   YMPL.toSvg(doc)        doc → SVG string
//
// Schema (ympl-1.0)
//   {
//     schema_version: 'ympl-1.0',
//     id: string,
//     title: string,
//     nodes: [{ id, label, kind }],
//     edges: [{ from, to, kind?, label? }],
//     meta: { confidence, source_text }
//   }
//
// Node kinds: vessel | pump | valve | checkvalve | heat_exchanger |
//             compressor | filter | meter | unknown
// Edge kinds: stream (default) | bypass | recycle
// ─────────────────────────────────────────────────────────────────────────────

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let yaml = null;
    try { yaml = require('js-yaml'); } catch (_) {}
    module.exports = factory(yaml);
  } else {
    root.YMPL = factory(root.jsyaml || null);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function (yaml) {

  const VERSION = 'ympl-1.0';

  // ─── ONTOLOGY ──────────────────────────────────────────────────────────────
  // Equipment kinds and all recognised synonyms.
  // Longest synonyms must match before shorter ones — sorted on build.

  // Full vocabulary — merged from Process_WordBank_with_Synonyms (308 terms, 848+ synonyms)
  const KINDS = {
    vessel: [
      // drums & specialty vessels
      'emergency blowdown vessel', 'liquid knockout vessel', 'mist eliminator vessel',
      'three-phase separator', 'two-phase separator', 'liquid-liquid separator',
      'oil-water separator', 'gas-liquid separator', 'gravity separator',
      'production separator', 'process separator', 'inlet separator',
      'low-pressure separator', 'lp separator', 'flash separator',
      'depressuring drum', 'blowdown vessel', 'overhead accumulator',
      'overhead receiver', 'distillate drum', 'condenser drum', 'overhead drum',
      'reflux drum', 'receiver drum', 'suction drum', 'buffer drum',
      'dampening vessel', 'hold-up vessel', 'surge vessel', 'flash vessel',
      'expansion vessel', 'let-down vessel', 'quench drum', 'relief drum',
      'settling vessel', 'gravity decanter', 'decantor vessel', 'phase separator',
      'condensate vessel', 'hot condensate tank', 'condensate pot',
      // tanks & storage
      'hot condensate tank', 'deaerator storage', 'product tank', 'feed tank',
      'storage vessel', 'bulk tank', 'holding tank', 'inventory tank',
      'service tank', 'header tank', 'duty tank', 'local tank', 'supply tank',
      'storage tank', 'condensate tank', 'settling tank',
      // sumps & pits
      'collection sump', 'drain sump', 'sump pit', 'drain pit',
      'catchment pit', 'drip tray',
      // scrubbers & contactors
      'suction scrubber', 'gas scrubber', 'wash vessel', 'wash column',
      'quench tower', 'contactor',
      // generic
      'process vessel', 'closed vessel', 'pressure container',
      'ko drum', 'flash drum', 'surge drum',
      'deaerator', 'accumulator', 'receiver', 'separator',
      'drum', 'vessel', 'tank', 'sump', 'boot',
    ],
    column: [
      'vacuum distillation unit', 'dividing wall column', 'fractionating column',
      'distillation column', 'distillation tower', 'fractionator',
      'separation column', 'stripping column', 'light ends stripper',
      'sour water stripper', 'steam stripper', 'isomer splitter',
      'product splitter', 'fine separator', 'vacuum tower', 'vdu column',
      'low-pressure column', 'desorber', 'absorber column', 'scrubber column',
      'stripper', 'absorber', 'scrubber', 'column',
    ],
    reactor: [
      'fluidised bed reactor', 'fixed bed reactor', 'plug flow reactor',
      'tubular reactor', 'batch reactor', 'cstr', 'pfr', 'reactor',
    ],
    pump: [
      'hermetically sealed pump', 'magnetic drive pump', 'mag-drive pump',
      'sealless pump', 'chemical injection pump', 'pd metering pump',
      'proportioning pump', 'injection pump', 'dosing pump',
      'centrifugal pump', 'reciprocating pump', 'rotodynamic pump',
      'single-stage pump', 'end-suction pump', 'volute pump',
      'gear pump', 'metering pump', 'booster pump', 'transfer pump',
      'process pump', 'operating pump', 'running pump', 'online pump',
      'service pump', 'spare pump', 'backup pump', 'reserve pump',
      'auto-start spare', 'standby unit', 'a-pump', 'b-pump',
      'standby pump', 'pump',
    ],
    compressor: [
      'positive displacement compressor', 'reciprocating compressor',
      'centrifugal compressor', 'api 618 compressor', 'api 617 compressor',
      'screw compressor', 'piston compressor', 'recip compressor',
      'dynamic compressor', 'radial compressor', 'turbocompressor',
      'turboexpander', 'expander', 'blower', 'fan', 'recip', 'compressor',
    ],
    heat_exchanger: [
      // shell & tube
      's&t heat exchanger', 'shell and tube heat exchanger', 'shell and tube',
      'tubular exchanger', 'tube bundle exchanger', 'sthe',
      // air coolers
      'fin-fan cooler', 'air fin cooler', 'aerial cooler',
      'forced draft cooler', 'induced draft cooler', 'ache',
      // plate
      'plate-and-frame hx', 'gasketed plate hx', 'plate heat exchanger',
      'compact heat exchanger', 'plate hx', 'phe',
      // feed/effluent
      'feed/effluent exchanger', 'f/e exchanger', 'cross exchanger', 'recuperator',
      // coolers
      'product trim cooler', 'final trim cooler', 'temperature control cooler',
      'finishing cooler', 'cooling trim hx', 'trim cooler', 'rundown cooler',
      'discharge cooler', 'after-cooler', 'aftercooler', 'final cooler',
      // reboilers
      'thermosyphon reboiler', 'natural circulation reboiler', 'vertical thermosiphon',
      'horizontal thermosiphon', 'kettle-type reboiler', 'once-through reboiler',
      'pool boiling reboiler', 'tsr', 'kettle hx', 'reboiler',
      // condensers
      'total overhead condenser', 'partial overhead condenser', 'full condenser',
      'complete condenser', 'reflux condenser', 'partial condenser',
      'after-condenser', 'final condenser', 'product condenser', 'condenser',
      // steam / heat recovery
      'heat recovery steam generator', 'waste heat recovery unit',
      'flue gas boiler', 'steam generator', 'hrsg', 'whb',
      // interstage
      'inter-stage heat exchanger', 'interstage cooler', 'intercooler', 'stage cooler',
      // vaporisers & heaters
      'feed vaporizer', 'liquid vaporizer', 'feed preheater', 'preheater',
      'economizer', 'evaporator', 'chiller', 'heater', 'cooler',
      'heat exchanger', 'exchanger',
    ],
    valve: [
      // isolation & block
      'double block and bleed', 'two-valve isolation with vent',
      'double isolation with bleed', 'dbb arrangement', 'dbb valve',
      'emergency isolation valve', 'safety shutoff valve', 'esdv', 'esv',
      'sis valve', 'trip valve', 'eiv',
      // ball valves
      'full-bore ball valve', 'reduced-bore ball valve', 'ball isolation valve',
      'ball cock', 'ball valve',
      // globe valves
      'globe stop valve', 'needle globe', 'stop valve', 'globe valve',
      // butterfly
      'lug-type butterfly', 'wafer butterfly', 'disc valve', 'butterfly valve', 'butterfly',
      // control valves
      'mass flow control valve', 'level regulating valve', 'tank outlet control valve',
      'flow throttle valve', 'process control valve', 'final control element',
      'modulating valve', 'smart positioner', 'back-pressure valve',
      'pressure reducing valve', 'flow regulator', 'lcv', 'pcv', 'fcv',
      // safety & relief type valves (non-relief-device)
      'safety relief valve', 'pressure relief valve',
      // generic
      'isolation valve', 'block valve', 'sluice valve', 'shut-off valve',
      'on/off valve', 'gate valve', 'regulating valve', 'throttle valve',
      'needle valve', 'pressure regulator', 'control valve', 'valve',
    ],
    checkvalve: [
      'non-return valve', 'backflow preventer', 'one-way valve',
      'swing check', 'lift check', 'check valve', 'nrv',
    ],
    relief: [
      'pressure vacuum vent', 'atmospheric vent valve', 'tank vent valve',
      'conservation vent', 'pressure-vacuum vent', 'p/v valve',
      'pressure safety valve', 'pressure relief valve', 'safety relief valve',
      'safety valve', 'pop valve', 'liquid relief valve',
      'heat expansion relief', 'trapped liquid relief',
      'rupture disc', 'bursting disc', 'bursting disk', 'burst disk',
      'pressure burst membrane', 'thermal psv', 'trv',
      'srv', 'psv', 'rd',
    ],
    filter: [
      'mist eliminator', 'coalescer', 'strainer', 'filter',
    ],
    meter: [
      'coriolis meter', 'mass flow meter', 'vortex meter', 'orifice plate',
      'flow meter', 'flowmeter', 'orifice', 'venturi',
    ],
  };

  // ISA tag prefix → kind
  const TAG_KIND = {
    p:  'pump',
    cv: 'valve', fv: 'valve', lv: 'valve', pv: 'valve',
    tv: 'valve', hv: 'valve', xv: 'valve', sv: 'valve',
    e:  'heat_exchanger',
    k:  'compressor',
    v:  'vessel', d:  'vessel', t:  'vessel',
    r:  'reactor', c:  'column',
    f:  'filter',
    ft: 'meter',
  };

  // Build sorted term list (longest first for greedy left-to-right match)
  const SORTED_TERMS = [];
  for (const [kind, terms] of Object.entries(KINDS)) {
    for (const term of terms) {
      SORTED_TERMS.push({ term: term.toLowerCase(), kind });
    }
  }
  SORTED_TERMS.sort((a, b) => b.term.length - a.term.length);

  // ─── NORMALIZER ────────────────────────────────────────────────────────────

  const TYPOS = [
    // Pumps
    [/\bpumpp\b/gi, 'pump'],
    [/\bpump s\b/gi, 'pump'],
    // Valves
    [/\bvalev\b/gi, 'valve'],
    [/\bvalv\b/gi, 'valve'],
    [/\bvlav\b/gi, 'valve'],
    [/\bcntrol\b/gi, 'control'],
    [/\bcontrl\b/gi, 'control'],
    // Heat exchangers
    [/\bheet\b/gi, 'heat'],
    [/\bexhanger\b/gi, 'exchanger'],
    [/\bexchanger\b/gi, 'exchanger'],
    // Separators / vessels
    [/\bseprator\b/gi, 'separator'],
    [/\bsepartor\b/gi, 'separator'],
    [/\bvesle\b/gi, 'vessel'],
    [/\bvesel\b/gi, 'vessel'],
    [/\bveseel\b/gi, 'vessel'],
    [/\bdrume\b/gi, 'drum'],
    [/\btnak\b/gi, 'tank'],
    // Compressors / blowers
    [/\bkompressur\b/gi, 'compressor'],
    [/\bkompresr\b/gi, 'compressor'],
    [/\bcompresser\b/gi, 'compressor'],
    [/\bcompresor\b/gi, 'compressor'],
    [/\bblwer\b/gi, 'blower'],
    // Reactors
    [/\breacter\b/gi, 'reactor'],
    // Check valves
    [/\bchek\b/gi, 'check'],
    [/\bchek\s+vlv\b/gi, 'check valve'],
    // Prepositions / connectors  (from word bank replacements)
    [/\bfrum\b|\bfron\b|\bfrm\b/gi, 'from'],
    [/\btoo\b|\btou\b/gi, 'to'],
    [/\bthru\b|\bthroughout\b/gi, 'through'],
    [/\bconected\b|\bconnnected\b/gi, 'connected'],
    [/\bchengvalve\b|\bcheck\s*valle\b/gi, 'check valve'],
    [/\bpump\s+bypass\b|\bcompressor\s+bypass\b/gi, 'bypass'],
    // Recycle / bypass
    [/\brecyle\b|\breycle\b|\breycycle\b/gi, 'recycle'],
    [/\blnie\b/gi, 'line'],
    // Liquids / gas
    [/\bggas\b/gi, 'gas'],
    [/\bliqid\b/gi, 'liquid'],
    // Collapse repeated characters (receeeeyycle → recycle handled above; others)
    [/([a-z])\1{3,}/gi, '$1$1'],
  ];

  const PREAMBLE = [
    /^(the\s+)?(process|diagram|flow|schematic|system)\s+(is|shows?|describes?|goes?)\s*/i,
    /^(here\s+is|this\s+is|we\s+have)\s+(a\s+)?(process\s+)?/i,
    /^(in\s+this\s+(process|system)[,\s]+)/i,
  ];

  function normalize(raw) {
    let t = String(raw || '').trim();
    for (const p of PREAMBLE) t = t.replace(p, '');
    for (const [re, rep] of TYPOS) t = t.replace(re, rep);
    return t.replace(/\s+/g, ' ').trim();
  }

  // ─── NODE EXTRACTION ───────────────────────────────────────────────────────
  // Scans left-to-right (text order ≈ flow order).
  // Longest-match equipment term wins. Tag IDs (P-101, CV-101) refine labels.

  function extractNodes(text) {
    const lower = text.toLowerCase();
    const len   = lower.length;
    const used  = new Uint8Array(len); // 1 = consumed
    const found = []; // { label, kind, start }

    let i = 0;
    while (i < len) {
      if (used[i]) { i++; continue; }

      let matched = false;

      // ── Try equipment terms (longest first) ──
      for (const { term, kind } of SORTED_TERMS) {
        const end = i + term.length;
        if (end > len) continue;
        if (lower.slice(i, end) !== term) continue;

        // Word-boundary check
        const pre  = i === 0        || /[\s,;.()\-\/]/.test(lower[i - 1]);
        const post = end >= len     || /[\s,;.()\-\/]/.test(lower[end]);
        if (!pre || !post) continue;

        // No overlap with already-consumed chars
        let overlap = false;
        for (let j = i; j < end; j++) { if (used[j]) { overlap = true; break; } }
        if (overlap) continue;

        // Mark term chars consumed
        for (let j = i; j < end; j++) used[j] = 1;

        // Look for a trailing ISA tag or number to use as the label
        let label = titleCase(term);
        let scanEnd = end;

        const afterSlice = text.slice(end);
        const tagM = afterSlice.match(/^\s+([A-Za-z]{1,3}-\d{3,4}[A-Za-z]?)\b/);
        const numM = afterSlice.match(/^\s+(\d+[A-Za-z]?)\b/);

        if (tagM) {
          label   = tagM[1].toUpperCase();
          scanEnd = end + tagM[0].length;
          for (let j = end; j < scanEnd; j++) used[j] = 1;
        } else if (numM && /^(tank|vessel|drum|pump|column|reactor|compressor|filter)$/i.test(term)) {
          label   = titleCase(term) + ' ' + numM[1];
          scanEnd = end + numM[0].length;
          for (let j = end; j < scanEnd; j++) used[j] = 1;
        }

        found.push({ label, kind, start: i });
        i = scanEnd;
        matched = true;
        break;
      }

      if (!matched) {
        // ── Try standalone ISA tag (e.g. CV-101 not preceded by a kind word) ──
        const tagM = text.slice(i).match(/^([A-Za-z]{1,3}-\d{3,4}[A-Za-z]?)\b/);
        if (tagM) {
          const pre = i === 0 || /[\s,;.()\-\/]/.test(text[i - 1]);
          if (pre) {
            const prefix = tagM[1].split('-')[0].toLowerCase();
            const kind   = TAG_KIND[prefix];
            if (kind) {
              let overlap = false;
              for (let j = i; j < i + tagM[1].length; j++) { if (used[j]) { overlap = true; break; } }
              if (!overlap) {
                for (let j = i; j < i + tagM[1].length; j++) used[j] = 1;
                found.push({ label: tagM[1].toUpperCase(), kind, start: i });
                i += tagM[1].length;
                matched = true;
              }
            }
          }
        }
      }

      if (!matched) i++;
    }

    // Deduplicate by label
    const seen = new Set();
    return found
      .filter(n => { const k = n.label.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((n, idx) => ({ id: `n${idx + 1}`, label: n.label, kind: n.kind }));
  }

  // ─── EDGE BUILDING ─────────────────────────────────────────────────────────

  function buildEdges(nodes, text) {
    if (nodes.length < 2) return [];
    const edges = [];

    // Main path: each node connects to the next in text order
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ from: nodes[i].id, to: nodes[i + 1].id, kind: 'stream' });
    }

    const lower = text.toLowerCase();

    // Bypass synonyms: bypass pipe/loop, parallel path, alternative route, crossover
    const bypassRe = /(?:bypass(?:\s+(?:line|pipe|loop|valve))?|parallel\s+path|alternative\s+route|crossover)\s+(?:around|over)\s+([a-z][a-z0-9\s\-]*?)(?=\s*[,.\n]|$)/gi;
    let m;
    while ((m = bypassRe.exec(lower)) !== null) {
      const anchor = m[1].trim();
      const target = nodes.find(n => matchesLabel(n.label, anchor));
      if (!target) continue;
      const idx = nodes.indexOf(target);
      if (idx > 0 && idx < nodes.length - 1) {
        edges.push({ from: nodes[idx - 1].id, to: nodes[idx + 1].id, kind: 'bypass', label: 'Bypass' });
      }
    }

    // Recycle synonyms: recycle stream/loop/pipe, product recycle, return line, recirculation line
    const recycleRe = /(?:recycle(?:\s+(?:stream|loop|pipe|line))?|product\s+recycle|return\s+line|recirculation\s+line)\s+(?:to|back\s+to|return\s+to|around)\s+([a-z][a-z0-9\s\-]*?)(?=\s*[,.\n]|$)/gi;
    while ((m = recycleRe.exec(lower)) !== null) {
      const anchor = m[1].trim();
      const target = nodes.find(n => matchesLabel(n.label, anchor));
      if (!target) continue;
      edges.push({ from: nodes[nodes.length - 1].id, to: target.id, kind: 'recycle', label: 'Recycle' });
    }

    return edges;
  }

  function matchesLabel(nodeLabel, searchStr) {
    const nl = nodeLabel.toLowerCase();
    const ss = searchStr.toLowerCase().trim();
    return nl === ss || nl.includes(ss) || ss.includes(nl);
  }

  // ─── PARSE ─────────────────────────────────────────────────────────────────

  function parse(text) {
    const sourceText  = String(text || '').trim();
    const normalized  = normalize(sourceText);
    const nodes       = extractNodes(normalized);
    const edges       = buildEdges(nodes, normalized);

    const confidence  = nodes.length >= 3 ? 'high'
                      : nodes.length === 2 ? 'medium'
                      : nodes.length === 1 ? 'low' : 'none';

    const title = nodes.length >= 2
      ? `${nodes[0].label} to ${nodes[nodes.length - 1].label}`
      : nodes.length === 1 ? nodes[0].label
      : 'Unknown Process';

    return {
      schema_version: VERSION,
      id:    slugify(title),
      title,
      nodes,
      edges,
      meta: { confidence, source_text: sourceText },
    };
  }

  // ─── FROM YAML ─────────────────────────────────────────────────────────────

  function fromYaml(str) {
    if (!yaml) throw new Error(
      'js-yaml required to parse YAML. In browser: load jsyaml CDN before ympl.js. In Node: npm install js-yaml.'
    );
    const doc = yaml.load(str);
    if (!doc || typeof doc !== 'object') throw new Error('Invalid YAML: expected object');
    return doc;
  }

  // ─── TO YAML ───────────────────────────────────────────────────────────────

  function toYaml(doc) {
    if (yaml) return yaml.dump(doc, { lineWidth: 100, noRefs: true });
    // Inline minimal serializer (no deps fallback)
    return _dumpYaml(doc);
  }

  function _dumpYaml(doc) {
    const lines = [
      `schema_version: ${doc.schema_version || VERSION}`,
      `id: ${doc.id || ''}`,
      `title: ${_yamlStr(doc.title || '')}`,
      'nodes:',
    ];
    for (const n of (doc.nodes || [])) {
      lines.push(`  - id: ${n.id}`);
      lines.push(`    label: ${_yamlStr(n.label)}`);
      lines.push(`    kind: ${n.kind}`);
    }
    lines.push('edges:');
    for (const e of (doc.edges || [])) {
      lines.push(`  - from: ${e.from}`);
      lines.push(`    to: ${e.to}`);
      if (e.kind && e.kind !== 'stream') lines.push(`    kind: ${e.kind}`);
      if (e.label) lines.push(`    label: ${_yamlStr(e.label)}`);
    }
    lines.push('meta:');
    lines.push(`  confidence: ${(doc.meta || {}).confidence || ''}`);
    if ((doc.meta || {}).source_text) {
      lines.push(`  source_text: ${_yamlStr(doc.meta.source_text)}`);
    }
    return lines.join('\n') + '\n';
  }

  function _yamlStr(s) {
    const str = String(s || '');
    return /[:#\[\]{},|>&*!'"?%@`]/.test(str) || str.trim() !== str
      ? `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : str;
  }

  // ─── TO TEXT ───────────────────────────────────────────────────────────────

  function toText(doc) {
    const nodes = doc.nodes || [];
    const edges = doc.edges || [];
    if (nodes.length === 0) return 'No process equipment identified.';
    if (nodes.length === 1) return `Process contains ${nodes[0].label} (${kindLabel(nodes[0].kind)}).`;

    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

    // Build main stream path
    const streamEdges = edges.filter(e => !e.kind || e.kind === 'stream');
    const inDegree    = new Set(streamEdges.map(e => e.to));
    const start       = nodes.find(n => !inDegree.has(n.id)) || nodes[0];
    const edgeMap     = {};
    for (const e of streamEdges) edgeMap[e.from] = e.to;

    const path = [start];
    const seen = new Set([start.id]);
    let cur = start;
    while (edgeMap[cur.id] && !seen.has(edgeMap[cur.id])) {
      const next = nodeById[edgeMap[cur.id]];
      if (!next) break;
      path.push(next);
      seen.add(next.id);
      cur = next;
    }

    let text = path.map(n => n.label).join(' → ') + '.';

    for (const e of edges.filter(e => e.kind === 'bypass')) {
      const f = nodeById[e.from], t = nodeById[e.to];
      if (f && t) text += ` Bypass from ${f.label} to ${t.label}.`;
    }
    for (const e of edges.filter(e => e.kind === 'recycle')) {
      const f = nodeById[e.from], t = nodeById[e.to];
      if (f && t) text += ` Recycle from ${f.label} back to ${t.label}.`;
    }

    return text;
  }

  function kindLabel(k) {
    return (k || 'unknown').replace(/_/g, ' ');
  }

  // ─── TO SVG ────────────────────────────────────────────────────────────────

  const COLORS = {
    vessel:         { bg: '#0d2137', border: '#4a9eff', badge: '#1e3a5f', text: '#e6edf3' },
    column:         { bg: '#0d2137', border: '#4a9eff', badge: '#1e3a5f', text: '#e6edf3' },
    reactor:        { bg: '#1a0d37', border: '#a371f7', badge: '#2d1b4e', text: '#e6edf3' },
    pump:           { bg: '#1a0d2d', border: '#d2a8ff', badge: '#2d1b4e', text: '#e6edf3' },
    compressor:     { bg: '#2a1800', border: '#ffa657', badge: '#3b2200', text: '#e6edf3' },
    heat_exchanger: { bg: '#0d2a18', border: '#3fb950', badge: '#1a3b2d', text: '#e6edf3' },
    valve:          { bg: '#2a0d0d', border: '#ff7b7b', badge: '#3b1a1a', text: '#e6edf3' },
    checkvalve:     { bg: '#2a1a0d', border: '#ffa657', badge: '#3b2a18', text: '#e6edf3' },
    relief:         { bg: '#2a0d0d', border: '#f85149', badge: '#3b1818', text: '#e6edf3' },
    filter:         { bg: '#0d1a2a', border: '#58a6ff', badge: '#1a2d3b', text: '#e6edf3' },
    meter:          { bg: '#1a1a1a', border: '#8b949e', badge: '#2a2a2a', text: '#e6edf3' },
    unknown:        { bg: '#161b22', border: '#8b949e', badge: '#21262d', text: '#8b949e' },
  };

  const NW = 128, NH = 48, HGAP = 52, PAD = 28;

  function toSvg(doc) {
    const nodes = doc.nodes || [];
    const edges = doc.edges || [];

    if (nodes.length === 0) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80">
        <rect width="320" height="80" fill="#0d1117" rx="8"/>
        <text x="160" y="45" fill="#8b949e" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle">No equipment identified</text>
      </svg>`;
    }

    // ── Layout: main path row ──
    const streamEdges = edges.filter(e => !e.kind || e.kind === 'stream');
    const inDeg = new Set(streamEdges.map(e => e.to));
    const startNode = nodes.find(n => !inDeg.has(n.id)) || nodes[0];
    const edgeMap = {};
    for (const e of streamEdges) edgeMap[e.from] = e.to;

    const mainPath = [startNode];
    const seenPath = new Set([startNode.id]);
    let cur = startNode;
    while (edgeMap[cur.id]) {
      const nextId = edgeMap[cur.id];
      if (seenPath.has(nextId)) break;
      const next = nodes.find(n => n.id === nextId);
      if (!next) break;
      mainPath.push(next);
      seenPath.add(nextId);
      cur = next;
    }
    // Any nodes not in main path appended at end
    for (const n of nodes) { if (!seenPath.has(n.id)) mainPath.push(n); }

    const pos = {};
    mainPath.forEach((n, i) => {
      pos[n.id] = { x: PAD + i * (NW + HGAP), y: 56 };
    });

    const svgW = PAD + mainPath.length * (NW + HGAP) - HGAP + PAD;
    const svgH = 56 + NH + PAD + 12;

    // ── Edge SVG ──
    let edgeSvg = '';
    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

    for (const e of edges) {
      const fp = pos[e.from], tp = pos[e.to];
      if (!fp || !tp) continue;

      const x1 = fp.x + NW, y1 = fp.y + NH / 2;
      const x2 = tp.x,      y2 = tp.y + NH / 2;

      if ((!e.kind || e.kind === 'stream') && fp.x < tp.x) {
        edgeSvg += `<line x1="${x1}" y1="${y1}" x2="${x2 - 1}" y2="${y2}" stroke="#484f58" stroke-width="2" marker-end="url(#arr)"/>`;
      } else if (e.kind === 'bypass') {
        const mx = (fp.x + NW + tp.x) / 2;
        const ay = fp.y - 26;
        edgeSvg += `<path d="M${x1},${y1} C${x1 + 20},${ay} ${x2 - 20},${ay} ${x2},${y2}" fill="none" stroke="#ffa657" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr-b)"/>`;
        if (e.label) edgeSvg += `<text x="${mx}" y="${ay - 5}" fill="#ffa657" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">${esc(e.label)}</text>`;
      } else if (e.kind === 'recycle') {
        const ay = fp.y + NH + 20;
        const mx = (fp.x + NW / 2 + tp.x + NW / 2) / 2;
        edgeSvg += `<path d="M${fp.x + NW / 2},${fp.y + NH} C${fp.x + NW / 2},${ay} ${tp.x + NW / 2},${ay} ${tp.x + NW / 2},${tp.y + NH}" fill="none" stroke="#3fb950" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr-r)"/>`;
        if (e.label) edgeSvg += `<text x="${mx}" y="${ay + 14}" fill="#3fb950" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">${esc(e.label)}</text>`;
      }
    }

    // ── Node SVG ──
    let nodeSvg = '';
    for (const n of mainPath) {
      const p = pos[n.id];
      if (!p) continue;
      const c = COLORS[n.kind] || COLORS.unknown;
      const cx = p.x + NW / 2;
      const lines = wrapText(n.label, 14);
      const ty0   = p.y + (NH / 2) - (lines.length - 1) * 7 + 1;

      nodeSvg += `<g>
  <rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="6" fill="${c.bg}" stroke="${c.border}" stroke-width="1.5"/>
  ${lines.map((l, li) => `<text x="${cx}" y="${ty0 + li * 14}" fill="${c.text}" font-size="11" font-weight="500" font-family="system-ui,sans-serif" text-anchor="middle">${esc(l)}</text>`).join('\n  ')}
  <text x="${cx}" y="${p.y + NH - 6}" fill="${c.border}" font-size="9" font-family="system-ui,sans-serif" text-anchor="middle" opacity="0.75">${esc(kindLabel(n.kind))}</text>
</g>`;
    }

    const titleSvg = doc.title
      ? `<text x="${svgW / 2}" y="18" fill="#8b949e" font-size="11" font-weight="600" font-family="system-ui,sans-serif" text-anchor="middle" letter-spacing="0.04em">${esc(doc.title)}</text>`
      : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
<defs>
  <marker id="arr"   markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill="#484f58"/></marker>
  <marker id="arr-b" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill="#ffa657"/></marker>
  <marker id="arr-r" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill="#3fb950"/></marker>
</defs>
<rect width="${svgW}" height="${svgH}" fill="#0d1117" rx="8"/>
${titleSvg}
${edgeSvg}
${nodeSvg}
</svg>`;
  }

  // ─── UTILITIES ─────────────────────────────────────────────────────────────

  function titleCase(str) {
    return str.replace(/\b([a-z])/g, c => c.toUpperCase());
  }

  function slugify(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '');
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function wrapText(label, maxLen) {
    if (label.length <= maxLen) return [label];
    const words = label.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const candidate = line ? line + ' ' + w : w;
      if (candidate.length > maxLen && line) { lines.push(line); line = w; }
      else line = candidate;
    }
    if (line) lines.push(line);
    return lines.slice(0, 2); // max 2 lines in node box
  }

  // ─── PUBLIC API ────────────────────────────────────────────────────────────

  return {
    VERSION,

    /** messy text → doc */
    parse,

    /** yaml string → doc */
    fromYaml,

    /** doc → yaml string */
    toYaml,

    /** doc → natural language */
    toText,

    /** doc → SVG string */
    toSvg,

    /**
     * Main entry point — bidirectional.
     * input: messy text string  OR  yaml string starting with 'schema_version:'
     * returns: { doc, yaml, svg, text }
     */
    render(input) {
      const str   = String(input || '').trim();
      const isYml = /^schema_version:|^---/.test(str);
      const doc   = isYml ? fromYaml(str) : parse(str);
      return {
        doc,
        yaml: toYaml(doc),
        svg:  toSvg(doc),
        text: toText(doc),
      };
    },
  };
});
