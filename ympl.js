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
// Node kinds: column | separator | heat_exchanger | absorber | reactor |
//             adsorption | pump | compressor | valve | vessel | meter
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
  // Canonical equipment vocabulary — 10 kinds, exact terms from user taxonomy.
  // Tier 1 matches these terms directly (longest first).
  // LLM prompt includes this list so both Haiku and Ollama map to the same kinds.

  const KINDS = {
    // 1. Distillation & Fractionation
    column: [
      'fractionating column', 'distillation column', 'distillation tower',
      'atmospheric column', 'vacuum column', 'pressurized column',
      'azeotropic column', 'reactive column', 'pre-fractionator',
      'fractionator', 'splitter', 'de-ethanizer', 'de-propanizer', 'de-butanizer',
      'column',
    ],
    // 2. Phase Separation & Flashing
    separator: [
      'three-phase separator', 'two-phase separator', 'flare knockout drum',
      'knockout drum', 'suction drum', 'flash drum', 'slug catcher', 'decanter',
      'inlet separator', 'horizontal separator', 'vertical separator',
      'gas scrubber', 'scrubber', 'separator',
    ],
    // 3. Heat Transfer
    heat_exchanger: [
      'shell-and-tube heat exchanger', 'plate heat exchanger',
      'air-cooled heat exchanger', 'fin-fan', 'double-pipe heat exchanger',
      'hairpin heat exchanger', 'feed-effluent heat exchanger', 'waste heat boiler',
      'forced circulation reboiler', 'thermosiphon reboiler', 'kettle reboiler',
      'multi-effect evaporator', 'feed vaporizer',
      'total condenser', 'partial condenser', 'air-cooled condenser', 'trim condenser',
      'fired heater', 'furnace', 'process heater',
      'product cooler', 'trim cooler', 'intercooler', 'after-cooler', 'chiller', 'pre-heater',
      'reboiler', 'condenser', 'evaporator', 'heat exchanger', 'exchanger', 'cooler', 'heater',
    ],
    // 4. Absorption, Stripping & Extraction
    absorber: [
      'liquid-liquid extractor', 'steam stripper', 'absorber', 'stripper', 'extractor',
    ],
    // 5. Reaction
    reactor: [
      'continuous stirred-tank reactor', 'jacketed cstr', 'cstr',
      'plug flow reactor', 'pfr', 'tubular reactor', 'gibbs reactor',
      'jacketed reactor', 'reactor',
    ],
    // 6. Adsorption, Permeation & Crystallization
    adsorption: [
      'pressure swing adsorption', 'temperature swing adsorption',
      'psa', 'tsa', 'membrane separator', 'crystallizer', 'crystalliser',
    ],
    // 7a. Pumps
    pump: [
      'canned motor pump', 'multistage pump', 'centrifugal pump',
      'reciprocating pump', 'diaphragm pump', 'metering pump', 'gear pump',
      'reflux pump', 'charge pump', 'duty pump', 'standby pump', 'pump',
    ],
    // 7b. Compressors
    compressor: [
      'centrifugal compressor', 'reciprocating compressor', 'compressor',
    ],
    // 7c. Flow Modulation (includes check valves — merged, no separate kind)
    valve: [
      'three-way control valve', 'butterfly control valve', 'rotary control valve',
      'anti-surge valve', 'non-return valve', 'check valve', 'swing check',
      'control valve', 'gate valve', 'ball valve', 'butterfly valve', 'nrv', 'valve',
    ],
    // 8. Accumulation & Storage
    vessel: [
      'overhead accumulator', 'reflux drum', 'blowdown drum',
      'buffer vessel', 'surge drum',
      'floating roof tank', 'fixed roof tank', 'atmospheric tank',
      'chemical dosing tank', 'day tank', 'slop tank', 'hot well', 'sump',
      'gas cylinder', 'cylinder', 'drum', 'tank', 'vessel',
      'desalter', 'vacuum unit',
    ],
    // 9. Relief devices — PSVs, rupture discs, conservation vents
    relief: [
      'pressure safety valve', 'pressure relief valve', 'safety relief valve',
      'safety valve', 'relief valve', 'rupture disc', 'conservation vent',
    ],
    // 10. Inline measurement devices (physical, in-pipe)
    meter: [
      'coriolis mass flowmeter', 'coriolis meter',
      'magnetic flowmeter', 'electromagnetic flowmeter',
      'transit-time ultrasonic', 'ultrasonic flow meter', 'clamp-on ultrasonic',
      'vortex flowmeter', 'vortex shedding meter',
      'positive displacement meter', 'pd meter', 'oval gear meter',
      'turbine meter', 'turbine flow meter',
      'mass flow meter', 'flow meter', 'flowmeter', 'meter',
    ],
    // ── ISA 5.1 Instrumentation (Lipták Vol. 1 & Yeturu/Reddy) ────────────────
    // 10. Transmitters — field-mounted, outputs 4–20 mA / HART / digital signal
    transmitter: [
      // Flow
      'differential pressure transmitter', 'dp transmitter', 'delta-p transmitter',
      'averaging pitot transmitter', 'mass flow transmitter', 'flow transmitter',
      // Level
      'guided wave radar transmitter', 'gwr transmitter', 'radar level transmitter',
      'non-contacting radar transmitter', 'displacer transmitter',
      'interface level transmitter', 'hydrostatic level transmitter',
      'level transmitter',
      // Pressure
      'pressure transmitter',
      // Temperature
      'temperature transmitter',
      // Other
      'density transmitter', 'speed transmitter', 'vibration transmitter',
      'analyzer transmitter', 'quality transmitter',
      'transmitter',
    ],
    // 11. Controllers — DCS / panel, receives measurement, outputs to final element
    controller: [
      'flow indicating controller', 'pressure indicating controller',
      'temperature indicating controller', 'level indicating controller',
      'analyzer indicating controller',
      'feedforward controller', 'cascade controller',
      'override controller', 'split-range controller',
      'flow ratio controller', 'ratio controller',
      'flow controller', 'pressure controller', 'temperature controller', 'level controller',
      'pid controller', 'controller',
    ],
    // 12. Indicators / gauges — local read-out, no signal output
    indicator: [
      'flow indicator', 'pressure indicator', 'temperature indicator', 'level indicator',
      'bourdon gauge', 'bourdon tube gauge', 'dial gauge', 'local gauge', 'mechanical gauge',
      'pressure gauge', 'temperature gauge', 'level gauge',
      'level bridle', 'gauge glass', 'sight glass',
      'local indicator', 'indicator',
    ],
    // 13. Recorders
    recorder: [
      'flow recorder', 'pressure recorder', 'temperature recorder', 'level recorder',
      'chart recorder', 'data recorder', 'recorder',
    ],
    // 14. Switches / trips — ISA xS, xSH, xSL, xSHH, xSLL
    switch: [
      'high-high pressure switch', 'low-low pressure switch',
      'high-high level switch', 'low-low level switch',
      'pressure switch high high', 'pressure switch low low',
      'level switch high high', 'level switch low low',
      'flow switch high', 'flow switch low',
      'pressure switch high', 'pressure switch low',
      'temperature switch high', 'temperature switch low',
      'level switch high', 'level switch low',
      'flow switch', 'pressure switch', 'temperature switch', 'level switch',
      'safety shutdown switch', 'trip switch', 'shutdown switch',
    ],
    // 15. Analyzers — composition / quality measurement
    analyzer: [
      'gas chromatograph', 'online gas chromatograph',
      'ph analyzer', 'ph meter', 'ph probe',
      'oxygen analyzer', 'o2 analyzer', 'co2 analyzer',
      'moisture analyzer', 'gas analyzer', 'online analyzer',
      'analyzer', 'analyser',
    ],
    // 16. Primary sensing elements — in-line, no signal output (Lipták §3–§6)
    element: [
      // Flow elements
      'averaging pitot tube', 'multi-port pitot', 'pitot tube',
      'restriction orifice', 'orifice plate', 'venturi tube', 'venturi nozzle',
      'flow element', 'flow nozzle',
      // Temperature sensing elements
      'resistance temperature detector', 'resistance thermometer',
      'pt100', 'pt1000', 'prt',
      'thermocouple', 'thermowell', 'thermometer well', 'protection tube',
      'infrared pyrometer', 'radiation thermometer',
      'temperature element',
      // Pressure / level elements
      'pressure element', 'pressure tap',
      'level element', 'level bridle',
      // Generic
      'primary element', 'rtd',
    ],
  };

  // ISA tag prefix → kind  (ISA 5.1 / ISA-5.06.01-2007)
  const TAG_KIND = {
    // ── Process equipment ────────────────────────────────────────────────────
    c:    'column',
    v:    'separator',  d:  'separator', sep: 'separator',
    e:    'heat_exchanger',
    ab:   'absorber',
    r:    'reactor',
    p:    'pump',
    k:    'compressor',
    f:    'filter',      // F-xxx: multimedia filter, strainer, etc.
    cv:   'valve', fv:  'valve', lv:  'valve', pv:  'valve',
    tv:   'valve', hv:  'valve', xv:  'valve', sv:  'valve',
    tcv:  'valve', fcv: 'valve', lcv: 'valve', sdv: 'valve', bcv: 'valve', bpv: 'valve',
    // ── Relief devices ────────────────────────────────────────────────────────
    psv:  'relief', prv: 'relief',
    t:    'vessel', h:  'vessel',
    // ── ISA 5.1 Transmitters  xT ─────────────────────────────────────────────
    ft:   'transmitter', pt:  'transmitter', tt:  'transmitter', lt: 'transmitter',
    at:   'transmitter', dt:  'transmitter', st:  'transmitter', wt: 'transmitter',
    l:    'transmitter',  // L-xxx: bare level transmitter (non-standard but common)
    // ── ISA 5.1 Controllers   xC, xIC ────────────────────────────────────────
    fc:   'controller',  pic: 'controller',  tic: 'controller', lic: 'controller',
    fic:  'controller',  pc:  'controller',  tc:  'controller', lc:  'controller',
    aic:  'controller',  ac:  'controller',  ffc: 'controller', frc: 'controller',
    // ── ISA 5.1 Indicators    xI, xG ─────────────────────────────────────────
    fi:   'indicator',   pi:  'indicator',   ti:  'indicator',  li:  'indicator',
    ai:   'indicator',   fg:  'indicator',   pg:  'indicator',  lg:  'indicator',
    // ── ISA 5.1 Recorders     xR ─────────────────────────────────────────────
    fr:   'recorder',    pr:  'recorder',    tr:  'recorder',   lr:  'recorder',
    ar:   'recorder',
    // ── ISA 5.1 Switches      xS / xSH / xSL / xSHH / xSLL ──────────────────
    fs:   'switch',  ps:   'switch',  ts:   'switch',  ls:   'switch',
    fsh:  'switch',  fsl:  'switch',
    psh:  'switch',  psl:  'switch',  pshh: 'switch',  psll: 'switch',
    tsh:  'switch',  tsl:  'switch',  tshh: 'switch',  tsll: 'switch',
    lsh:  'switch',  lsl:  'switch',  lshh: 'switch',  lsll: 'switch',
    // ── ISA 5.1 Alarm / trip tags (xAH / xAL / xAHH / xALL → switch kind) ───
    pah:  'switch',  pal:  'switch',  pahh: 'switch',  pall: 'switch',
    tah:  'switch',  tal:  'switch',  tahh: 'switch',  tall: 'switch',
    lah:  'switch',  lal:  'switch',  lahh: 'switch',  lall: 'switch',
    fah:  'switch',  fal:  'switch',
    // ── ISA 5.1 Primary elements  xE ─────────────────────────────────────────
    fe:   'element', pe:   'element', te:   'element', le:   'element',
    fm:   'element',
    // ── Analyzers ─────────────────────────────────────────────────────────────
    qt:   'analyzer', ph:  'analyzer',
    // ── Additional explicit prefixes (ISA 5.1 + common field usage) ──────────
    hs:   'switch',       // Hand switch / hand station
    vt:   'transmitter',  // Vibration transmitter
    jt:   'valve',        // JT expansion valve (auto-refrigeration)
    mt:   'transmitter',  // Moisture transmitter
    yt:   'transmitter',  // Position transmitter (DCS usage)
    sic:  'controller',   // Secondary/slave indicator controller
    cs:   'meter',        // Pipeline segment — treat as meter
  };

  // ISA 5.1 algorithmic tag-kind resolution.
  // TAG_KIND is checked first (explicit wins); then last-letter rules apply.
  function resolveTagKind(prefix) {
    const p = prefix.toLowerCase();
    if (TAG_KIND[p] !== undefined) return TAG_KIND[p];
    // Alarm/trip suffix patterns (xAH, xAL, xAHH, xALL)
    if (p.endsWith('ahh') || p.endsWith('all')) return 'switch';
    if (p.endsWith('ah')  || p.endsWith('al'))  return 'switch';
    // Last-letter ISA 5.1 rules
    const last = p[p.length - 1];
    if (last === 'c') return 'controller';
    if (last === 't') return 'transmitter';
    if (last === 'v') return 'valve';
    if (last === 's') return 'switch';
    if (last === 'e') return 'element';
    if (last === 'i') return 'indicator';
    if (last === 'r') return 'recorder';
    if (last === 'y') return 'controller';
    return null;
  }

  // Build sorted term list (longest first for greedy left-to-right match)
  const SORTED_TERMS = [];
  for (const [kind, terms] of Object.entries(KINDS)) {
    for (const term of terms) {
      SORTED_TERMS.push({ term: term.toLowerCase(), kind });
    }
  }
  SORTED_TERMS.sort((a, b) => b.term.length - a.term.length);

  // Fuzzy-eligible terms: only those long enough to survive edit-distance matching.
  // Short terms (≤ 4 chars: "pump", "drum", "tank"...) would produce too many false
  // positives; they are matched exactly or via TYPOS rules instead.
  // Sorted longest-first so multi-word spans win over single-word spans at same distance.
  const FUZZY_TERMS = SORTED_TERMS.filter(t => t.term.length >= 5);

  // Levenshtein edit distance (single-row rolling, early-exit via maxDist).
  function levenshtein(a, b, maxDist) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > maxDist) return maxDist + 1;
    const row = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = row[j];
        row[j] = a[i-1] === b[j-1] ? prev : 1 + Math.min(prev, row[j], row[j-1]);
        prev = tmp;
      }
    }
    return row[n];
  }

  // Words that must NOT be used as label prefixes when scanning backward
  const LABEL_STOP = new Set([
    'a','an','the','and','or','but','nor','so','yet',
    'in','on','at','to','for','of','with','from','by','into','through','via','over','under',
    'is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','can','could','should','shall','may','might',
    'it','its','this','that','these','those','which','who','what','where','when',
    'then','after','before','while','until','if','as','although','because',
    'around','across','between','alongside','inside','outside','above','below',
    'connected','fed','sent','routed','pumped','flows','feeds','also','just',
    'only','any','all','some','no','not','each','both','either','here','there',
    'suction','discharge','inlet','outlet',
    // ── Action verbs: prevent spurious "Maintains Reactor", "Cools Reactor" etc.
    'maintains','maintain','maintaining',
    'monitors','monitor','monitoring',
    'prevents','prevent','preventing',
    'ensures','ensure','ensuring',
    'measures','measure','measuring',
    'exits','exit','exiting',
    'vents','vent','venting',
    'control','controls','controlling',
    'provides','provide','providing',
    'using','uses',
    'enters','entering',
    'leaves','leaving',
    'transfers','transfer',
    'processes','process',
    'removes','remove','removing',
    'separates','separate','separating',
    'generates','generate',
    'requires','require',
    'reduces','reduce',
    'increases','increase',
    'accepts','accept',
    'supplies','supply',
    'performs','perform',
    'cools','cool','cooling',
    'heats','heat','heating',
    'treats','treat','treating',
    'absorbs','absorb','absorbing',
    'strips','strip','stripping',
    'compresses','compress','compressing',
    'condensates','condenses','condense',
    'evaporates','evaporate',
    'recycles','recirculates',
    'isolates','isolate',
    'protects','protect',
    'regulates','regulate',
    'connects','connect',
    'receives','receive',
  ]);

  // ─── NORMALIZER ────────────────────────────────────────────────────────────

  const TYPOS = [
    // Arrow separators (ISA tag chains drawn with Unicode arrows)
    [/→/g, ' '],
    // Pumps
    [/\bpumpp\b/gi, 'pump'],
    [/\bpump s\b/gi, 'pump'],
    [/\bcntrifugal\b/gi, 'centrifugal'],
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
    // Drums / separators
    [/\bdrom\b/gi, 'drum'],
    [/\bdrume\b/gi, 'drum'],
    // Coolers / condensers / heat exchangers
    [/\bcoler\b/gi, 'cooler'],
    [/\bcondnser\b/gi, 'condenser'],
    [/\bcondencer\b/gi, 'condenser'],
    [/\bcondnsr\b/gi, 'condenser'],
    [/\bcondser\b/gi, 'condenser'],
    [/\bcondensor\b/gi, 'condenser'],
    // Reboilers
    [/\brebolier\b/gi, 'reboiler'],
    [/\breboler\b/gi, 'reboiler'],
    [/\brebiler\b/gi, 'reboiler'],
    // Meters & flow elements
    [/\bflowmetr\b/gi, 'flow meter'],
    [/\bflow\s+mter\b/gi, 'flow meter'],
    [/\bflw\s+meter\b/gi, 'flow meter'],
    [/\bannubar\b/gi, 'averaging pitot tube'],          // Emerson trade name → generic
    [/\bmagmeter\b/gi, 'magnetic flowmeter'],
    [/\bmag\s+flow\b/gi, 'magnetic flowmeter'],
    [/\bem\s+flow\b/gi, 'magnetic flowmeter'],
    // Temperature sensing
    [/\bpt\s*100\b/gi, 'rtd'],
    [/\bpt\s*1000\b/gi, 'rtd'],
    [/\bprtd\b/gi, 'rtd'],
    [/\bthermowell\b/gi, 'thermowell'],                // keep canonical spelling
    // Instrument signal / calibration shorthand
    [/\b4\s*[-–]\s*20\s*ma\b/gi, 'transmitter'],      // "4-20 mA signal" → transmitter context
    [/\bdp\s+tx\b/gi, 'dp transmitter'],
    [/\bep\s+positioner\b/gi, 'valve positioner'],
    [/\bdvc\b/gi, 'valve positioner'],                 // Fisher trade name → generic
    // Absorbers / strippers
    [/\babosrber\b/gi, 'absorber'],
    [/\babsorbar\b/gi, 'absorber'],
    [/\babsrober\b/gi, 'absorber'],
    [/\bstriper\b/gi, 'stripper'],
    [/\bstripr\b/gi, 'stripper'],
    [/\bstiper\b/gi, 'stripper'],
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
    // "reactor feed drum" → "feed drum" (reactor as adjective before vessel)
    [/\breactor\s+feed\b/gi, 'feed'],
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
        const tagM = text.slice(i).match(/^([A-Za-z]{1,5}-\d{2,4}[A-Za-z]?)\b/);
        if (tagM) {
          const pre = i === 0 || /[\s,;.()\-\/]/.test(text[i - 1]);
          if (pre) {
            const prefix = tagM[1].split('-')[0].toLowerCase();
            let kind     = resolveTagKind(prefix);
            if (kind) {
              let overlap = false;
              for (let j = i; j < i + tagM[1].length; j++) { if (used[j]) { overlap = true; break; } }
              if (!overlap) {
                // ── Description-first override: check text immediately after tag ──
                // If a recognised KINDS term follows within 1-4 words, its kind
                // takes precedence over the TAG_KIND prefix default.
                // E.g. "F-401 fired heater" → heat_exchanger (not filter).
                let scanEnd = i + tagM[1].length;
                const afterTag = lower.slice(scanEnd);
                // Extract up to 4 words after the tag (stop at sentence punctuation).
                const wordM = afterTag.match(/^(\s+[a-z][a-z0-9\-]*(?:\s+[a-z][a-z0-9\-]*){0,3})/);
                if (wordM) {
                  const descLow = wordM[1].trim();
                  for (const { term, kind: tk } of SORTED_TERMS) {
                    if (descLow === term || descLow.startsWith(term + ' ') || descLow.startsWith(term + '\t')) {
                      kind    = tk;
                      scanEnd = scanEnd + wordM[1].indexOf(term) + term.length;
                      break;
                    }
                  }
                }
                for (let j = i; j < scanEnd; j++) used[j] = 1;
                found.push({ label: tagM[1].toUpperCase(), kind, start: i });
                i = scanEnd;
                matched = true;
              }
            }
          }
        }
      }

      // ── Fuzzy fallback: match word spans (1-4 words) against FUZZY_TERMS ──
      // Runs only when exact and ISA matching both failed at this position.
      // Builds incremental spans word-by-word; compares each span against all
      // eligible terms using Levenshtein. Threshold: dist ≤ 1 for terms ≤ 8
      // chars, dist ≤ 2 for longer terms. Uses canonical term as the label so
      // typo text never leaks into the output.
      if (!matched) {
        const atWordStart = i === 0 || /[\s,;.()\-\/]/.test(lower[i - 1]);
        if (atWordStart && /[a-z]/.test(lower[i])) {
          // Build word spans: {spanText, spanEnd} for 1-4 consecutive words
          const spans = [];
          let pos = i;
          for (let wc = 0; wc < 4; wc++) {
            if (wc > 0) {
              if (pos >= len || lower[pos] !== ' ') break;
              pos++;
              if (pos >= len || !/[a-z]/.test(lower[pos])) break;
            }
            const wordStart = wc === 0 ? i : spans[wc - 1].spanEnd + 1;
            while (pos < len && /[a-z0-9\-]/.test(lower[pos])) pos++;
            if (pos === (wc === 0 ? i : spans[wc-1].spanEnd + 1)) break;
            // Don't extend the span through stop/connector words — prevents "pressure to"
            // from fuzzy-matching "pressure tap" when "to" is a sentence connector.
            const addedWord = lower.slice(wordStart, pos);
            if (wc > 0 && LABEL_STOP.has(addedWord)) break;
            spans.push({ spanText: lower.slice(i, pos), spanEnd: pos });
          }

          let bestTerm = null, bestKind = null, bestEnd = -1, bestDist = 99;
          for (const { spanText, spanEnd } of spans) {
            const sLen = spanText.length;
            for (const { term, kind } of FUZZY_TERMS) {
              if (Math.abs(term.length - sLen) > 3) continue; // fast length filter
              const maxD = term.length <= 8 ? 1 : 2;
              const dist = levenshtein(spanText, term, maxD);
              if (dist === 0) continue; // exact matches already handled above
              if (dist > maxD) continue;
              // Prefer longer span at same distance (greedy), then lower distance
              const better = bestTerm === null ||
                             dist < bestDist ||
                             (dist === bestDist && spanEnd > bestEnd);
              if (better) {
                // Verify no overlap with consumed chars
                let overlap = false;
                for (let j = i; j < spanEnd; j++) { if (used[j]) { overlap = true; break; } }
                if (!overlap) { bestTerm = term; bestKind = kind; bestEnd = spanEnd; bestDist = dist; }
              }
            }
          }

          if (bestTerm) {
            for (let j = i; j < bestEnd; j++) used[j] = 1;
            let fuzzyLabel = titleCase(bestTerm);
            let fuzzyEnd   = bestEnd;
            // Look for a trailing ISA tag (same as in exact match branch)
            const afterFuzzy = text.slice(bestEnd);
            const fTagM = afterFuzzy.match(/^\s+([A-Za-z]{1,5}-\d{2,4}[A-Za-z]?)\b/);
            if (fTagM) {
              const fPrefix = fTagM[1].split('-')[0].toLowerCase();
              if (resolveTagKind(fPrefix)) {
                fuzzyLabel = fTagM[1].toUpperCase();
                fuzzyEnd   = bestEnd + fTagM[0].length;
                for (let j = bestEnd; j < fuzzyEnd; j++) used[j] = 1;
              }
            }
            found.push({ label: fuzzyLabel, kind: bestKind, start: i });
            i = fuzzyEnd;
            matched = true;
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

  // anchorConnections — explicit prose flow edges (thin wrapper over _extractProseEdges).
  // Called with mainFlow nodes so recycle-branch nodes are excluded.
  function anchorConnections(nodes, text) {
    return _extractProseEdges(nodes, normalize(text));
  }

  // detectFanOut — one source → multiple destinations from phase-split language.
  // Patterns: "overhead from X to Y", "bottoms from X to Z", "vapor from X to Y"
  function detectFanOut(nodes, text) {
    const result  = [];
    const lower   = text.toLowerCase();
    const seenKey = new Set();
    function addEdge(fromId, toId) {
      const key = fromId + '>' + toId;
      if (!seenKey.has(key)) { seenKey.add(key); result.push({ from: fromId, to: toId, kind: 'stream' }); }
    }
    // First capture: tag/label without spaces so "v-101 is recycled back" is not captured.
    // Second capture: allows spaces for multi-word destination labels.
    // The recycle guard below also catches sentences with recycle/back keywords.
    const re = /\b(?:overhead|bottoms?|vapor|vapour|liquid|distillate|condensate|off[-\s]?gas|product)\s+(?:from|of)\s+([a-z][a-z0-9\-]+)\s+(?:to|into)\s+([a-z][a-z0-9\s\-]*?)(?=\s*[,.\n!?]|$)/gi;
    let m;
    while ((m = re.exec(lower)) !== null) {
      const fromLabel = m[1].trim();
      const toLabel   = m[2].trim();
      const fromN = nodes.find(n => matchesLabel(n.label, fromLabel));
      const toN   = nodes.find(n => matchesLabel(n.label, toLabel));
      if (fromN && toN && fromN.id !== toN.id) addEdge(fromN.id, toN.id);
    }
    return result;
  }

  // detectFanIn — multiple sources → one destination (combine/join/merge/mix).
  // Pattern: "A and B combine/join/merge into C"
  function detectFanIn(nodes, text) {
    const result  = [];
    const lower   = text.toLowerCase();
    const seenKey = new Set();
    function addEdge(fromId, toId) {
      const key = fromId + '>' + toId;
      if (!seenKey.has(key)) { seenKey.add(key); result.push({ from: fromId, to: toId, kind: 'stream' }); }
    }
    const re = /\b([a-z][a-z0-9\-]+)\s+and\s+([a-z][a-z0-9\-]+)\s+(?:combine|join|merge|converge|mix)(?:\s+(?:into|to|at))?\s+([a-z][a-z0-9\s\-]*?)(?=\s*[,.\n!?]|$)/gi;
    let m;
    while ((m = re.exec(lower)) !== null) {
      const a = m[1].trim(), b = m[2].trim(), c = m[3].trim();
      const nA = nodes.find(n => matchesLabel(n.label, a));
      const nB = nodes.find(n => matchesLabel(n.label, b));
      const nC = nodes.find(n => matchesLabel(n.label, c));
      if (nA && nC && nA.id !== nC.id) addEdge(nA.id, nC.id);
      if (nB && nC && nB.id !== nC.id) addEdge(nB.id, nC.id);
    }
    return result;
  }

  // detectParallelTrains — replicate stream edges for A/B twin nodes.
  // e.g. P-101A and P-101B: if P-101A has edges, mirror them for P-101B.
  function detectParallelTrains(nodes, edges) {
    const result  = [];
    const seenKey = new Set(edges.map(e => e.from + '>' + e.to));
    for (const nodeA of nodes) {
      const mA = nodeA.label.match(/^([A-Za-z]{1,5}-\d{2,4})([A-Ba-b])$/);
      if (!mA) continue;
      const base = mA[1], suffA = mA[2].toUpperCase();
      if (suffA !== 'A') continue;
      const nodeB = nodes.find(n => n.label.toUpperCase() === base + 'B');
      if (!nodeB) continue;
      for (const e of edges) {
        if (e.kind !== 'stream') continue;
        if (e.from === nodeA.id) {
          const key = nodeB.id + '>' + e.to;
          if (!seenKey.has(key) && e.to !== nodeB.id) { seenKey.add(key); result.push({ from: nodeB.id, to: e.to, kind: 'stream' }); }
        }
        if (e.to === nodeA.id) {
          const key = e.from + '>' + nodeB.id;
          if (!seenKey.has(key) && e.from !== nodeB.id) { seenKey.add(key); result.push({ from: e.from, to: nodeB.id, kind: 'stream' }); }
        }
      }
    }
    return result;
  }

  // implicitChain — sequential fill-in for nodes with no existing outgoing stream edge.
  // Only adds A→B when A has no outgoing stream edge, preventing override of anchors.
  function implicitChain(mainFlow, existingEdges) {
    const result     = [];
    const seenKey    = new Set(existingEdges.map(e => e.from + '>' + e.to));
    const hasOutgoing = new Set(
      existingEdges.filter(e => e.kind === 'stream' || !e.kind).map(e => e.from)
    );
    for (let i = 0; i < mainFlow.length - 1; i++) {
      const fromId = mainFlow[i].id;
      const toId   = mainFlow[i + 1].id;
      const key    = fromId + '>' + toId;
      if (!seenKey.has(key) && !hasOutgoing.has(fromId)) {
        seenKey.add(key);
        hasOutgoing.add(fromId);
        result.push({ from: fromId, to: toId, kind: 'stream' });
      }
    }
    return result;
  }

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

    const mainFlow = nodes.filter(n => !recycleBranch.has(n.id));

    // ── Step 2a: Anchor connections — explicit prose-directed edges ──────────
    for (const e of anchorConnections(mainFlow, text)) {
      if (!edges.some(x => x.from === e.from && x.to === e.to)) edges.push(e);
    }

    // ── Step 2b: Fan-out — phase-split / overhead-bottoms patterns ───────────
    for (const e of detectFanOut(mainFlow, text)) {
      if (!edges.some(x => x.from === e.from && x.to === e.to)) edges.push(e);
    }

    // ── Step 2c: Fan-in — combine / join / merge patterns ───────────────────
    for (const e of detectFanIn(mainFlow, text)) {
      if (!edges.some(x => x.from === e.from && x.to === e.to)) edges.push(e);
    }

    // ── Step 2d: Parallel trains — A/B suffix replication ───────────────────
    for (const e of detectParallelTrains(mainFlow, edges)) {
      if (!edges.some(x => x.from === e.from && x.to === e.to)) edges.push(e);
    }

    // ── Step 3: Bypass — pattern A: "bypass [line|pipe|loop] [goes] around/over/across X"
    // Allows 0-2 optional words between "bypass line" and "around" (e.g. "bypass line goes around").
    const bypassRe = /(?:bypass(?:\s+(?:line|pipe|loop|valve))?|parallel\s+path|alternative\s+route|crossover)(?:\s+\w+){0,2}\s+(?:around|over|across)\s+([a-z][a-z0-9\s\-]*?)(?=\s*(?:directly|from|via|then|[,.\n])|$)/gi;
    while ((m = bypassRe.exec(lower)) !== null) {
      const anchor = m[1].trim();
      const target = mainFlow.find(n => matchesLabel(n.label, anchor));
      if (!target) continue;
      const idx = mainFlow.indexOf(target);
      if (idx > 0 && idx < mainFlow.length - 1) {
        edges.push({ from: mainFlow[idx - 1].id, to: mainFlow[idx + 1].id, kind: 'bypass', label: 'Bypass' });
      }
    }

    // ── Step 4: Bypass — check ALL nodes as potential bypass targets.
    //   Patterns:  B: "[node] with [a] bypass"
    //              C: "[node] has [a] bypass"
    //              D: "bypass [line] for/on [node]"
    //   Uses stream edges already in place (from anchor + sequential fill below).
    // Build a temporary sequential fill so bypass B/C/D can find up/downstream.
    const tempFill = implicitChain(mainFlow, edges);
    const edgesForBypass = [...edges, ...tempFill];
    for (const targetNode of mainFlow) {
      const nl = escRe(targetNode.label.toLowerCase());
      const patB = new RegExp('\\b' + nl + '\\s+with\\s+(?:a\\s+|the\\s+)?bypass\\b');
      const patC = new RegExp('\\b' + nl + '\\s+has\\s+(?:a\\s+|the\\s+)?bypass\\b');
      const patD = new RegExp('\\bbypass(?:\\s+(?:line|pipe|loop|valve))?\\s+(?:for|on)\\s+(?:a\\s+|the\\s+)?' + nl + '\\b');
      if (!patB.test(lower) && !patC.test(lower) && !patD.test(lower)) continue;
      // Find the stream-upstream and stream-downstream nodes via built edges
      const upEdge   = edgesForBypass.find(e => e.to   === targetNode.id && (!e.kind || e.kind === 'stream'));
      const downEdge = edgesForBypass.find(e => e.from === targetNode.id && (!e.kind || e.kind === 'stream'));
      if (!upEdge || !downEdge) continue;
      if (!edges.some(e => e.from === upEdge.from && e.to === downEdge.to && e.kind === 'bypass')) {
        edges.push({ from: upEdge.from, to: downEdge.to, kind: 'bypass', label: 'Bypass' });
      }
    }

    // ── Step 5a: Recycle — patterns: "recycled back to", "recycle to", "returned to", etc.
    // "recycles [from X] back to Y" — antisurge / instrument-mediated recycle
    const recyclesRe = /\brecycles\s+(?:from\s+[a-z][a-z0-9\s\-]*?)?\s*back\s+to\s+([a-z][a-z0-9\s\-]*?)(?=\s*[,.\n]|$)/gi;
    while ((m = recyclesRe.exec(lower)) !== null) {
      const anchor = m[1].trim();
      const target = nodes.find(n => matchesLabel(n.label, anchor));
      if (!target) continue;
      // FROM node: look for an ISA tag immediately before "recycles" in the text
      const before = lower.slice(0, m.index);
      const tagM2  = before.match(/([a-z]{1,5}-\d{2,4}[a-z]?)\s*$/i);
      const fromNode = tagM2 ? nodes.find(n => n.label.toUpperCase() === tagM2[1].toUpperCase()) : null;
      if (!fromNode) continue;   // only add recycle when source is explicitly identified
      edges.push({ from: fromNode.id, to: target.id, kind: 'recycle', label: 'Recycle' });
    }

    const recycleRe = /(?:recycled?\s+(?:(?:stream|loop|pipe|line)\s+)?|recirculation\s+(?:line\s+)?|recirculated\s+|product\s+recycle\s+|return\s+line\s+|returned\s+)\s*(?:to|back\s+to|return\s+to|around)\s+([a-z][a-z0-9\s\-]*?)(?=\s*[,.\n]|$)/gi;
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

    // ── Step 6: Fill remaining sequential gaps ───────────────────────────────
    // Only adds A→B when A has no existing outgoing stream edge, so anchor
    // connections are never overridden by the sequential fill-in.
    for (const e of implicitChain(mainFlow, edges)) {
      edges.push(e);
    }

    return edges;
  }

  function matchesLabel(nodeLabel, searchStr) {
    const nl = nodeLabel.toLowerCase();
    const ss = searchStr.toLowerCase().trim();
    if (nl === ss || nl.includes(ss) || ss.includes(nl)) return true;
    // Fuzzy fallback: allow edit distance ≤ 2 so typo'd anchors in recycle/bypass
    // phrases still resolve to the correct (canonical-label) node.
    // Skip fuzzy when either string is an ISA tag (letter-hyphen-digits) — tags like
    // P-101 and E-101 differ by only one char so would incorrectly match each other.
    const ISA_TAG_RE = /^[a-z]{1,5}-\d{2,4}[a-z]?$/;
    if (!ISA_TAG_RE.test(nl) && !ISA_TAG_RE.test(ss) && ss.length >= 5 && Math.abs(nl.length - ss.length) <= 3) {
      if (levenshtein(nl, ss, 2) <= 2) return true;
    }
    return false;
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

    // ── Pattern 2: flow-verb pairs "A <verb> B" ─────────────────────────────
    // Establishes A before B; B is NOT pinned as sink (it may be an intermediate).
    // Covers: "feeds", "flows to", "pumps to", "passes through", "is routed to",
    //         "is connected to", "discharges to", "exits to", "connects to",
    //         "outlet/effluent/discharge goes to", "outlet/discharge is sent to"
    const FLOW_VERBS =
      'feeds?(?:\\s+into)?|' +
      '(?:flows?|pumps?|leads?|routes?|delivers?|sends?|discharges?|pushes?|exits?|connects?)(?:\\s+(?:to|into))|' +
      'passes?\\s+(?:through|into|to)|' +
      'is\\s+(?:connected|routed|piped|directed|sent|fed)\\s+to|' +
      'connects?\\s+to';
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

    // ── Pattern 2d: "A outlet/effluent/discharge/product/exit goes/flows to B" ─
    // Handles: "reactor effluent goes to separator", "pump outlet to valve"
    const OUTLET = '(?:outlet|effluent|discharge|output|product|exit|return)';
    const OUTLET_CONN = '(?:\\s+(?:goes?|flows?|is\\s+(?:sent|routed|piped)))?\\s+(?:to|into)';
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        if (new RegExp('\\b' + ar + '\\s+' + OUTLET + OUTLET_CONN + '\\s+' + br + '\\b').test(lower)) {
          addPair(nodes[i].id, nodes[j].id, false);
        }
      }
    }

    // ── Pattern 2b-extended: "A enters/is supplied to/is received by B" ───────
    // "X enters A [from B]" → B→A (A is destination, B is source)
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        // "A ... from [desc] B" where the sentence has an "enters/feeds/goes to" verb
        const reEnters = new RegExp('\\b(?:enters?|goes\\s+(?:to|into)|is\\s+(?:fed|supplied)\\s+(?:to|into))\\s+(?:[\\w][\\w-]*\\s+){0,3}' + ar + '\\b[^.]*?\\bfrom\\s+(?:[\\w][\\w-]*\\s+){0,4}' + br + '\\b');
        if (reEnters.test(lower)) addPair(nodes[j].id, nodes[i].id, false);
      }
    }

    // ── Pattern 2c: bare "A [opt] to/through/then [opt] B" ─────────────────
    // Handles: "flash drum to trim cooler to product tank" (no leading "from").
    // Extended to allow up to 2 optional words before the connector and up to
    // 4 optional words after it — handles "P-101 to mixer M-101" and
    // "C-101 bottom to rich amine flash drum V-101".
    // Excludes pairs where the connecting text contains recycle/back keywords.
    // No sink pinning — these are ordering constraints only.
    const BARE_CONN_RE = '((?:\\s+\\w+){0,2}\\s+(?:to|through|into|toward|then)\\s+(?:\\w+\\s+){0,4})';
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        const m2c = new RegExp('\\b' + ar + BARE_CONN_RE + br + '\\b').exec(lower);
        if (m2c && !/recycle|recircul|return(?:ed)?\s+to|\bback\b/i.test(m2c[1])) {
          addPair(nodes[i].id, nodes[j].id, false);
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

  // Set of canonical kind-name labels (lowercase). A node whose label IS one of
  // these AND whose kind matches another tagged node is treated as a duplicate.
  const _KIND_NAMES = new Set([
    'pump','valve','compressor','reactor','column','separator','vessel','drum','tank',
    'exchanger','cooler','heater','condenser','reboiler','filter','meter',
    'transmitter','controller','indicator','switch','analyzer','element','recorder',
    // Additional single-word synonyms that appear as spurious duplicates
    'absorber','stripper','extractor','fractionator','splitter','scrubber',
    'distillation','fractionation','evaporator','crystallizer',
    // Instrumentation short forms
    'rtd','thermocouple','thermowell','orifice','pitot',
  ]);

  // Remove bare single-word back-references to equipment already found.
  // Also removes single-word canonical kind labels (e.g. "Valve") when a
  // tagged node of the same kind already exists (e.g. FCV-101).
  function deduplicateNodes(nodes) {
    const result = [];
    for (const n of nodes) {
      if (n.label.indexOf(' ') === -1) {   // single-word label only
        const lc = n.label.toLowerCase();
        // Back-reference: earlier longer label of same kind contains this label
        const isBackRef = result.some(prev =>
          prev.kind === n.kind &&
          prev.label !== n.label &&
          prev.label.toLowerCase().includes(lc)
        );
        if (isBackRef) continue;
        // Generic kind-name: label is a canonical kind word AND a tagged node
        // of the same kind already exists (ISA tag label contains a dash).
        if (_KIND_NAMES.has(lc)) {
          const hasTagged = result.some(prev =>
            prev.kind === n.kind &&
            prev.label.includes('-')
          );
          if (hasTagged) continue;
        }
      }
      result.push(n);
    }
    // Two-pass: remove generic kind-name labels when ANY tagged same-kind node
    // exists anywhere in the result (catches "Valve" before FCV-101 ordering).
    const allTaggedKinds = new Set(result.filter(n => n.label.includes('-')).map(n => n.kind));
    return result.filter(n => {
      const lc = n.label.toLowerCase();
      if (n.label.indexOf(' ') !== -1) {
        // Multi-word instrument/valve/relief labels (e.g. "Pressure Transmitter",
        // "Flow Control Valve") are always spurious description nodes when an ISA-tagged
        // node of the same kind already exists. Equipment multi-word labels (e.g.
        // "Reflux Drum", "Suction Drum") may represent distinct untagged equipment — kept.
        const DEDUP_MULTI_KINDS = new Set([
          ..._INSTR_KINDS, 'valve', 'checkvalve', 'relief',
        ]);
        if (DEDUP_MULTI_KINDS.has(n.kind) && !n.label.includes('-') && allTaggedKinds.has(n.kind)) {
          return false;
        }
        return true;
      }
      if (_KIND_NAMES.has(lc) && allTaggedKinds.has(n.kind)) return false;
      return true;
    });
  }

  // Reclassify stream edges as 'signal' when both endpoints are instruments,
  // or when an instrument drives a valve (final control element).
  function classifySignalEdges(nodes, edges) {
    const kindMap = new Map(nodes.map(n => [n.id, n.kind]));
    return edges.map(e => {
      if (e.kind !== 'stream') return e;
      const fk = kindMap.get(e.from);
      const tk = kindMap.get(e.to);
      const fromInstr = _INSTR_KINDS.has(fk);
      const toInstr   = _INSTR_KINDS.has(tk) || tk === 'valve' || tk === 'checkvalve';
      if (fromInstr && toInstr) return Object.assign({}, e, { kind: 'signal' });
      return e;
    });
  }

  // ─── STRUCTURED SECTION PARSER ────────────────────────────────────────────
  // When input contains Equipment: / Instruments: sections with "- TAG: desc"
  // entries, parse them as authoritative node definitions.  Tag ID = label,
  // description text = kind hint.  Returns null when no sections are present.

  function _inferKindFromDesc(desc) {
    const low = desc.toLowerCase();
    for (const { term, kind } of SORTED_TERMS) {
      if (low.includes(term)) return kind;
    }
    return null;
  }

  function _parseStructuredSections(text) {
    const equipMatch = text.match(/\bEquipment\s*:([\s\S]*?)(?=\n\s*\n|\bInstruments?\s*:|$)/i);
    const instrMatch = text.match(/\bInstruments?\s*:([\s\S]*?)$/i);
    if (!equipMatch && !instrMatch) return null;

    // Parse "- TAG-ID: description …" items — supports both newline- and
    // space-separated lists.  Description stops at the next "- TAG:" entry or
    // at a blank line (prevents prose from bleeding into last item's desc).
    function parseItems(block) {
      const items = [];
      const re = /-\s*([A-Za-z]{1,5}-\d{2,4}[A-Za-z]?)\s*:\s*(.*?)(?=\s*-\s*[A-Za-z]{1,5}-\d{2,4}[A-Za-z]?\s*:|\n\s*\n|$)/gs;
      let m;
      while ((m = re.exec(block)) !== null) {
        items.push({ tag: m[1].toUpperCase(), desc: m[2].trim() });
      }
      return items;
    }

    const equipmentNodes = [];
    const instrumentNodes = [];
    const signalChains = [];   // [{controllerTag, sourceTag, finalTag}]

    if (equipMatch) {
      for (const { tag, desc } of parseItems(equipMatch[1])) {
        const prefix  = tag.split('-')[0].toLowerCase();
        // Description-first: engineer's description is more precise than tag prefix.
        const descKind = _inferKindFromDesc(desc);
        const kind     = descKind || resolveTagKind(prefix) || 'vessel';
        equipmentNodes.push({ tag, kind });
      }
    }

    if (instrMatch) {
      for (const { tag, desc } of parseItems(instrMatch[1])) {
        const prefix = tag.split('-')[0].toLowerCase();
        const kind   = resolveTagKind(prefix) || _inferKindFromDesc(desc) || 'transmitter';
        instrumentNodes.push({ tag, kind });
        // Signal chain: "SRC-TAG to FINAL-TAG" in a controller/switch description.
        // Three cases:
        //   a) Normal:  SRC(transmitter/switch) to FINAL(valve) → SRC→CTRL→FINAL
        //   b) Cascade: MASTER(controller) to THIS(controller)  → MASTER→THIS (no self-loop)
        //   c) Element: SRC(element) to FINAL(valve)           → CTRL→FINAL only (sequential handles SRC→CTRL)
        if (kind === 'controller' || kind === 'switch') {
          const chainM = desc.match(/\b([A-Za-z]{1,5}-\d{2,4}[A-Za-z]?)\s+to\s+([A-Za-z]{1,5}-\d{2,4}[A-Za-z]?)\b/i);
          if (chainM) {
            const src  = chainM[1].toUpperCase();
            const fin  = chainM[2].toUpperCase();
            signalChains.push({
              controllerTag: tag,
              sourceTag:     src,
              finalTag:      fin,
              // Mark cascade: if final === this controller (slave pointing to itself)
              isCascade:     fin === tag.toUpperCase(),
            });
          }
        }
      }
    }

    // Extract prose: all text OUTSIDE Equipment: and Instruments: sections.
    // Handles both "prose → Instruments:" and "Equipment: … blank … prose" layouts.
    const proseText = text
      .replace(/\bEquipment\s*:[\s\S]*?(?=\n\s*\n|\bInstruments?\s*:|$)/gi, '')
      .replace(/\bInstruments?\s*:[\s\S]*$/gi, '')
      .trim();

    // Also capture the Equipment: section text for edge-building fallback
    // when proseText is empty (Equipment: starts the input with no preceding prose).
    const equipmentText = equipMatch ? equipMatch[1].trim() : '';

    return { equipmentNodes, instrumentNodes, signalChains, proseText, equipmentText };
  }

  // Remove transitive edges: if A→B and B→C both exist, A→C is redundant.
  function _removeTransitiveEdges(pairs) {
    const pairSet = new Set(pairs.map(p => p.from + '>' + p.to));
    return pairs.filter(p => {
      const hasIntermediate = pairs.some(q =>
        q.from === p.from && q.to !== p.to && pairSet.has(q.to + '>' + p.to)
      );
      return !hasIntermediate;
    });
  }

  // Extract prose-derived directed pairs from the directed-pair logic used in
  // reorderNodes. Uses the same flow-verb and positional patterns.
  function _extractProseEdges(nodes, prose) {
    if (nodes.length < 2) return [];
    const lower   = prose.toLowerCase();
    const pairs   = [];
    const seenKey = new Set();

    function addPair(fromId, toId) {
      const key = fromId + '>' + toId;
      if (key !== toId + '>' + fromId && !seenKey.has(key)) {  // no self-loops, no dups
        seenKey.add(key);
        pairs.push({ from: fromId, to: toId });
      }
    }

    const OPT2 = '(?:[\\w][\\w-]*\\s+){0,2}';

    // Pattern 1: "from A to B" — skip if connecting text contains recycle/back keywords
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        const re1 = new RegExp('\\bfrom\\s+' + ar + '\\b([^.]*?)\\bto\\s+(?:\\w+\\s+){0,3}' + br + '\\b');
        const m1  = re1.exec(lower);
        if (m1 && !/recycle|recircul|return(?:ed)?\s+to|\bback\b/i.test(m1[1])) {
          addPair(nodes[i].id, nodes[j].id);
        }
      }
    }

    // Pattern 2: flow-verb pairs — allow up to 2 descriptor words between verb and target
    const FLOW_VERBS =
      'feeds?(?:\\s+into)?|' +
      '(?:flows?|pumps?|leads?|routes?|delivers?|sends?|discharges?|pushes?|exits?|leaves?|connects?)(?:\\s+(?:to|into))|' +
      'passes?\\s+(?:through|into|to)|' +
      'is\\s+(?:connected|routed|piped|directed|sent|fed)\\s+to|' +
      'connects?\\s+to';
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        // Allow up to 2 optional descriptor words between the flow verb and the target label
        if (new RegExp('\\b' + ar + '\\s+(?:' + FLOW_VERBS + ')(?:\\s+\\w+){0,2}\\s+' + br + '\\b').test(lower)) {
          addPair(nodes[i].id, nodes[j].id);
        }
      }
    }

    // Pattern 2b: inverse verbs
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        if (new RegExp('\\b' + ar + '\\s+(?:receives|takes)\\s+(?:[\\w]+\\s+){0,3}from\\s+' + OPT2 + br + '\\b').test(lower)) {
          addPair(nodes[j].id, nodes[i].id);
        }
        if (new RegExp('\\b' + ar + '\\s+is\\s+fed\\s+(?:by|from)\\s+' + OPT2 + br + '\\b').test(lower)) {
          addPair(nodes[j].id, nodes[i].id);
        }
        // "enters/goes to A from B" → B→A
        const reEnters = new RegExp('\\b(?:enters?|goes\\s+(?:to|into)|is\\s+(?:fed|supplied)\\s+(?:to|into))\\s+(?:[\\w][\\w-]*\\s+){0,3}' + ar + '\\b[^.]*?\\bfrom\\s+(?:[\\w][\\w-]*\\s+){0,4}' + br + '\\b');
        if (reEnters.test(lower)) addPair(nodes[j].id, nodes[i].id);
      }
    }

    // Pattern 2c: "A [opt] to/through/then [opt] B"
    // Captures middle text so pairs containing "back/recycle" can be excluded.
    // Allows up to 4 optional words after the connector (e.g. "rich amine flash drum").
    const BARE_CONN_CAP = '((?:\\s+\\w+){0,2}\\s+(?:to|through|into|toward|then)\\s+(?:\\w+\\s+){0,4})';
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        const m2c = new RegExp('\\b' + ar + BARE_CONN_CAP + br + '\\b').exec(lower);
        if (m2c && !/recycle|recircul|return(?:ed)?\s+to|\bback\b/i.test(m2c[1])) {
          addPair(nodes[i].id, nodes[j].id);
        }
      }
    }

    if (pairs.length === 0) return [];

    // Remove transitive edges (A→C when A→B→C exists) so fan-in is correct.
    return _removeTransitiveEdges(pairs)
      .map(p => ({ from: p.from, to: p.to, kind: 'stream' }));
  }

  // Build a YMPL doc from a structured-section parse result.
  function _buildDocFromStructured(sourceText, structured) {
    const { equipmentNodes, instrumentNodes, signalChains, proseText, equipmentText } = structured;

    // Primary prose for edge building: text before Equipment:/Instruments: sections.
    // When proseText is empty (Equipment: starts the input), fall back to the Equipment:
    // section text itself — it often contains flow descriptions ("K-201 compresses from V-201").
    const prose    = normalize(proseText || equipmentText || '');
    const instrTagSet = new Set(instrumentNodes.map(n => n.tag));

    // ── Equipment nodes ────────────────────────────────────────────────────────
    // When Equipment: section is present, use it. Also scan prose for any tagged
    // equipment (e.g. R-101) that appears in prose but NOT in Equipment: section.
    // When Equipment: section is absent, extract entirely from prose.
    let baseEquipNodes;
    if (equipmentNodes.length > 0) {
      baseEquipNodes = equipmentNodes.map(n => ({ label: n.tag, kind: n.kind }));
      // Supplement with prose-only ISA-tagged equipment (e.g. R-101 mentioned in
      // prose but not declared in Equipment: section). Only ISA-tag-format labels
      // are added — descriptive terms (Pre-Heater, Cooler etc.) are excluded.
      const knownTags     = new Set(equipmentNodes.map(n => n.tag));
      const ISA_TAG_RE    = /^[A-Za-z]{1,5}-\d{2,4}[A-Za-z]?$/;
      const proseExtracted = deduplicateNodes(extractNodes(prose));
      for (const n of proseExtracted) {
        if (ISA_TAG_RE.test(n.label) && !knownTags.has(n.label) && !instrTagSet.has(n.label)) {
          baseEquipNodes.push({ label: n.label, kind: n.kind });
        }
      }
    } else {
      // No Equipment: section — extract from prose, exclude instrument tags
      const proseExtracted = deduplicateNodes(extractNodes(prose));
      baseEquipNodes = proseExtracted.filter(n => !instrTagSet.has(n.label));
    }

    // ── Instrument nodes ──────────────────────────────────────────────────────
    // Keep instruments in INPUT ORDER (Instruments: list order is meaningful).
    // Instruments referenced in signal chains appear in their input order.
    const orderedInstr = instrumentNodes.map(n => ({ label: n.tag, kind: n.kind }));

    // Assign sequential IDs: equipment first, then instruments.
    const allNodes = [...baseEquipNodes, ...orderedInstr].map((n, idx) => ({
      id: `n${idx + 1}`, label: n.label, kind: n.kind,
    }));

    const byLabel  = new Map(allNodes.map(n => [n.label, n]));
    const eqNodes  = allNodes.filter(n => baseEquipNodes.some(e => e.label === n.label));

    // ── Equipment stream / recycle / bypass edges ──────────────────────────────
    // Try prose-directed pairs first (handles fan-in topology).
    // Fall back to sequential edge building if prose yields no pairs.
    const proseEdges = _extractProseEdges(eqNodes, prose);
    let edges;
    if (proseEdges.length > 0) {
      edges = proseEdges;
      // Also detect bypass / recycle from prose
      const bypassRecycle = buildEdges(eqNodes, prose).filter(e =>
        e.kind === 'bypass' || e.kind === 'recycle'
      );
      for (const e of bypassRecycle) {
        if (!edges.some(x => x.from === e.from && x.to === e.to)) edges.push(e);
      }
    } else {
      // Use reorderNodes to sort equipment into flow order, then sequential edges
      const sortedEq  = reorderNodes(eqNodes, prose)
        .map((n, idx) => ({ ...n, id: eqNodes.find(e => e.label === n.label)?.id || n.id }));
      edges = buildEdges(sortedEq, prose);
    }

    // ── Instrument recycle detection ───────────────────────────────────────────
    // "FCV-101 recycles from ... back to V-101" where FCV-101 is an instrument
    const instrRecycleRe = /([A-Za-z]{1,5}-\d{2,4}[A-Za-z]?)\s+recycles?\s+(?:from\s+[^,.\n]*?)?\s*back\s+to\s+([A-Za-z]{1,5}-\d{2,4}[A-Za-z]?)/gi;
    let irm;
    while ((irm = instrRecycleRe.exec(sourceText)) !== null) {
      const fromTag = irm[1].toUpperCase(), toTag = irm[2].toUpperCase();
      const fromN   = byLabel.get(fromTag), toN = byLabel.get(toTag);
      if (fromN && toN && !edges.some(e => e.from === fromN.id && e.to === toN.id)) {
        edges.push({ from: fromN.id, to: toN.id, kind: 'recycle', label: 'Recycle' });
      }
    }

    // ── Signal edges from chains ──────────────────────────────────────────────
    // Apply description-first kind inference to determine edge semantics.
    const instrKindMap = new Map(allNodes.map(n => [n.label, n.kind]));

    for (const { sourceTag, controllerTag, finalTag, isCascade } of signalChains) {
      const srcN  = byLabel.get(sourceTag);
      const ctrlN = byLabel.get(controllerTag);
      const finN  = byLabel.get(finalTag);

      if (isCascade) {
        // Cascade slave: "MASTER to THIS_CONTROLLER" → MASTER→THIS signal only
        if (srcN && ctrlN && srcN.id !== ctrlN.id) {
          edges.push({ from: srcN.id, to: ctrlN.id, kind: 'signal', label: 'Cascade' });
        }
      } else {
        const srcKind = instrKindMap.get(sourceTag) || '';
        if (srcKind !== 'element' && srcN && ctrlN) {
          // Normal: source → controller
          if (!edges.some(e => e.from === srcN.id && e.to === ctrlN.id)) {
            edges.push({ from: srcN.id, to: ctrlN.id, kind: 'signal' });
          }
        }
        // Controller/switch → final element (always emit when final is a valve)
        if (ctrlN && finN && ctrlN.id !== finN.id) {
          if (!edges.some(e => e.from === ctrlN.id && e.to === finN.id)) {
            edges.push({ from: ctrlN.id, to: finN.id, kind: 'signal' });
          }
        }
      }
    }

    // ── Sequential signal edges between consecutive instruments ───────────────
    // Adds edges that aren't captured by explicit chains.
    // Valid directions:
    //   element    → transmitter          (sensing element → field transmitter)
    //   transmitter/switch/analyzer → controller or valve or switch
    //   controller → valve or controller
    // Does NOT create transmitter→transmitter or other invalid-direction edges.
    // Does NOT add an incoming edge to a valve that already has one from a chain.
    const MEAS_KINDS = new Set(['transmitter','element','switch','analyzer','recorder','indicator']);
    for (let i = 0; i < orderedInstr.length - 1; i++) {
      const cur  = byLabel.get(orderedInstr[i].label);
      const next = byLabel.get(orderedInstr[i + 1].label);
      if (!cur || !next) continue;
      const ck = orderedInstr[i].kind, nk = orderedInstr[i + 1].kind;
      const validDir =
        (ck === 'element' && nk === 'transmitter') ||
        (MEAS_KINDS.has(ck) && ck !== 'element' && (nk === 'controller' || nk === 'valve' || nk === 'switch')) ||
        (ck === 'controller' && (nk === 'valve' || nk === 'controller'));
      if (!validDir) continue;
      if (edges.some(e => e.from === cur.id && e.to === next.id)) continue;  // already present
      // Don't add a second incoming signal edge to a final-element valve
      if ((nk === 'valve' || nk === 'checkvalve') &&
          edges.some(e => e.to === next.id && e.kind === 'signal')) continue;
      edges.push({ from: cur.id, to: next.id, kind: 'signal' });
    }

    // Final signal classification for any remaining stream edges
    edges = classifySignalEdges(allNodes, edges);

    const confidence = allNodes.length >= 3 ? 'high'
                     : allNodes.length === 2 ? 'medium'
                     : allNodes.length === 1 ? 'low' : 'none';
    const title = allNodes.length >= 2
      ? `${allNodes[0].label} to ${allNodes[allNodes.length - 1].label}`
      : allNodes.length === 1 ? allNodes[0].label : 'Unknown Process';

    return {
      schema_version: VERSION,
      id:    slugify(title),
      title,
      nodes: allNodes,
      edges,
      meta: { confidence, source_text: sourceText },
    };
  }

  function parse(text) {
    const sourceText  = String(text || '').trim();

    // ── Structured section mode ─────────────────────────────────────────────
    // Equipment: / Instruments: sections with "- TAG: desc" entries → authoritative
    // nodes. If structured parse returns 0 nodes (prose-style sections without the
    // bullet-point format), fall through to the greedy scanner on the original text.
    const structured = _parseStructuredSections(sourceText);
    if (structured) {
      const doc = _buildDocFromStructured(sourceText, structured);
      if (doc.nodes.length > 0) return doc;
      // Structured parse found keywords but no parseable items → greedy fallback
    }

    // ── Normal greedy text parse ────────────────────────────────────────────
    const normalized  = normalize(sourceText);
    let   nodes       = extractNodes(normalized);

    // Remove bare back-references before reordering (e.g. "reactor" after "tube reactor")
    nodes = deduplicateNodes(nodes);

    // Reorder nodes so flow order matches actual process direction
    nodes = reorderNodes(nodes, normalized);
    // Reassign sequential IDs after reordering (n1 = first in flow, etc.)
    nodes = nodes.map((n, idx) => ({ id: 'n' + (idx + 1), label: n.label, kind: n.kind }));

    // Try prose-directed edges (handles fan-in and non-sequential topology).
    // Use them when they cover most of the equipment span; otherwise fall back
    // to sequential stream edges from buildEdges.
    const proseEdges = _extractProseEdges(nodes, normalized);
    let rawEdges;
    if (proseEdges.length >= Math.max(1, nodes.length - 2)) {
      rawEdges = proseEdges;
      const bypassRecycle = buildEdges(nodes, normalized).filter(
        e => e.kind === 'bypass' || e.kind === 'recycle'
      );
      for (const e of bypassRecycle) {
        if (!rawEdges.some(x => x.from === e.from && x.to === e.to)) rawEdges.push(e);
      }
    } else {
      rawEdges = buildEdges(nodes, normalized);
    }
    const edges = classifySignalEdges(nodes, rawEdges);

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

  // Map first letter of ISA tag prefix → measured-variable word for loop naming.
  const _LOOP_VAR = {
    f: 'Flow', t: 'Temperature', l: 'Level', p: 'Pressure',
    a: 'Analyser', q: 'Quality', d: 'Density', w: 'Weight', z: 'Position',
  };

  function _loopName(label) {
    // Extract ISA prefix (letters before the first "-" or digit).
    const m = label.match(/^([A-Za-z]+)/);
    if (m) {
      const first = m[1][0].toLowerCase();
      if (_LOOP_VAR[first]) return _LOOP_VAR[first] + ' loop';
    }
    return 'Signal loop';
  }

  function toText(doc) {
    const nodes = doc.nodes || [];
    const edges = doc.edges || [];
    if (nodes.length === 0) return 'No process equipment identified.';
    if (nodes.length === 1) return `Process contains ${nodes[0].label} (${kindLabel(nodes[0].kind)}).`;

    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

    // ── 1. Main stream path ───────────────────────────────────────────────────
    const streamEdges    = edges.filter(e => !e.kind || e.kind === 'stream');
    const inDegree       = new Set(streamEdges.map(e => e.to));
    const start          = nodes.find(n => !inDegree.has(n.id)) || nodes[0];
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

    const lines = [path.map(n => n.label).join(' → ') + '.'];

    // ── 2. Recycle edges ──────────────────────────────────────────────────────
    for (const e of edges.filter(e => e.kind === 'recycle')) {
      const f = nodeById[e.from], t = nodeById[e.to];
      if (f && t) lines[0] += ` Recycle from ${f.label} to ${t.label}.`;
    }

    // ── 3. Bypass edges ───────────────────────────────────────────────────────
    for (const e of edges.filter(e => e.kind === 'bypass')) {
      const f = nodeById[e.from], t = nodeById[e.to];
      if (f && t) lines[0] += ` Bypass from ${f.label} to ${t.label}.`;
    }

    // ── 4. Signal chains — one line per loop ─────────────────────────────────
    const signalEdges = edges.filter(e => e.kind === 'signal');
    if (signalEdges.length > 0) {
      // Build adjacency and incoming-count within signal subgraph.
      const sigNext = new Map();   // fromId → toId
      const sigHasIn = new Set();  // nodeIds that have ≥1 incoming signal edge
      for (const e of signalEdges) {
        if (!sigNext.has(e.from)) sigNext.set(e.from, e.to);  // first outgoing only
        sigHasIn.add(e.to);
      }
      // Chain heads: signal-source nodes with no incoming signal edge.
      const sigNodes = new Set([...sigNext.keys(), ...sigHasIn]);
      const heads    = [...sigNodes].filter(id => !sigHasIn.has(id));

      for (const headId of heads) {
        const chain  = [];
        const walked = new Set();
        let id = headId;
        while (id && !walked.has(id)) {
          walked.add(id);
          const n = nodeById[id];
          if (n) chain.push(n.label);
          id = sigNext.get(id);
        }
        if (chain.length < 2) continue;
        const loopLabel = _loopName(chain[0]);
        lines.push(`${loopLabel}: ${chain.join(' → ')}.`);
      }
    }

    return lines.join('\n');
  }

  function kindLabel(k) {
    return (k || 'unknown').replace(/_/g, ' ');
  }

  // ─── TO SVG ────────────────────────────────────────────────────────────────

  const COLORS = {
    // ── Process equipment ─────────────────────────────────────────────────────
    column:         { bg: '#fff', border: '#2563eb', text: '#1e3a5f' },
    separator:      { bg: '#fff', border: '#0284c7', text: '#0c4a6e' },
    heat_exchanger: { bg: '#fff', border: '#16a34a', text: '#14532d' },
    absorber:       { bg: '#fff', border: '#0891b2', text: '#164e63' },
    reactor:        { bg: '#fff', border: '#7c3aed', text: '#3b0764' },
    adsorption:     { bg: '#fff', border: '#a21caf', text: '#4a044e' },
    pump:           { bg: '#fff', border: '#9333ea', text: '#3b0764' },
    compressor:     { bg: '#fff', border: '#d97706', text: '#78350f' },
    valve:          { bg: '#fff', border: '#dc2626', text: '#7f1d1d' },
    relief:         { bg: '#fff', border: '#dc2626', text: '#7f1d1d' },
    vessel:         { bg: '#fff', border: '#2563eb', text: '#1e3a5f' },
    meter:          { bg: '#fff', border: '#475569', text: '#1e293b' },
    // ── ISA 5.1 Instrumentation ───────────────────────────────────────────────
    transmitter:    { bg: '#fff', border: '#0369a1', text: '#0c4a6e' },
    controller:     { bg: '#fff', border: '#0e7490', text: '#164e63' },
    indicator:      { bg: '#fff', border: '#4b5563', text: '#1f2937' },
    recorder:       { bg: '#fff', border: '#6b7280', text: '#374151' },
    switch:         { bg: '#fff', border: '#b91c1c', text: '#7f1d1d' },
    analyzer:       { bg: '#fff', border: '#7c3aed', text: '#4c1d95' },
    element:        { bg: '#fff', border: '#6b7280', text: '#374151' },
    unknown:        { bg: '#fff', border: '#94a3b8', text: '#475569' },
  };

  // Instrument kinds — edges between these (or instrument → valve) become 'signal'
  const _INSTR_KINDS = new Set([
    'transmitter', 'controller', 'indicator', 'recorder', 'switch', 'analyzer', 'element', 'meter',
  ]);

  const NW = 80, NH = 72, HGAP = 48, PAD = 28, TOP_PAD = 36;

  // ── ISA 5.1 / ISO 10628 P&ID symbol library ──────────────────────────────
  // cx, cy = centre of symbol area; stroke = equipment colour; label = node label.
  // Edge connection points remain at (x, y+NH/2) left and (x+NW, y+NH/2) right.
  function _pidSymbol(kind, cx, cy, stroke, label) {
    switch (kind) {

      case 'pump': {
        // Centrifugal pump: circle casing + filled impeller triangle
        const r = 18;
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="1.8"/>
<polygon points="${cx-11},${cy+13} ${cx-11},${cy-13} ${cx+15},${cy}" fill="${stroke}" opacity="0.9"/>`;
      }

      case 'compressor': {
        // Compressor: circle + open triangle + centre shaft line
        const r = 18;
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="1.8"/>
<polygon points="${cx-11},${cy+13} ${cx-11},${cy-13} ${cx+15},${cy}" fill="none" stroke="${stroke}" stroke-width="1.4"/>
<line x1="${cx-11}" y1="${cy}" x2="${cx+15}" y2="${cy}" stroke="${stroke}" stroke-width="1.2"/>`;
      }

      case 'valve':
      case 'checkvalve': {
        // Globe/control valve: bowtie + actuator circle on top
        const hw = 15, hh = 11;
        return `<polygon points="${cx},${cy} ${cx-hw},${cy-hh} ${cx-hw},${cy+hh}" fill="${stroke}" stroke="${stroke}" stroke-width="1.2"/>
<polygon points="${cx},${cy} ${cx+hw},${cy-hh} ${cx+hw},${cy+hh}" fill="${stroke}" stroke="${stroke}" stroke-width="1.2"/>
<line x1="${cx}" y1="${cy-hh}" x2="${cx}" y2="${cy-hh-7}" stroke="${stroke}" stroke-width="1.5"/>
<circle cx="${cx}" cy="${cy-hh-13}" r="6" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>`;
      }

      case 'relief': {
        // PSV / relief valve: open triangle pointing up
        const hw2 = 14, hh2 = 14;
        return `<polygon points="${cx},${cy-hh2} ${cx-hw2},${cy+hh2} ${cx+hw2},${cy+hh2}" fill="none" stroke="${stroke}" stroke-width="1.8"/>
<line x1="${cx}" y1="${cy-hh2}" x2="${cx}" y2="${cy-hh2-8}" stroke="${stroke}" stroke-width="1.5"/>`;
      }

      case 'vessel': {
        // Vertical pressure vessel / drum: cylinder profile
        const rw = 16, rh = 21, ery = 5;
        return `<rect x="${cx-rw}" y="${cy-rh+ery}" width="${rw*2}" height="${(rh-ery)*2}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<ellipse cx="${cx}" cy="${cy-rh+ery}" rx="${rw}" ry="${ery}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<ellipse cx="${cx}" cy="${cy+rh-ery}" rx="${rw}" ry="${ery}" fill="#dbeafe" stroke="${stroke}" stroke-width="1.5"/>`;
      }

      case 'separator': {
        // Horizontal two-phase separator: horizontal cylinder + interface line
        const rw = 26, rh = 13, erx = 7;
        return `<rect x="${cx-rw+erx}" y="${cy-rh}" width="${(rw-erx)*2}" height="${rh*2}" fill="#fff" stroke="none"/>
<ellipse cx="${cx-rw+erx}" cy="${cy}" rx="${erx}" ry="${rh}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<ellipse cx="${cx+rw-erx}" cy="${cy}" rx="${erx}" ry="${rh}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<line x1="${cx-rw+erx}" y1="${cy-rh}" x2="${cx+rw-erx}" y2="${cy-rh}" stroke="${stroke}" stroke-width="1.5"/>
<line x1="${cx-rw+erx}" y1="${cy+rh}" x2="${cx+rw-erx}" y2="${cy+rh}" stroke="${stroke}" stroke-width="1.5"/>
<line x1="${cx-rw+erx+3}" y1="${cy+4}" x2="${cx+rw-erx-3}" y2="${cy+4}" stroke="${stroke}" stroke-width="1" stroke-dasharray="3,2" opacity="0.65"/>`;
      }

      case 'column': {
        // Distillation column / tower: tall narrow cylinder with tray lines
        const rw = 13, rh = 26, ery = 4;
        return `<rect x="${cx-rw}" y="${cy-rh+ery}" width="${rw*2}" height="${(rh-ery)*2}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<ellipse cx="${cx}" cy="${cy-rh+ery}" rx="${rw}" ry="${ery}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<ellipse cx="${cx}" cy="${cy+rh-ery}" rx="${rw}" ry="${ery}" fill="#dbeafe" stroke="${stroke}" stroke-width="1.5"/>
<line x1="${cx-rw}" y1="${cy-10}" x2="${cx+rw}" y2="${cy-10}" stroke="${stroke}" stroke-width="0.9" opacity="0.5"/>
<line x1="${cx-rw}" y1="${cy}" x2="${cx+rw}" y2="${cy}" stroke="${stroke}" stroke-width="0.9" opacity="0.5"/>
<line x1="${cx-rw}" y1="${cy+10}" x2="${cx+rw}" y2="${cy+10}" stroke="${stroke}" stroke-width="0.9" opacity="0.5"/>`;
      }

      case 'reactor': {
        // CSTR reactor: circle + agitator shaft + impeller arms
        const r = 18;
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="1.8"/>
<line x1="${cx}" y1="${cy-12}" x2="${cx}" y2="${cy+10}" stroke="${stroke}" stroke-width="1.5"/>
<line x1="${cx-9}" y1="${cy+6}" x2="${cx+9}" y2="${cy+6}" stroke="${stroke}" stroke-width="1.8"/>
<line x1="${cx-7}" y1="${cy-1}" x2="${cx+7}" y2="${cy-1}" stroke="${stroke}" stroke-width="1.4"/>`;
      }

      case 'heat_exchanger': {
        // Shell-and-tube exchanger: outer shell + two tube-bundle U-bends
        const rw = 26, rh = 13;
        return `<rect x="${cx-rw}" y="${cy-rh}" width="${rw*2}" height="${rh*2}" fill="#fff" stroke="${stroke}" stroke-width="1.5" rx="3"/>
<line x1="${cx-rw+7}" y1="${cy-rh}" x2="${cx-rw+7}" y2="${cy+rh}" stroke="${stroke}" stroke-width="1" opacity="0.45"/>
<line x1="${cx+rw-7}" y1="${cy-rh}" x2="${cx+rw-7}" y2="${cy+rh}" stroke="${stroke}" stroke-width="1" opacity="0.45"/>
<path d="M${cx-14},${cy-rh+2} L${cx-14},${cy+1} Q${cx},${cy+1} ${cx},${cy+rh-2}" fill="none" stroke="${stroke}" stroke-width="1.4"/>
<path d="M${cx+14},${cy-rh+2} L${cx+14},${cy+1} Q${cx},${cy+1} ${cx},${cy+rh-2}" fill="none" stroke="${stroke}" stroke-width="1.4"/>`;
      }

      case 'absorber': {
        // Absorber/stripper: column with packing hatching
        const rw = 13, rh = 26, ery = 4;
        return `<rect x="${cx-rw}" y="${cy-rh+ery}" width="${rw*2}" height="${(rh-ery)*2}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<ellipse cx="${cx}" cy="${cy-rh+ery}" rx="${rw}" ry="${ery}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<ellipse cx="${cx}" cy="${cy+rh-ery}" rx="${rw}" ry="${ery}" fill="#cffafe" stroke="${stroke}" stroke-width="1.5"/>
<line x1="${cx-rw}" y1="${cy-12}" x2="${cx+rw}" y2="${cy-6}" stroke="${stroke}" stroke-width="0.9" opacity="0.5"/>
<line x1="${cx-rw}" y1="${cy-2}" x2="${cx+rw}" y2="${cy+4}" stroke="${stroke}" stroke-width="0.9" opacity="0.5"/>
<line x1="${cx-rw}" y1="${cy+8}" x2="${cx+rw}" y2="${cy+14}" stroke="${stroke}" stroke-width="0.9" opacity="0.5"/>`;
      }

      case 'filter': {
        // Filter/strainer: rectangle with diagonal screen lines
        const rw = 20, rh = 13;
        return `<rect x="${cx-rw}" y="${cy-rh}" width="${rw*2}" height="${rh*2}" fill="#fff" stroke="${stroke}" stroke-width="1.5" rx="2"/>
<line x1="${cx-16}" y1="${cy-rh}" x2="${cx-rw}" y2="${cy+2}" stroke="${stroke}" stroke-width="1" opacity="0.6"/>
<line x1="${cx-6}" y1="${cy-rh}" x2="${cx+6}" y2="${cy+rh}" stroke="${stroke}" stroke-width="1" opacity="0.6"/>
<line x1="${cx+6}" y1="${cy-rh}" x2="${cx+rw}" y2="${cy+2}" stroke="${stroke}" stroke-width="1" opacity="0.6"/>`;
      }

      case 'meter': {
        // Flow meter: circle + diagonal flow arrow
        const r = 16;
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<line x1="${cx-8}" y1="${cy+8}" x2="${cx+8}" y2="${cy-8}" stroke="${stroke}" stroke-width="1.8"/>
<polygon points="${cx+8},${cy-8} ${cx+3},${cy-8} ${cx+8},${cy-3}" fill="${stroke}"/>`;
      }

      case 'relief': {
        // Safety/relief valve: filled triangle + base bar + tail
        return `<polygon points="${cx},${cy-17} ${cx-13},${cy+7} ${cx+13},${cy+7}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<line x1="${cx-15}" y1="${cy+7}" x2="${cx+15}" y2="${cy+7}" stroke="${stroke}" stroke-width="2"/>
<line x1="${cx}" y1="${cy+7}" x2="${cx}" y2="${cy+16}" stroke="${stroke}" stroke-width="1.5"/>`;
      }

      case 'adsorption': {
        // PSA/TSA bed: rectangle + wave (membrane/bed symbol)
        const rw = 20, rh = 14;
        return `<rect x="${cx-rw}" y="${cy-rh}" width="${rw*2}" height="${rh*2}" fill="#fff" stroke="${stroke}" stroke-width="1.5" rx="2"/>
<path d="M${cx-14},${cy} Q${cx-7},${cy-8} ${cx},${cy} Q${cx+7},${cy+8} ${cx+14},${cy}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
      }

      case 'transmitter': {
        // ISA 5.1 field instrument bubble — plain circle
        const r = 18;
        const { top, bot } = _bubbleTag(kind, cx, cy, stroke, r, label);
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="1.8"/>${top}${bot}`;
      }

      case 'controller': {
        // ISA 5.1 panel / DCS instrument — circle with single horizontal bar
        const r = 18;
        const { top, bot } = _bubbleTag(kind, cx, cy, stroke, r, label);
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="1.8"/>
<line x1="${cx-r}" y1="${cy}" x2="${cx+r}" y2="${cy}" stroke="${stroke}" stroke-width="1.2"/>${top}${bot}`;
      }

      case 'recorder': {
        // ISA 5.1 recorder — circle with two horizontal bars
        const r = 18;
        const { top, bot } = _bubbleTag(kind, cx, cy, stroke, r, label);
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="1.8"/>
<line x1="${cx-r+3}" y1="${cy-5}" x2="${cx+r-3}" y2="${cy-5}" stroke="${stroke}" stroke-width="1"/>
<line x1="${cx-r+3}" y1="${cy+5}" x2="${cx+r-3}" y2="${cy+5}" stroke="${stroke}" stroke-width="1"/>${top}${bot}`;
      }

      case 'indicator': {
        // ISA 5.1 local indicator — plain circle, smaller
        const r = 16;
        const { top, bot } = _bubbleTag(kind, cx, cy, stroke, r, label);
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>${top}${bot}`;
      }

      case 'switch': {
        // ISA 5.1 switch — circle with diagonal line
        const r = 16;
        const off = Math.round(r * 0.65);
        const { top, bot } = _bubbleTag(kind, cx, cy, stroke, r, label);
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
<line x1="${cx-off}" y1="${cy+off}" x2="${cx+off}" y2="${cy-off}" stroke="${stroke}" stroke-width="1.5"/>${top}${bot}`;
      }

      case 'analyzer': {
        // ISA 5.1 analyzer — diamond (rotated square) with circle inside
        const hw = 18, hh = 18;
        const r2 = 7;
        const { top, bot } = _bubbleTag(kind, cx, cy, stroke, hw, label);
        return `<polygon points="${cx},${cy-hh} ${cx+hw},${cy} ${cx},${cy+hh} ${cx-hw},${cy}" fill="#fff" stroke="${stroke}" stroke-width="1.8"/>
<circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="${stroke}" stroke-width="1.2"/>${top}${bot}`;
      }

      case 'element': {
        // ISA 5.1 primary element — small filled diamond
        const hw = 10, hh = 10;
        const { top, bot } = _bubbleTag(kind, cx, cy, stroke, hw, label);
        return `<polygon points="${cx},${cy-hh} ${cx+hw},${cy} ${cx},${cy+hh} ${cx-hw},${cy}" fill="${stroke}" stroke="${stroke}" stroke-width="1.2" opacity="0.85"/>${top}${bot}`;
      }

      default: {
        // Generic equipment: rounded rectangle
        return `<rect x="${cx-22}" y="${cy-14}" width="44" height="28" rx="4" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>`;
      }
    }
  }

  // Extract tag letters and number from a label for display inside ISA bubble.
  // "FT-101" → letters="FT", number="101"
  // "Flow Transmitter" → letters="FT" (from kind abbr), number=""
  function _bubbleTag(kind, cx, cy, stroke, r, label) {
    const KIND_ABBR = {
      transmitter: 'T', controller: 'C', indicator: 'I',
      recorder: 'R', switch: 'S', analyzer: 'A', element: 'E', meter: 'M',
    };
    let letters = KIND_ABBR[kind] || '';
    let number  = '';
    if (label) {
      const m = String(label).match(/^([A-Za-z]{1,5})-?(\d+[A-Za-z]?)?/);
      if (m && m[1] && m[1].length <= 5) { letters = m[1].toUpperCase(); number = m[2] || ''; }
    }
    const top = letters
      ? `<text x="${cx}" y="${cy - (number ? 4 : 1)}" fill="${stroke}" font-size="9" font-weight="700" font-family="monospace,system-ui" text-anchor="middle">${esc(letters)}</text>`
      : '';
    const bot = number
      ? `<text x="${cx}" y="${cy + 7}" fill="${stroke}" font-size="8" font-family="monospace,system-ui" text-anchor="middle">${esc(number)}</text>`
      : '';
    return { top, bot };
  }

  function toSvg(doc) {
    const nodes = doc.nodes || [];
    const edges = doc.edges || [];

    if (nodes.length === 0) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80">
        <rect width="320" height="80" fill="#f8fafc" rx="8"/>
        <text x="160" y="45" fill="#475569" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle">No equipment identified</text>
      </svg>`;
    }

    // ── 1. Rank each node = longest path from any source (column position) ──
    const rank = {};
    nodes.forEach(n => rank[n.id] = 0);
    // Only stream/bypass edges define rank — recycle edges are back-edges, exclude them
    const rankEdges = edges.filter(e => e.kind !== 'recycle');
    for (let pass = 0; pass < nodes.length; pass++) {
      for (const e of rankEdges) {
        if (rank[e.from] !== undefined && rank[e.to] !== undefined) {
          if (rank[e.from] + 1 > rank[e.to]) rank[e.to] = rank[e.from] + 1;
        }
      }
    }

    // ── 2. Group nodes by rank (column) ──
    const byRank = {};
    nodes.forEach(n => {
      const r = rank[n.id] || 0;
      (byRank[r] = byRank[r] || []).push(n);
    });
    const ranks       = Object.keys(byRank).map(Number).sort((a, b) => a - b);
    const maxPerRank  = Math.max(...ranks.map(r => byRank[r].length));

    // ── 3. Assign x/y — each rank is a column, nodes stack vertically centred ──
    const COL_STEP = NW + HGAP;
    const ROW_STEP = NH + 32;
    const midY     = TOP_PAD + (maxPerRank - 1) * ROW_STEP / 2;

    const pos = {};
    ranks.forEach(r => {
      const col  = byRank[r];
      const colH = (col.length - 1) * ROW_STEP;
      col.forEach((n, i) => {
        pos[n.id] = {
          x: PAD + r * COL_STEP,
          y: midY - colH / 2 + i * ROW_STEP,
        };
      });
    });

    const svgW = PAD * 2 + ranks.length * COL_STEP - HGAP;
    const svgH = TOP_PAD + maxPerRank * ROW_STEP - 32 + PAD;

    // ── 4. Draw edges ──
    let edgeSvg = '';
    for (const e of edges) {
      const fp = pos[e.from], tp = pos[e.to];
      if (!fp || !tp) continue;

      const x1  = fp.x + NW,  y1 = fp.y + NH / 2;
      const x2  = tp.x,       y2 = tp.y + NH / 2;
      const cpX = (x2 - x1) * 0.42;   // bezier handle offset

      if (!e.kind || e.kind === 'stream') {
        if (Math.abs(y1 - y2) < 2) {
          edgeSvg += `<line x1="${x1}" y1="${y1}" x2="${x2-1}" y2="${y2}" stroke="#64748b" stroke-width="2" marker-end="url(#arr)"/>`;
        } else {
          edgeSvg += `<path d="M${x1},${y1} C${x1+cpX},${y1} ${x2-cpX},${y2} ${x2},${y2}" fill="none" stroke="#64748b" stroke-width="2" marker-end="url(#arr)"/>`;
        }
      } else if (e.kind === 'bypass') {
        const ay = Math.min(fp.y, tp.y) - 24;
        const mx = (x1 + x2) / 2;
        edgeSvg += `<path d="M${x1},${y1} C${x1+cpX},${ay} ${x2-cpX},${ay} ${x2},${y2}" fill="none" stroke="#ffa657" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr-b)"/>`;
        if (e.label) edgeSvg += `<text x="${mx}" y="${ay-4}" fill="#ffa657" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">${esc(e.label)}</text>`;
      } else if (e.kind === 'signal') {
        // ISA instrument signal line — thin dashed, blue
        edgeSvg += `<path d="M${x1},${y1} C${x1+cpX},${y1} ${x2-cpX},${y2} ${x2},${y2}" fill="none" stroke="#0369a1" stroke-width="1.1" stroke-dasharray="3,3" marker-end="url(#arr-s)"/>`;
      } else if (e.kind === 'recycle') {
        const ay = Math.max(fp.y, tp.y) + NH + 18;
        const mx = (fp.x + NW / 2 + tp.x + NW / 2) / 2;
        edgeSvg += `<path d="M${fp.x+NW/2},${fp.y+NH} C${fp.x+NW/2},${ay} ${tp.x+NW/2},${ay} ${tp.x+NW/2},${tp.y+NH}" fill="none" stroke="#3fb950" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr-r)"/>`;
        if (e.label) edgeSvg += `<text x="${mx}" y="${ay+13}" fill="#3fb950" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">${esc(e.label)}</text>`;
      }
    }

    // ── 5. Draw nodes (ISA 5.1 / ISO 10628 P&ID symbols) ──
    let nodeSvg = '';
    for (const n of nodes) {
      const p = pos[n.id];
      if (!p) continue;
      const c   = COLORS[n.kind] || COLORS.unknown;
      const cx      = p.x + NW / 2;
      const cy      = p.y + NH / 2 - 6;   // symbol centre, shifted up to leave label room
      const lby     = p.y + NH - 6;        // label baseline
      // Instrument bubbles carry the tag inside — only show external label for process equipment
      const isInstr = _INSTR_KINDS.has(n.kind);
      const lines   = isInstr ? [] : wrapText(n.label, 12);
      nodeSvg += `<g>
  ${_pidSymbol(n.kind, cx, cy, c.border, n.label)}
  ${lines.map((l, li) => `<text x="${cx}" y="${lby - (lines.length-1-li)*11}" fill="${c.text}" font-size="10" font-weight="600" font-family="system-ui,sans-serif" text-anchor="middle">${esc(l)}</text>`).join('\n  ')}
</g>`;
    }

    const titleSvg = doc.title
      ? `<text x="${svgW/2}" y="18" fill="#475569" font-size="11" font-weight="600" font-family="system-ui,sans-serif" text-anchor="middle" letter-spacing="0.04em">${esc(doc.title)}</text>`
      : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
