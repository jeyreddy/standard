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
      // specialty
      'slug catcher', 'blowdown drum', 'buffer vessel',
      'hot well', 'day tank', 'slop tank', 'seal pot', 'weigh tank',
      // generic
      'process vessel', 'closed vessel', 'pressure container',
      'ko drum', 'flash drum', 'surge drum',
      'deaerator', 'accumulator', 'receiver', 'separator',
      'gas cylinder', 'cylinder',
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
      'single-tube reactor', 'tube reactor', 'tubular reactor',
      'jacketed reactor', 'stirred tank reactor', 'continuous stirred tank reactor',
      'batch reactor', 'cstr', 'pfr', 'reactor',
    ],
    pump: [
      'hermetically sealed pump', 'magnetic drive pump', 'mag-drive pump',
      'sealless pump', 'chemical injection pump', 'pd metering pump',
      'proportioning pump', 'injection pump', 'dosing pump',
      'centrifugal pump', 'reciprocating pump', 'rotodynamic pump',
      'single-stage pump', 'end-suction pump', 'volute pump',
      'multistage pump', 'diaphragm pump', 'canned motor pump',
      'reflux pump', 'charge pump', 'duty pump',
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
      'recycle compressor', 'gas expander',
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
      // fired heaters / furnaces
      'direct-fired heater', 'process furnace', 'fired heater', 'box heater',
      'tube still', 'furnace', 'process heater',
      // air-cooled types
      'air-cooled heat exchanger', 'air-cooled hx', 'air-cooled condenser', 'fin-fan condenser',
      // double-pipe / u-tube
      'double-pipe heat exchanger', 'hairpin heat exchanger', 'hairpin exchanger', 'u-tube bundle',
      // waste heat
      'waste heat boiler',
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
      // anti-surge
      'anti-surge recycle valve', 'anti-surge valve', 'surge control valve', 'compressor bypass valve',
      // blowdown / depressuring
      'emergency blowdown valve', 'depressuring valve', 'blowdown valve', 'dump valve',
      // remote-operated
      'motor operated valve', 'electrically operated valve', 'motorized valve', 'electric motor valve',
      'pneumatic operated valve',
      'hand operated valve', 'local manual valve', 'manual isolation valve', 'manual valve', 'hand valve',
      // mechanical isolation
      'spectacle blind', 'figure-8 blind', 'paddle blind', 'spec blind',
      // body types
      'diaphragm valve', 'plug valve', 'angle valve',
      // back pressure
      'back pressure regulator', 'bpr',
      // safety & relief type valves (non-relief-device)
      'safety relief valve', 'pressure relief valve',
      // generic
      'isolation valve', 'block valve', 'sluice valve', 'shut-off valve',
      'on/off valve', 'gate valve', 'regulating valve', 'throttle valve',
      'needle valve', 'pressure regulator', 'control valve', 'valve',
    ],
    checkvalve: [
      'dual disc check valve', 'dual-disc check', 'wafer check valve', 'wafer check',
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
      'activated carbon filter', 'cartridge filter', 'bag filter',
      'duplex strainer', 'basket strainer', 'y-strainer',
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

  // Words that must NOT be used as label prefixes when scanning backward
  const LABEL_STOP = new Set([
    'a','an','the','and','or','but','nor','so','yet',
    'in','on','at','to','for','of','with','from','by','into','through','via','over','under',
    'is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','can','could','should','shall','may','might',
    'it','its','this','that','these','those','which','who','what','where','when',
    'then','after','before','while','until','if','as','although','because',
    'connected','fed','sent','routed','pumped','flows','feeds','also','just',
    'only','any','all','some','no','not','each','both','either','here','there',
  ]);

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
    [/\bseperator\b/gi, 'separator'],
    [/\bseprator\b/gi, 'separator'],
    [/\bsepartor\b/gi, 'separator'],
    [/\bseperatr\b/gi, 'separator'],
    [/\bvesle\b/gi, 'vessel'],
    [/\bvesel\b/gi, 'vessel'],
    [/\bveseel\b/gi, 'vessel'],
    [/\bdrume\b/gi, 'drum'],
    [/\btnak\b/gi, 'tank'],
    [/\breacter\b|\breactr\b/gi, 'reactor'],
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

        // Word-boundary check — also accept optional plural 's'
        const pre  = i === 0 || /[\s,;.()\-\/]/.test(lower[i - 1]);
        // Allow a trailing 's' (plural) if followed by a real boundary
        let endConsumed = end;
        if (end < len && lower[end] === 's' &&
            (end + 1 >= len || /[\s,;.()\-\/]/.test(lower[end + 1]))) {
          endConsumed = end + 1;
        }
        const post = endConsumed >= len || /[\s,;.()\-\/]/.test(lower[endConsumed]);
        if (!pre || !post) continue;

        // No overlap with already-consumed chars
        let overlap = false;
        for (let j = i; j < endConsumed; j++) { if (used[j]) { overlap = true; break; } }
        if (overlap) continue;

        // Mark term chars consumed (including plural 's' if present)
        for (let j = i; j < endConsumed; j++) used[j] = 1;

        // Look for a trailing ISA tag, number, or single-letter identifier (e.g. "cylinder a")
        let label = titleCase(term);
        let scanEnd = endConsumed;

        const afterSlice = text.slice(endConsumed);
        const tagM    = afterSlice.match(/^\s+([A-Za-z]{1,3}-\d{3,4}[A-Za-z]?)\b/);
        const numM    = afterSlice.match(/^\s+(\d+[A-Za-z]?)\b/);
        const letterM = afterSlice.match(/^\s+([A-Za-z])\b/);

        if (tagM) {
          label   = tagM[1].toUpperCase();
          scanEnd = endConsumed + tagM[0].length;
          for (let j = endConsumed; j < scanEnd; j++) used[j] = 1;
        } else if (numM && /^(tank|vessel|drum|pump|column|reactor|compressor|filter|cylinder)$/i.test(term)) {
          label   = titleCase(term) + ' ' + numM[1];
          scanEnd = endConsumed + numM[0].length;
          for (let j = endConsumed; j < scanEnd; j++) used[j] = 1;
        } else if (letterM && /^(tank|vessel|drum|pump|column|reactor|compressor|filter|cylinder|separator|exchanger)$/i.test(term)) {
          label   = titleCase(term) + ' ' + letterM[1].toUpperCase();
          scanEnd = endConsumed + letterM[0].length;
          for (let j = endConsumed; j < scanEnd; j++) used[j] = 1;
        }

        // ── Backward prefix scan: "co2 tank" → "CO2 Tank" ──────────────────
        // Only when label came from the term itself (no ISA tag override).
        // Looks one word back; skips stop words and already-consumed chars.
        if (!tagM) {
          let bj = i - 1;
          while (bj >= 0 && lower[bj] === ' ') bj--;   // skip spaces
          if (bj >= 0 && /[a-z0-9]/.test(lower[bj])) {
            let bStart = bj;
            while (bStart > 0 && /[a-z0-9]/.test(lower[bStart - 1])) bStart--;
            const prevWord = lower.slice(bStart, bj + 1);
            let bUsed = false;
            for (let k = bStart; k <= bj; k++) if (used[k]) { bUsed = true; break; }
            if (!bUsed && !LABEL_STOP.has(prevWord)) {
              // Uppercase chemical formulas (contain digit: co2→CO2, h2s→H2S); titleCase otherwise
              const pfx = /\d/.test(prevWord) ? prevWord.toUpperCase() : titleCase(prevWord);
              label = pfx + ' ' + label;
              for (let k = bStart; k <= bj + 1; k++) used[k] = 1;  // word + trailing space
            }
          }
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
    const edges  = [];
    const lower  = text.toLowerCase();
    let m;

    // ── Step 1: Identify recycle-branch nodes ────────────────────────────────
    // Nodes that appear in "recycle … via [node]" clauses are on the recycle
    // branch, not the main sequential flow. Exclude them from stream chain.
    const recycleBranch = new Set();
    const recycleViaRe  = /\brecycl\w*\b[^.!?]*?\bvia\s+(?:a\s+|the\s+)?([a-z][a-z0-9\s\-]*?)(?=\s*[,.\n!?]|$)/gi;
    while ((m = recycleViaRe.exec(lower)) !== null) {
      const viaLabel = m[1].trim();
      const viaNode  = nodes.find(n => matchesLabel(n.label, viaLabel));
      if (viaNode) recycleBranch.add(viaNode.id);
    }

    // ── Step 2: Sequential stream edges (main flow only) ─────────────────────
    const mainFlow = nodes.filter(n => !recycleBranch.has(n.id));
    for (let i = 0; i < mainFlow.length - 1; i++) {
      edges.push({ from: mainFlow[i].id, to: mainFlow[i + 1].id, kind: 'stream' });
    }

    // ── Step 3: Bypass — pattern A: "bypass [line|pipe|loop] around/over/across X"
    const bypassRe = /(?:bypass(?:\s+(?:line|pipe|loop|valve))?|parallel\s+path|alternative\s+route|crossover)\s+(?:around|over|across)\s+([a-z][a-z0-9\s\-]*?)(?=\s*[,.\n]|$)/gi;
    while ((m = bypassRe.exec(lower)) !== null) {
      const anchor = m[1].trim();
      const target = mainFlow.find(n => matchesLabel(n.label, anchor));
      if (!target) continue;
      const idx = mainFlow.indexOf(target);
      if (idx > 0 && idx < mainFlow.length - 1) {
        edges.push({ from: mainFlow[idx - 1].id, to: mainFlow[idx + 1].id, kind: 'bypass', label: 'Bypass' });
      }
    }

    // ── Step 4: Bypass — pattern B: "[node label] with [a] bypass"
    for (let idx = 1; idx < mainFlow.length - 1; idx++) {
      const nl = escRe(mainFlow[idx].label.toLowerCase());
      if (new RegExp('\\b' + nl + '\\s+with\\s+(?:a\\s+|the\\s+)?bypass\\b').test(lower)) {
        if (!edges.some(e => e.from === mainFlow[idx-1].id && e.to === mainFlow[idx+1].id && e.kind === 'bypass')) {
          edges.push({ from: mainFlow[idx-1].id, to: mainFlow[idx+1].id, kind: 'bypass', label: 'Bypass' });
        }
      }
    }

    // ── Step 5a: Recycle — existing pattern "recycle line back to [anchor]"
    const recycleRe = /(?:recycle(?:\s+(?:stream|loop|pipe|line))?|product\s+recycle|return\s+line|recirculation\s+line)\s+(?:to|back\s+to|return\s+to|around)\s+([a-z][a-z0-9\s\-]*?)(?=\s*[,.\n]|$)/gi;
    while ((m = recycleRe.exec(lower)) !== null) {
      const anchor = m[1].trim();
      const target = nodes.find(n => matchesLabel(n.label, anchor));
      if (!target) continue;
      edges.push({ from: mainFlow[mainFlow.length - 1].id, to: target.id, kind: 'recycle', label: 'Recycle' });
    }

    // ── Step 5b: Recycle — "recycle … via [node]" with subject detection
    // Handles: "reactor has a recycle line from outlet to inlet via check valve"
    //   → reactor → check_valve (stream on recycle branch)
    //   → check_valve → upstream-of-reactor (recycle edge)
    recycleViaRe.lastIndex = 0;
    while ((m = recycleViaRe.exec(lower)) !== null) {
      const viaLabel = m[1].trim();
      const viaNode  = nodes.find(n => matchesLabel(n.label, viaLabel));
      if (!viaNode) continue;

      // Find clause boundaries (sentence containing the "recycle … via" phrase)
      const clauseStart = Math.max(0, lower.lastIndexOf('.', m.index) + 1);
      const clauseText  = lower.slice(clauseStart, m.index + m[0].length);

      // Subject = last main-flow node mentioned in the clause (closest to "recycle")
      let subjectNode = null;
      for (const n of mainFlow) {
        if (new RegExp('\\b' + escRe(n.label.toLowerCase()) + '\\b').test(clauseText)) {
          subjectNode = n;
        }
      }
      if (!subjectNode) continue;

      const subjectIdx = mainFlow.indexOf(subjectNode);

      // subject → via_node : stream (recycle branch leg)
      if (!edges.some(e => e.from === subjectNode.id && e.to === viaNode.id)) {
        edges.push({ from: subjectNode.id, to: viaNode.id, kind: 'stream' });
      }
      // via_node → node upstream of subject : recycle
      const recycleTarget = subjectIdx > 0 ? mainFlow[subjectIdx - 1] : mainFlow[0];
      if (!edges.some(e => e.from === viaNode.id && e.to === recycleTarget.id && e.kind === 'recycle')) {
        edges.push({ from: viaNode.id, to: recycleTarget.id, kind: 'recycle', label: 'Recycle' });
      }
    }

    return edges;
  }

  function matchesLabel(nodeLabel, searchStr) {
    const nl = nodeLabel.toLowerCase();
    const ss = searchStr.toLowerCase().trim();
    return nl === ss || nl.includes(ss) || ss.includes(nl);
  }

  // ─── RELATION EXTRACTION & NODE REORDERING ─────────────────────────────────
  // Reads directed-flow signals from text so that node order reflects actual
  // process flow, not just the order words happen to appear in the sentence.
  //
  // Patterns detected:
  //   "from A to B"              — A is source, B is sink (endpoint)
  //   "A feeds/flows to/pumps to B"  — directed pair A → B
  //   "A upstream of B"          — A before B
  //   "A downstream of B"        — B before A
  //   "A before B / A after B"   — ordering constraint
  //
  // Algorithm: build a directed graph of pairs, topologically sort (Kahn's),
  // break ties by original text order. Sink-pinned nodes (explicit "to B"
  // endpoints) are deferred to the end of available candidates.

  function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function reorderNodes(nodes, text) {
    if (nodes.length < 2) return nodes;
    const lower    = text.toLowerCase();
    const dirPairs = [];
    const sinkPins = new Set(); // candidates for chain endpoint (to be confirmed as trueSinks)
    const seenKey  = new Set();

    function addPair(fromId, toId, pinSink) {
      const key = fromId + '>' + toId;
      if (!seenKey.has(key)) { seenKey.add(key); dirPairs.push({ from: fromId, to: toId }); }
      if (pinSink) sinkPins.add(toId);
    }

    // ── Pattern 1: "from A … to B" ──────────────────────────────────────────
    // Handles: "from X to Y", "gas moved from X to Y", "from X to Y with Z in between"
    // B is pinned as the declared chain endpoint.
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        if (new RegExp('\\bfrom\\s+' + ar + '\\b[^.]*?\\bto\\s+' + br + '\\b').test(lower)) {
          addPair(nodes[i].id, nodes[j].id, true);
        }
      }
    }

    // ── Pattern 2: flow-verb pairs "A feeds/flows-to/pumps-to/… B" ──────────
    // Establishes A before B; B is NOT pinned as sink (it may be an intermediate).
    const FLOW_VERBS =
      'feeds?|(?:flows?|pumps?|leads?|routes?|delivers?|sends?|discharges?|pushes?)(?:\\s+(?:to|into))';
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        if (new RegExp('\\b' + ar + '\\s+(?:' + FLOW_VERBS + ')\\s+' + br + '\\b').test(lower)) {
          addPair(nodes[i].id, nodes[j].id, false);
        }
      }
    }

    // ── Pattern 2b: inverse verbs "A receives-from/is-fed-by B" → B→A ────────
    // A is the destination (sink-pinned); B is the source.
    // Covers: "V-201 receives flow from pump P-101"
    //         "reactor is fed by pump P-101"
    //         "V-201 takes feed from P-101"
    // Up to 3 optional words are allowed between the flow keyword and A;
    // up to 2 optional words are allowed between the preposition/verb and B —
    // this handles descriptor words like "pump" in "from pump P-101".
    const OPT2 = '(?:[\\w][\\w-]*\\s+){0,2}';  // 0-2 optional descriptor words
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        // "A receives [words] from [words] B"
        if (new RegExp('\\b' + ar + '\\s+(?:receives|takes)\\s+(?:[\\w]+\\s+){0,3}from\\s+' + OPT2 + br + '\\b').test(lower)) {
          addPair(nodes[j].id, nodes[i].id, true);
        }
        // "A is fed by/from [words] B"
        if (new RegExp('\\b' + ar + '\\s+is\\s+fed\\s+(?:by|from)\\s+' + OPT2 + br + '\\b').test(lower)) {
          addPair(nodes[j].id, nodes[i].id, true);
        }
      }
    }

    // ── Pattern 3: positional keywords ──────────────────────────────────────
    // "upstream of" / "downstream of" explicitly name the endpoint so pinSink=true.
    // "before" / "after" are softer constraints — no sink pinning.
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = i + 1; j < nodes.length; j++) {
        const br = escRe(nodes[j].label.toLowerCase());
        if (new RegExp('\\b' + ar + '\\s+upstream\\s+of\\s+'   + br + '\\b').test(lower)) addPair(nodes[i].id, nodes[j].id, true);
        if (new RegExp('\\b' + ar + '\\s+downstream\\s+of\\s+' + br + '\\b').test(lower)) addPair(nodes[j].id, nodes[i].id, true);
        if (new RegExp('\\b' + ar + '\\s+before\\s+'           + br + '\\b').test(lower)) addPair(nodes[i].id, nodes[j].id, false);
        if (new RegExp('\\b' + ar + '\\s+after\\s+'            + br + '\\b').test(lower)) addPair(nodes[j].id, nodes[i].id, false);
      }
    }

    if (dirPairs.length === 0) return nodes;   // no relations found — keep text order

    // trueSinks: sink-pinned nodes that have no outgoing pairs (real chain endpoints).
    // This avoids deferring intermediate nodes that happen to be targets of a relation.
    const hasOutgoing = new Set(dirPairs.map(p => p.from));
    const trueSinks   = new Set([...sinkPins].filter(id => !hasOutgoing.has(id)));

    // ── Kahn's topological sort ──────────────────────────────────────────────
    const adj   = new Map(nodes.map(n => [n.id, []]));
    const inDeg = new Map(nodes.map(n => [n.id, 0]));
    for (const { from, to } of dirPairs) {
      if (!adj.has(from) || !adj.has(to)) continue;
      adj.get(from).push(to);
      inDeg.set(to, inDeg.get(to) + 1);
    }

    const byId  = new Map(nodes.map(n => [n.id, n]));
    const order = [];
    let   avail = nodes.filter(n => inDeg.get(n.id) === 0);

    while (avail.length > 0) {
      // Tie-break: defer trueSink nodes to the end; otherwise keep original text order.
      avail.sort((a, b) => {
        const aS = trueSinks.has(a.id) ? 1 : 0;
        const bS = trueSinks.has(b.id) ? 1 : 0;
        if (aS !== bS) return aS - bS;
        return nodes.indexOf(a) - nodes.indexOf(b);
      });

      const curr = avail.shift();
      order.push(curr.id);
      for (const nextId of adj.get(curr.id)) {
        const deg = inDeg.get(nextId) - 1;
        inDeg.set(nextId, deg);
        if (deg === 0) avail.push(byId.get(nextId));
      }
    }

    // Append any remaining (cycles / disconnected) in original text order
    const visited = new Set(order);
    for (const n of nodes) { if (!visited.has(n.id)) order.push(n.id); }

    return order.map(id => byId.get(id));
  }

  // ─── PARSE ─────────────────────────────────────────────────────────────────

  function parse(text) {
    const sourceText  = String(text || '').trim();
    const normalized  = normalize(sourceText);
    let   nodes       = extractNodes(normalized);

    // Reorder nodes so flow order matches actual process direction
    nodes = reorderNodes(nodes, normalized);
    // Reassign sequential IDs after reordering (n1 = first in flow, etc.)
    nodes = nodes.map((n, idx) => ({ id: 'n' + (idx + 1), label: n.label, kind: n.kind }));

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
    const streamEdges    = edges.filter(e => !e.kind || e.kind === 'stream');
    const inDegree       = new Set(streamEdges.map(e => e.to));
    const start          = nodes.find(n => !inDegree.has(n.id)) || nodes[0];
    // Nodes that are sources of recycle edges — they belong to the recycle branch,
    // not the main flow. When a node has multiple outgoing stream edges, prefer the
    // one whose target is NOT a recycle-branch source.
    const recycleSourceSet = new Set(edges.filter(e => e.kind === 'recycle').map(e => e.from));
    const edgeMap        = {};
    for (const e of streamEdges) {
      if (!edgeMap[e.from] || recycleSourceSet.has(edgeMap[e.from])) {
        edgeMap[e.from] = e.to;
      }
    }

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
  const ROW_SIZE = 4, ROW_GAP = 64, TOP_PAD = 44;

  function toSvg(doc) {
    const nodes = doc.nodes || [];
    const edges = doc.edges || [];

    if (nodes.length === 0) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80">
        <rect width="320" height="80" fill="#0d1117" rx="8"/>
        <text x="160" y="45" fill="#8b949e" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle">No equipment identified</text>
      </svg>`;
    }

    // ── Layout: row-wrapped grid (ROW_SIZE nodes per row) ──
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
    for (const n of nodes) { if (!seenPath.has(n.id)) mainPath.push(n); }

    const pos = {};
    mainPath.forEach((n, i) => {
      const row = Math.floor(i / ROW_SIZE);
      const col = i % ROW_SIZE;
      pos[n.id] = { x: PAD + col * (NW + HGAP), y: TOP_PAD + row * (NH + ROW_GAP) };
    });

    const numCols = Math.min(mainPath.length, ROW_SIZE);
    const numRows = Math.ceil(mainPath.length / ROW_SIZE);
    const svgW = PAD + numCols * (NW + HGAP) - HGAP + PAD + 24; // +24 for elbow right margin
    const svgH = TOP_PAD + numRows * (NH + ROW_GAP) - ROW_GAP + PAD;

    // ── Edge SVG ──
    let edgeSvg = '';
    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

    for (const e of edges) {
      const fp = pos[e.from], tp = pos[e.to];
      if (!fp || !tp) continue;

      const x1 = fp.x + NW, y1 = fp.y + NH / 2;
      const x2 = tp.x,      y2 = tp.y + NH / 2;

      if ((!e.kind || e.kind === 'stream') && fp.y === tp.y && fp.x < tp.x) {
        // Same row — straight arrow
        edgeSvg += `<line x1="${x1}" y1="${y1}" x2="${x2 - 1}" y2="${y2}" stroke="#484f58" stroke-width="2" marker-end="url(#arr)"/>`;
      } else if ((!e.kind || e.kind === 'stream') && fp.y < tp.y) {
        // Row break — elbow: right → down → left into next row
        const elbowX = svgW - PAD;
        edgeSvg += `<path d="M${x1},${y1} L${elbowX},${y1} L${elbowX},${y2} L${x2},${y2}" fill="none" stroke="#484f58" stroke-width="2" marker-end="url(#arr)"/>`;
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

  // ─── PARSE WARNINGS ───────────────────────────────────────────────────────
  // Inspects a completed parse and returns a list of gaps between what the
  // text implies and what was actually built. Empty array = clean parse.
  //
  // Warnings also drive the smart LLM fallback trigger in renderAsync —
  // if any actionable warning exists, LLM is called even when confidence
  // is 'high' (node count can be correct while edge topology is incomplete).

  function checkWarnings(nodes, edges, sourceText) {
    const w   = [];
    const low = sourceText.toLowerCase();

    // ── Topology keywords with no matching edge ────────────────────────────
    const bypassKw  = /\bbypass(?:ed|es)?\b/.test(low);
    const recycleKw = /\brecycl\w*\b|\breturn\s+line\b|\brecirculat\w*\b/.test(low);

    if (bypassKw  && !edges.some(e => e.kind === 'bypass')) {
      w.push('bypass keyword found but no bypass edge was created — rephrase as "bypass around [node]" or "[node] with a bypass"');
    }
    if (recycleKw && !edges.some(e => e.kind === 'recycle')) {
      w.push('recycle keyword found but no recycle edge was created — rephrase as "recycle line back to [node]"');
    }

    // ── Connectivity gaps ──────────────────────────────────────────────────
    if (nodes.length >= 2 && edges.filter(e => e.kind === 'stream').length === 0) {
      w.push(`${nodes.length} nodes found but no stream edges — flow connections unclear`);
    }

    if (nodes.length >= 2) {
      const touched = new Set(edges.flatMap(e => [e.from, e.to]));
      for (const n of nodes) {
        if (!touched.has(n.id)) {
          w.push(`isolated node: "${n.label}" has no connections`);
        }
      }
    }

    // ── Sparse parse — long input but few nodes ────────────────────────────
    // More than ~12 words but fewer than 1 node per 6 words usually means
    // some equipment terms were not recognised (typos, uncommon phrasing, etc.)
    const wordCount = sourceText.trim().split(/\s+/).length;
    if (nodes.length > 0 && wordCount > 12 && nodes.length < Math.ceil(wordCount / 6)) {
      w.push(
        `only ${nodes.length} equipment term${nodes.length !== 1 ? 's' : ''} recognised from ${wordCount}-word input` +
        ` — some terms may be unrecognised. Try AI to capture missed equipment`
      );
    }

    return w;
  }

  // ─── SYNC RENDER (shared by render and renderAsync) ───────────────────────

  function _render(input) {
    const str    = String(input || '').trim();
    const isYml  = /^schema_version:|^---/.test(str);
    const doc    = isYml ? fromYaml(str) : parse(str);
    // Warnings only make sense for text input (not hand-authored YAML)
    const warnings = isYml ? [] : checkWarnings(doc.nodes, doc.edges, str);
    return { doc, yaml: toYaml(doc), svg: toSvg(doc), text: toText(doc), warnings };
  }

  // ─── LLM FALLBACK (Tier 3) ─────────────────────────────────────────────────
  // Used by renderAsync when Tier 1 returns confidence 'low' or 'none'.
  //
  // Supported providers:
  //   { provider: 'ollama', model: 'llama3.2:1b', url: 'http://localhost:11434' }
  //   { provider: 'haiku',  model: 'claude-haiku-4-5-20251001', apiKey: 'sk-ant-...' }
  //
  // Both require the fetch API (Node.js 18+ or browser).

  const _LLM_PROMPT = [
    'You are a process engineering assistant.',
    'Extract equipment nodes and flow connections from the text and return a YMPL 1.0 YAML document.',
    'Return ONLY the YAML — no explanation, no markdown code fences.',
    '',
    'YMPL 1.0 schema:',
    '  schema_version: ympl-1.0',
    '  id: <slug, lowercase_underscores>',
    '  title: <human readable title>',
    '  nodes:',
    '    - id: n1',
    '      label: <name or ISA tag e.g. P-101, CV-101, V-201, E-101, K-101>',
    '      kind: <vessel|pump|valve|checkvalve|heat_exchanger|compressor|column|reactor|relief|filter|meter>',
    '  edges:',
    '    - from: n1',
    '      to: n2',
    '      kind: stream   # stream (default) | bypass | recycle',
    '      label: <optional e.g. Bypass>',
    '  meta:',
    '    confidence: <high (3+ nodes) | medium (2) | low (1) | none (0)>',
    '',
    'Rules:',
    '  - List nodes in flow order, upstream first.',
    '  - Use ISA tag IDs as labels where present.',
    '  - Add all flow connections as edges; use bypass for parallel paths, recycle for return paths.',
    '',
    'Text:',
    '',
  ].join('\n');

  async function _callOllama(text, cfg, prompt) {
    const base  = (cfg.url  || 'http://localhost:11434').replace(/\/$/, '');
    const model = cfg.model || 'llama3.2:1b';
    const res = await fetch(base + '/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, prompt: (prompt || _LLM_PROMPT) + text, stream: false }),
    });
    if (!res.ok) throw new Error('Ollama HTTP ' + res.status);
    const data = await res.json();
    return data.response || '';
  }

  async function _callHaiku(text, cfg, prompt) {
    if (!cfg.apiKey) throw new Error('haiku provider requires apiKey');
    const model = cfg.model || 'claude-haiku-4-5-20251001';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: (prompt || _LLM_PROMPT) + text }],
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error('Haiku HTTP ' + res.status + ': ' + err.slice(0, 200));
    }
    const data = await res.json();
    return (data.content && data.content[0] && data.content[0].text) || '';
  }

  // Build a prompt that prepends user-saved correction examples as few-shot context.
  // examples: [{ input: string, yaml: string }, ...]  (up to 5, newest-last)
  function _buildPrompt(examples) {
    if (!examples || examples.length === 0) return _LLM_PROMPT;
    const shots = examples.slice(-5).map(function(e) {
      return 'Input: ' + e.input + '\nOutput:\n' + e.yaml;
    }).join('\n\n---\n\n');
    return 'Correction examples from this user (apply the same style):\n\n' +
           shots + '\n\n---\n\n' + _LLM_PROMPT;
  }

  async function _llmExtract(text, cfg, examples) {
    const prompt = _buildPrompt(examples);
    try {
      let raw;
      if      (cfg.provider === 'ollama') raw = await _callOllama(text, cfg, prompt);
      else if (cfg.provider === 'haiku')  raw = await _callHaiku(text, cfg, prompt);
      else return null;
      // Strip markdown fences if the LLM added them
      raw = raw.trim().replace(/^```(?:yaml)?\s*/i, '').replace(/\s*```$/, '').trim();
      return raw || null;
    } catch (_) {
      return null;  // network error, bad key, etc. — degrade gracefully
    }
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
     * Sync render — no LLM fallback.
     * input: messy text string OR yaml string starting with 'schema_version:'
     * returns: { doc, yaml, svg, text }
     */
    render: _render,

    /** Returns parse warnings for a text input without a full render */
    checkWarnings,

    /**
     * LLM-first async render.
     *
     * When options.llm is provided: tries LLM first; falls back to Tier 1
     * (rule-based) only if the LLM is unreachable or returns invalid YAML.
     * Without options.llm: returns the Tier 1 result immediately.
     *
     * options.llm — one of:
     *   { provider: 'ollama', model: 'llama3.2:1b', url: 'http://localhost:11434' }
     *   { provider: 'haiku',  model: 'claude-haiku-4-5-20251001', apiKey: 'sk-ant-...' }
     *
     * Requires fetch API (Node.js 18+ or browser).
     * Returns { doc, yaml, svg, text, warnings, usedLlm: boolean }
     */
    async renderAsync(input, options) {
      if (!options || !options.llm) return { ..._render(input), usedLlm: false };

      // LLM-first: try LLM → fall back to Tier 1 on any failure
      const rawYaml = await _llmExtract(String(input || '').trim(), options.llm, options.llm.examples);
      if (rawYaml) {
        try { return { ..._render(rawYaml), usedLlm: true }; } catch (_) {}
      }
      return { ..._render(input), usedLlm: false };
    },
  };
});
