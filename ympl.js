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
    ],
    // Instrumentation (not in user's 8 categories but needed for process descriptions)
    meter: [
      'coriolis meter', 'mass flow meter', 'vortex meter', 'orifice plate',
      'flow meter', 'flowmeter', 'meter',
    ],
  };

  // ISA tag prefix → kind
  const TAG_KIND = {
    // Columns
    c:   'column',
    // Separators
    v:   'separator', d: 'separator', sep: 'separator',
    // Heat exchangers
    e:   'heat_exchanger',
    // Absorbers
    ab:  'absorber',
    // Reactors
    r:   'reactor',
    // Pumps
    p:   'pump',
    // Compressors
    k:   'compressor',
    // Valves
    cv:  'valve', fv: 'valve', lv: 'valve', pv: 'valve',
    tv:  'valve', hv: 'valve', xv: 'valve', sv: 'valve',
    // Vessels / storage
    t:   'vessel', h: 'vessel',
    // Meters / instruments
    ft:  'meter', fm: 'meter', fi: 'meter', fe: 'meter',
  };

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
    // Drums / separators
    [/\bdrom\b/gi, 'drum'],
    [/\bdrume\b/gi, 'drum'],
    // Coolers / condensers / heat exchangers
    [/\bcoler\b/gi, 'cooler'],
    [/\bcondnser\b/gi, 'condenser'],
    [/\bcondencer\b/gi, 'condenser'],
    [/\bcondnsr\b/gi, 'condenser'],
    [/\bcondser\b/gi, 'condenser'],
    // Reboilers
    [/\brebolier\b/gi, 'reboiler'],
    [/\breboler\b/gi, 'reboiler'],
    [/\brebiler\b/gi, 'reboiler'],
    // Meters
    [/\bflowmetr\b/gi, 'flow meter'],
    [/\bflow\s+mter\b/gi, 'flow meter'],
    [/\bflw\s+meter\b/gi, 'flow meter'],
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
            while (pos < len && /[a-z0-9\-]/.test(lower[pos])) pos++;
            if (pos === (wc === 0 ? i : spans[wc-1].spanEnd + 1)) break;
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
            found.push({ label: titleCase(bestTerm), kind: bestKind, start: i });
            i = bestEnd;
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

    // ── Step 4: Bypass — check ALL nodes as potential bypass targets.
    //   Patterns:  B: "[node] with [a] bypass"
    //              C: "[node] has [a] bypass"
    //              D: "bypass [line] for/on [node]"
    //   To find upstream/downstream: walk the stream edges already built.
    for (const targetNode of mainFlow) {
      const nl = escRe(targetNode.label.toLowerCase());
      const patB = new RegExp('\\b' + nl + '\\s+with\\s+(?:a\\s+|the\\s+)?bypass\\b');
      const patC = new RegExp('\\b' + nl + '\\s+has\\s+(?:a\\s+|the\\s+)?bypass\\b');
      const patD = new RegExp('\\bbypass(?:\\s+(?:line|pipe|loop|valve))?\\s+(?:for|on)\\s+(?:a\\s+|the\\s+)?' + nl + '\\b');
      if (!patB.test(lower) && !patC.test(lower) && !patD.test(lower)) continue;
      // Find the stream-upstream and stream-downstream nodes via built edges
      const upEdge   = edges.find(e => e.to   === targetNode.id && (!e.kind || e.kind === 'stream'));
      const downEdge = edges.find(e => e.from === targetNode.id && (!e.kind || e.kind === 'stream'));
      if (!upEdge || !downEdge) continue;
      if (!edges.some(e => e.from === upEdge.from && e.to === downEdge.to && e.kind === 'bypass')) {
        edges.push({ from: upEdge.from, to: downEdge.to, kind: 'bypass', label: 'Bypass' });
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
    if (nl === ss || nl.includes(ss) || ss.includes(nl)) return true;
    // Fuzzy fallback: allow edit distance ≤ 2 so typo'd anchors in recycle/bypass
    // phrases still resolve to the correct (canonical-label) node.
    if (ss.length >= 5 && Math.abs(nl.length - ss.length) <= 3) {
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

    // ── Pattern 2c: bare "A to B" / "A through B" / "A into B" ─────────────
    // Handles: "flash drum to trim cooler to product tank" (no leading "from").
    // No sink pinning — these are ordering constraints only.
    const BARE_CONN = '\\s+(?:to|through|into|toward)\\s+';
    for (let i = 0; i < nodes.length; i++) {
      const ar = escRe(nodes[i].label.toLowerCase());
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const br = escRe(nodes[j].label.toLowerCase());
        if (new RegExp('\\b' + ar + BARE_CONN + br + '\\b').test(lower)) {
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

  // Remove bare single-word back-references to equipment already found.
  // e.g. "Single Tube Reactor … the reactor effluent" → "Reactor" is removed
  // because it is a bare back-reference to the earlier "Single Tube Reactor".
  // Multi-word labels are never removed — two "Flash Drum" nodes are kept.
  function deduplicateNodes(nodes) {
    const result = [];
    for (const n of nodes) {
      if (n.label.indexOf(' ') === -1) {   // single-word label only
        const lc = n.label.toLowerCase();
        const isDup = result.some(prev =>
          prev.kind === n.kind &&
          prev.label !== n.label &&
          prev.label.toLowerCase().includes(lc)
        );
        if (isDup) continue;
      }
      result.push(n);
    }
    return result;
  }

  function parse(text) {
    const sourceText  = String(text || '').trim();
    const normalized  = normalize(sourceText);
    let   nodes       = extractNodes(normalized);

    // Remove bare back-references before reordering (e.g. "reactor" after "tube reactor")
    nodes = deduplicateNodes(nodes);

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
    column:         { bg: '#fff', border: '#2563eb', text: '#1e3a5f' },
    separator:      { bg: '#fff', border: '#0284c7', text: '#0c4a6e' },
    heat_exchanger: { bg: '#fff', border: '#16a34a', text: '#14532d' },
    absorber:       { bg: '#fff', border: '#0891b2', text: '#164e63' },
    reactor:        { bg: '#fff', border: '#7c3aed', text: '#3b0764' },
    adsorption:     { bg: '#fff', border: '#a21caf', text: '#4a044e' },
    pump:           { bg: '#fff', border: '#9333ea', text: '#3b0764' },
    compressor:     { bg: '#fff', border: '#d97706', text: '#78350f' },
    valve:          { bg: '#fff', border: '#dc2626', text: '#7f1d1d' },
    vessel:         { bg: '#fff', border: '#2563eb', text: '#1e3a5f' },
    meter:          { bg: '#fff', border: '#475569', text: '#1e293b' },
    unknown:        { bg: '#fff', border: '#94a3b8', text: '#475569' },
  };

  const NW = 80, NH = 72, HGAP = 48, PAD = 28, TOP_PAD = 36;

  // ── ISA 5.1 / ISO 10628 P&ID symbol library ──────────────────────────────
  // cx, cy = centre of symbol area; stroke = equipment colour.
  // Edge connection points remain at (x, y+NH/2) left and (x+NW, y+NH/2) right.
  function _pidSymbol(kind, cx, cy, stroke) {
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

      default: {
        // Generic equipment: rounded rectangle
        return `<rect x="${cx-22}" y="${cy-14}" width="44" height="28" rx="4" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>`;
      }
    }
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
      const cx  = p.x + NW / 2;
      const cy  = p.y + NH / 2 - 6;   // symbol centre, shifted up to leave label room
      const lby = p.y + NH - 6;        // label baseline
      const lines = wrapText(n.label, 12);
      nodeSvg += `<g>
  ${_pidSymbol(n.kind, cx, cy, c.border)}
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

  // ─── MERMAID OUTPUT ────────────────────────────────────────────────────────

  // Node shape per kind — encodes equipment type symbolically in plain text.
  const _MERMAID_SHAPE = {
    valve:          { open: '([', close: '])' },
    checkvalve:     { open: '([', close: '])' },
    reactor:        { open: '{{', close: '}}' },
    column:         { open: '[[', close: ']]' },
    separator:      { open: '[(', close: ')]' },
    vessel:         { open: '[(', close: ')]' },
    heat_exchanger: { open: '>', close: ']'   },
    compressor:     { open: '[/', close: '/]' },
    pump:           { open: '[\\', close: '/]'},
    meter:          { open: '[|', close: '|]' },
    filter:         { open: '[/', close: '/]' },
    relief:         { open: '/[', close: ']/' },
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
      const arrow = e.kind === 'bypass' ? '-. Bypass .->' :
                    e.kind === 'recycle' ? '-- Recycle -->' : '-->';
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
    'meter        : flow meter, mass flow meter, coriolis meter, vortex meter, orifice plate',
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
    '      kind: <column|separator|heat_exchanger|absorber|reactor|adsorption|pump|compressor|valve|vessel|meter>',
    '  edges:',
    '    - from: n1',
    '      to: n2',
    '      kind: stream',
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