<defs>
  <marker id="arr"   markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill="#64748b"/></marker>
  <marker id="arr-b" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill="#ffa657"/></marker>
  <marker id="arr-r" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill="#3fb950"/></marker>
  <marker id="arr-s" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto"><polygon points="0 0,6 2.5,0 5" fill="#0369a1"/></marker>
</defs>
<rect width="${svgW}" height="${svgH}" fill="#f8fafc" rx="8"/>
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

    return w;
  }

  // ─── MERMAID OUTPUT ────────────────────────────────────────────────────────

  // Node shape per kind — encodes equipment type symbolically in plain text.
  const _MERMAID_SHAPE = {
    // ── Process equipment ─────────────────────────────────────────────────────
    valve:          { open: '([',  close: '])' },
    checkvalve:     { open: '([',  close: '])' },
    reactor:        { open: '{{',  close: '}}' },
    column:         { open: '[[',  close: ']]' },
    separator:      { open: '[(',  close: ')]' },
    vessel:         { open: '[(',  close: ')]' },
    heat_exchanger: { open: '>',   close: ']'  },
    compressor:     { open: '[/',  close: '/]' },
    pump:           { open: '[\\', close: '/]' },
    meter:          { open: '[|',  close: '|]' },
    filter:         { open: '[/',  close: '/]' },
    relief:         { open: '/[',  close: ']/' },
    // ── ISA 5.1 Instruments — all use circle notation ─────────────────────────
    transmitter:    { open: '((',  close: '))' },
    controller:     { open: '((',  close: '))' },
    indicator:      { open: '((',  close: '))' },
    recorder:       { open: '((',  close: '))' },
    switch:         { open: '((',  close: '))' },
    analyzer:       { open: '{',   close: '}'  },
    element:        { open: '[(',  close: ')]' },
  };

  function toMermaid(doc) {
    const lines = ['flowchart LR'];
    const nodes = doc.nodes || [];
    const edges = doc.edges || [];

    nodes.forEach(n => {
      const shape = _MERMAID_SHAPE[n.kind] || { open: '[', close: ']' };
      const safeLabel = n.label.replace(/"/g, "'");
      lines.push(`  ${n.id}${shape.open}"${safeLabel}"${shape.close}:::${n.kind || 'unknown'}`);
    });

    edges.forEach(e => {
      const arrow = e.kind === 'bypass'  ? '-. Bypass .->'  :
                    e.kind === 'recycle' ? '-- Recycle -->' :
                    e.kind === 'signal'  ? '-. Signal .->': '-->';
      lines.push(`  ${e.from} ${arrow} ${e.to}`);
    });

    return lines.join('\n');
  }

  // ─── SYNC RENDER (shared by render and renderAsync) ───────────────────────

  function _render(input) {
    const str    = String(input || '').trim();
    const isYml  = /^schema_version:|^---/.test(str);
    const doc    = isYml ? fromYaml(str) : parse(str);
    // Warnings only make sense for text input (not hand-authored YAML)
    const warnings = isYml ? [] : checkWarnings(doc.nodes, doc.edges, str);
    return { doc, yaml: toYaml(doc), svg: toSvg(doc), text: toText(doc), mermaid: toMermaid(doc), warnings };
  }

  // ─── LLM FALLBACK (Tier 3) ─────────────────────────────────────────────────
  // Used by renderAsync when Tier 1 returns confidence 'low' or 'none'.
  //
  // Supported providers:
  //   { provider: 'ollama', model: 'llama3.2:1b', url: 'http://localhost:11434' }
  //   { provider: 'haiku',  model: 'claude-haiku-4-5-20251001', apiKey: 'sk-ant-...' }
  //
  // Both require the fetch API (Node.js 18+ or browser).

  // Equipment vocabulary for LLM prompt — matches KINDS above.
  // Shared by both Haiku and Ollama via _LLM_SYSTEM.
  const _VOCAB = [
    'column       : fractionator, atmospheric/vacuum/pressurized column, splitter, azeotropic column,',
    '               reactive column, pre-fractionator, de-ethanizer, de-propanizer, de-butanizer',
    'separator    : flash drum, decanter, two/three-phase separator, knockout drum,',
    '               flare knockout drum, scrubber, slug catcher',
    'heat_exchanger: shell-and-tube, plate, air-cooled (fin-fan), double-pipe (hairpin),',
    '               feed-effluent exchanger, waste heat boiler, fired heater, furnace,',
    '               reboiler (kettle/thermosiphon/forced-circulation), condenser (total/partial/trim),',
    '               evaporator, feed vaporizer, cooler, chiller, heater, pre-heater, intercooler',
    'absorber     : absorber, stripper, liquid-liquid extractor',
    'reactor      : CSTR, jacketed CSTR, Gibbs reactor, plug flow reactor (PFR), tubular reactor',
    'adsorption   : PSA bed, TSA bed, membrane separator, crystallizer',
    'pump         : centrifugal, gear, diaphragm, metering, canned motor, multistage,',
    '               reflux pump, charge pump, duty pump, standby pump',
    'compressor   : centrifugal compressor, reciprocating compressor',
    'valve        : control valve (globe/rotary/butterfly/three-way), gate valve, ball valve,',
    '               anti-surge valve — use this kind for any named bypass valve (e.g. CV-101B)',
    'vessel       : surge drum, buffer vessel, blowdown drum, reflux drum, overhead accumulator,',
    '               atmospheric/fixed-roof/floating-roof tank, day tank, slop tank, hot well, sump',
    // §1 Measurement & Signal Fundamentals
    'transmitter  : FT/PT/TT/LT/AT/DT — field-mounted, outputs 4–20 mA / HART / digital signal;',
    '               synonyms: DP transmitter, differential pressure transmitter, delta-P transmitter,',
    '               radar level transmitter, GWR transmitter, guided wave radar transmitter,',
    '               displacer transmitter, hydrostatic level transmitter, interface level transmitter,',
    '               vibration transmitter, speed transmitter, density transmitter',
    // §2 Flow measurement
    'meter        : coriolis mass flowmeter (only true mass flow), magnetic flowmeter (magmeter,',
    '               electromagnetic flowmeter — needs conductive fluid ≥5 µS/cm), vortex flowmeter',
    '               (vortex shedding meter, Strouhal meter — standard for steam), transit-time',
    '               ultrasonic (clamp-on, time-of-flight), positive displacement meter (PD meter,',
    '               oval gear meter — best for viscous liquids), turbine meter, flow meter',
    'element      : orifice plate (square-edge orifice, DP orifice, restriction plate),',
    '               averaging pitot tube (Annubar — Emerson trade name, multi-port pitot),',
    '               venturi tube, venturi nozzle, flow nozzle, pitot tube, restriction orifice,',
    '               flow element (FE tag); also: thermocouple, RTD (PT100, Pt1000, resistance',
    '               temperature detector, resistance thermometer, PRT), thermowell (protection tube,',
    '               thermometer well), temperature element (TE tag), pressure element (PE tag)',
    // §3 Level measurement
    '               GWR = guided wave radar = TDR; NCR = non-contacting radar = free-space radar;',
    '               displacer (buoyancy transmitter — do NOT confuse with float switch)',
    // §4 Pressure measurement
    'indicator    : FI/PI/TI/LI/FG/PG/LG — local read-out, no signal output;',
    '               synonyms: pressure gauge, Bourdon gauge, Bourdon tube, dial gauge, local gauge,',
    '               mechanical gauge, thermometer (local), level gauge, sight glass, gauge glass,',
    '               level bridle; flow indicator, pressure indicator, temperature indicator',
    // §5 Temperature
    '               RTD = resistance temperature detector = PT100 = Pt1000 = PRT;',
    '               thermocouple (TC) synonyms: thermoelectric sensor, Seebeck element;',
    '               thermowell synonyms: protection tube, thermometer well, instrument well',
    // §6 Process control
    'controller   : FIC/PIC/TIC/LIC/AIC — DCS/panel, receives PV, outputs CO to final element;',
    '               synonyms: flow indicating controller, pressure indicating controller,',
    '               temperature indicating controller, level indicating controller,',
    '               cascade controller (master-slave, outer-inner loop),',
    '               split-range controller (split range, dual valve, sequenced valve),',
    '               feedforward controller (disturbance compensation, anticipative control),',
    '               override controller (select control, high select / low select, auctioneering),',
    '               ratio controller, flow ratio controller, PID controller, controller',
    'recorder     : FR/PR/TR/LR — chart recorder, data recorder, recorder',
    // §7 Control valves
    'valve        : control valve (globe/rotary/butterfly/three-way), gate valve, ball valve,',
    '               anti-surge valve, non-return valve, check valve, swing check, NRV;',
    '               Fail Open (FO) = air-to-close (ATC); Fail Closed (FC) = air-to-open (ATO)',
    // §8 Safety
    'switch       : FS/PS/TS/LS + H/L/HH/LL — trip/shutdown switches;',
    '               synonyms: pressure switch high (PSH), pressure switch low (PSL),',
    '               level switch high high (LSHH), level switch low low (LSLL),',
    '               flow switch, temperature switch, safety shutdown switch, trip switch',
    'analyzer     : gas chromatograph (online GC), pH analyzer (pH meter, pH probe),',
    '               oxygen analyzer (O2 analyzer), CO2 analyzer, moisture analyzer,',
    '               gas analyzer, online analyzer, quality transmitter (QT)',
  ].join('\n');

  const _LLM_SYSTEM = [
    'You are a process engineering assistant that extracts equipment and flow connections from text.',
    'You output ONLY valid YAML. No explanation. No markdown fences. No prose. Just YAML.',
    '',
    'YMPL 1.0 schema:',
    '  schema_version: ympl-1.0',
    '  id: <slug>',
    '  title: <title>',
    '  nodes:',
    '    - id: n1',
    '      label: <ISA tag or equipment name>',
    '      kind: <column|separator|heat_exchanger|absorber|reactor|adsorption|pump|compressor|valve|vessel|meter|transmitter|controller|indicator|recorder|switch|analyzer|element>',
    '  edges:',
    '    - from: n1',
    '      to: n2',
    '      kind: stream   # stream | bypass | recycle | signal',
    '  # Use kind: signal for instrument→instrument or instrument→valve edges',
    '  meta:',
    '    confidence: <high|medium|low|none>',
    '',
    'Equipment vocabulary (use these kinds):',
    _VOCAB,
    '',
    'Rules:',
    '  - Every piece of equipment is a node. List in flow order, upstream first.',
    '  - Multiple feed streams: each feed is a separate vessel node connecting to a shared header.',
    '  - ISA tags: use the tag as the label (FM-101, H-101, CV-101, CV-101B, R-101, SEP-101, T-101…).',
    '  - Parallel bypass valve (e.g. CV-101B "across" CV-101):',
    '      BOTH valves are separate valve nodes.',
    '      BOTH get a stream edge FROM the upstream node.',
    '      BOTH get a stream edge TO the downstream node.',
    '      Do NOT connect CV-101B → CV-101. Do NOT use kind=bypass for these edges.',
    '  - kind=bypass: only for a conceptual unnamed bypass arc (dashed line, no physical valve).',
    '  - kind=recycle: return/recirculation line back to an upstream node.',
    '  - Tolerate spelling errors.',
    '  - Output the YAML only.',
  ].join('\n');

  // User-facing instruction (appended to the user message, not the system prompt)
  const _LLM_USER_PREFIX = 'Extract equipment and flow connections from the following process description and return YMPL 1.0 YAML only:\n\n';

  async function _callOllama(text, cfg, systemOverride) {
    const base   = (cfg.url   || 'http://localhost:11434').replace(/\/$/, '');
    const model  = cfg.model  || 'qwen2.5:3b-instruct';
    const system = systemOverride || _LLM_SYSTEM;
    const res = await fetch(base + '/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: _LLM_USER_PREFIX + text },
        ],
      }),
    });
    if (!res.ok) throw new Error('Ollama HTTP ' + res.status);
    const data = await res.json();
    return (data.message && data.message.content) || data.response || '';
  }

  async function _callHaiku(text, cfg, system) {
    if (!cfg.apiKey) throw new Error('haiku provider requires apiKey');
    const model    = cfg.model || 'claude-haiku-4-5-20251001';
    // If a proxy URL is provided (e.g. localhost serve.js), send apiKey in body
    // so the proxy can forward it as a header — avoids browser CORS block.
    const endpoint = cfg.url || 'https://api.anthropic.com/v1/messages';
    const useProxy = !!cfg.url;
    const payload  = {
      model,
      max_tokens: 1024,
      system: system || _LLM_SYSTEM,
      messages: [{ role: 'user', content: _LLM_USER_PREFIX + text }],
    };
    if (useProxy) payload.apiKey = cfg.apiKey;
    const headers = { 'Content-Type': 'application/json' };
    if (!useProxy) {
      headers['x-api-key']         = cfg.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }
    const res = await fetch(endpoint, {
      method:  'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error('Haiku HTTP ' + res.status + ': ' + err.slice(0, 200));
    }
    const data = await res.json();
    return (data.content && data.content[0] && data.content[0].text) || '';
  }

  // Build a system prompt that prepends user-saved correction examples as few-shot context.
  // examples: [{ input: string, yaml: string }, ...]  (up to 5, newest-last)
  function _buildSystem(examples) {
    if (!examples || examples.length === 0) return _LLM_SYSTEM;
    const shots = examples.slice(-5).map(function(e) {
      return 'Input: ' + e.input + '\nOutput:\n' + e.yaml;
    }).join('\n\n---\n\n');
    return _LLM_SYSTEM + '\n\nExamples from this user (match their naming style):\n\n' + shots;
  }

  async function _llmExtract(text, cfg, examples) {
    const system = _buildSystem(examples);
    try {
      let raw;
      if      (cfg.provider === 'ollama') raw = await _callOllama(text, cfg, system);
      else if (cfg.provider === 'haiku')  raw = await _callHaiku(text, cfg, system);
      else return null;
      // Strip markdown fences if the LLM added them
      raw = raw.trim().replace(/^```(?:yaml)?\s*/i, '').replace(/\s*```$/, '').trim();
      return raw || null;
    } catch (err) {
      // Surface the actual error so callers can display it
      const e = new Error(err.message || String(err));
      e.llmError = true;
      throw e;
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

    /** doc → Mermaid flowchart string */
    toMermaid,

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

      // LLM-first: try LLM → fall back to Tier 1, surface errors for UI
      try {
        const rawYaml = await _llmExtract(String(input || '').trim(), options.llm, options.llm.examples);
        if (rawYaml) {
          try {
            return { ..._render(rawYaml), usedLlm: true, llmRaw: rawYaml };
          } catch (_) {
            return { ..._render(input), usedLlm: false, llmRaw: rawYaml, llmParseError: true };
          }
        }
        return { ..._render(input), usedLlm: false, llmRaw: null };
      } catch (err) {
        return { ..._render(input), usedLlm: false, llmRaw: null, llmError: err.message };
      }
    },
  };
});
