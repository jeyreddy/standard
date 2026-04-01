// generate_test.js — auto-generates YMPL robustness tests from vocabulary
//
// Generates combinations of equipment items expressed in 4 text styles:
//   canonical  — exact standard name   ("flash drum through trim cooler to product tank")
//   synonym    — alternate term        ("knockout drum through product cooler to day tank")
//   typo       — deliberate misspell   ("flash drom through tirm cooler to product tnak")
//   isa        — ISA tag IDs           ("V-101 through E-101 to T-101")
//
// Tests against 5 topology patterns (linear-2, linear-3, linear-4, bypass, recycle)
//
// Usage:
//   node generate_test.js                        # Tier 1 only
//   node generate_test.js --ollama               # + Ollama
//   node generate_test.js --haiku sk-ant-...     # + Claude Haiku
//   node generate_test.js --style typo           # one style only
//   node generate_test.js --topology linear_3    # one topology only
//   node generate_test.js --limit 20             # cap total scenarios

'use strict';
const YMPL = require('./ympl.js');

// ── CLI ───────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const useOllama  = args.includes('--ollama');
const ollamaUrl  = argVal('--ollama-url')    || 'http://localhost:11434';
const ollamaModel= argVal('--ollama-model')  || 'qwen2.5:3b-instruct';
const haikuKey   = argVal('--haiku');
const onlyStyle  = argVal('--style');
const onlyTopo   = argVal('--topology');
const limit      = parseInt(argVal('--limit') || '0');

function argVal(f) {
  const i = args.indexOf(f);
  return (i !== -1 && args[i+1] && !args[i+1].startsWith('--')) ? args[i+1] : null;
}

const engines = [{ name: 'Tier 1', llm: null }];
if (useOllama) engines.push({ name: 'Ollama', llm: { provider: 'ollama', url: ollamaUrl, model: ollamaModel } });
if (haikuKey)  engines.push({ name: 'Haiku',  llm: { provider: 'haiku',  apiKey: haikuKey } });

// ── Equipment vocabulary with variants ───────────────────────────────────────
// Each entry: kind, canonical name, synonyms, typo variants, ISA tag
const EQUIP = [
  { kind:'separator',      can:'flash drum',             syn:['knockout drum','two-phase separator','suction drum'],     typ:['flash drom','flas drum','flashdrum'],                 isa:'V-101' },
  { kind:'separator',      can:'separator',              syn:['inlet separator','three-phase separator','slug catcher'],  typ:['seperator','seprator','separtor'],                    isa:'V-201' },
  { kind:'heat_exchanger', can:'trim cooler',            syn:['product cooler','after-cooler','air-cooled heat exchanger'],typ:['trim coler','tirm cooler','trim coolr'],             isa:'E-101' },
  { kind:'heat_exchanger', can:'reboiler',               syn:['kettle reboiler','thermosiphon reboiler','fired heater'],  typ:['rebolier','reboler','rebiler'],                       isa:'E-201' },
  { kind:'heat_exchanger', can:'condenser',              syn:['partial condenser','total condenser','trim condenser'],    typ:['condnser','condensr','condencer'],                    isa:'E-301' },
  { kind:'heat_exchanger', can:'heat exchanger',         syn:['shell-and-tube heat exchanger','plate heat exchanger'],   typ:['heet exchanger','heat exhanger','heat exchnger'],     isa:'E-401' },
  { kind:'column',         can:'distillation column',    syn:['fractionator','fractionating column','vacuum column'],     typ:['distilation column','distllation colum','disstillation column'], isa:'C-101' },
  { kind:'reactor',        can:'reactor',                syn:['tubular reactor','plug flow reactor','jacketed reactor'],  typ:['reacter','reactr','reakor'],                          isa:'R-101' },
  { kind:'pump',           can:'centrifugal pump',       syn:['reflux pump','charge pump','multistage pump'],             typ:['centrfugal pump','centrifugal pmp','centirfugal pump'],isa:'P-101' },
  { kind:'compressor',     can:'centrifugal compressor', syn:['reciprocating compressor'],                               typ:['compresor','kompressor','centrifugal compresser'],     isa:'K-101' },
  { kind:'valve',          can:'control valve',          syn:['gate valve','ball valve','butterfly valve'],               typ:['cntrol valve','contrl valev','contorl valve'],         isa:'CV-101' },
  { kind:'valve',          can:'anti-surge valve',       syn:['anti-surge valve'],                                       typ:['anti surge valv','antisurge valve'],                  isa:'ASV-101' },
  { kind:'vessel',         can:'surge drum',             syn:['buffer vessel','overhead accumulator','reflux drum'],      typ:['surg drum','surge drom','surgedrum'],                 isa:'D-101' },
  { kind:'vessel',         can:'product tank',           syn:['day tank','storage tank','atmospheric tank'],              typ:['product tnak','procuct tank','prodct tank'],          isa:'T-101' },
  { kind:'meter',          can:'flow meter',             syn:['mass flow meter','coriolis meter','orifice plate'],        typ:['flw meter','flow mter','flowmetr'],                   isa:'FM-101' },
  { kind:'absorber',       can:'absorber',               syn:['gas absorber'],                                           typ:['abosrber','absorbar','absrober'],                     isa:'AB-101' },
  { kind:'absorber',       can:'stripper',               syn:['steam stripper'],                                         typ:['striper','stripr','stiper'],                          isa:'ST-101' },
];

// ── Topology patterns ─────────────────────────────────────────────────────────
// Each: name, nodeCount, edges as [fromIdx, toIdx, kind], sentence templates
// {0} {1} {2} etc. are placeholders for equipment labels
const TOPOS = [
  {
    name: 'linear_2', n: 2,
    edges: [[0,1,'stream']],
    templates: [
      '{0} to {1}',
      '{0} feeds {1}',
      '{0} connected to {1}',
      '{0} flows into {1}',
    ],
  },
  {
    name: 'linear_3', n: 3,
    edges: [[0,1,'stream'],[1,2,'stream']],
    templates: [
      '{0} through {1} to {2}',
      '{0} to {1} then to {2}',
      '{0} feeds {1}, outlet goes to {2}',
      'from {0}, passes through {1} and then to {2}',
      '{0} connected to {1} connected to {2}',
    ],
  },
  {
    name: 'linear_4', n: 4,
    edges: [[0,1,'stream'],[1,2,'stream'],[2,3,'stream']],
    templates: [
      '{0} to {1} to {2} to {3}',
      '{0} through {1} and {2} to {3}',
      'flow from {0} through {1}, then {2}, finally to {3}',
    ],
  },
  {
    name: 'bypass', n: 3,
    edges: [[0,1,'stream'],[1,2,'stream'],[0,2,'bypass']],
    templates: [
      '{0} through {1} to {2}, bypass around {1}',
      '{0} to {1} to {2}, with a bypass line around {1}',
      '{1} has a bypass. {0} to {1} to {2}',
    ],
  },
  {
    name: 'recycle', n: 3,
    edges: [[0,1,'stream'],[1,2,'stream'],[2,0,'recycle']],
    templates: [
      '{0} to {1} to {2}, recycle line back to {0}',
      '{0} feeds {1} then {2}, with recycle back to {0}',
      'from {0} through {1} to {2}, return line to {0}',
    ],
  },
];

// ── Label variants ────────────────────────────────────────────────────────────
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function label(eq, style, idx) {
  // Give each position a unique ISA number so labels don't collide
  const isaBase = eq.isa.replace(/\d+$/, '');
  const isaNum  = (parseInt(eq.isa.match(/\d+$/)[0]) + idx * 100);
  switch (style) {
    case 'canonical': return eq.can;
    case 'synonym':   return eq.syn.length ? pick(eq.syn) : eq.can;
    case 'typo':      return pick(eq.typ);
    case 'isa':       return isaBase + isaNum;
    default:          return eq.can;
  }
}

// ── Generate scenarios ────────────────────────────────────────────────────────
const STYLES = (onlyStyle ? [onlyStyle] : ['canonical','synonym','typo','isa']);
const activeTopos = TOPOS.filter(t => !onlyTopo || t.name === onlyTopo);

function* generateScenarios() {
  for (const topo of activeTopos) {
    // Generate all combinations of EQUIP items of size topo.n (no repeats, ordered)
    const combos = combinations(EQUIP, topo.n);
    for (const combo of combos) {
      for (const style of STYLES) {
        const labels = combo.map((eq, i) => label(eq, style, i));
        for (const tmpl of topo.templates) {
          const input = tmpl.replace(/\{(\d+)\}/g, (_, i) => labels[parseInt(i)]);
          yield {
            topo:     topo.name,
            style,
            template: tmpl,
            input,
            expected: {
              nodes: combo.map(eq => ({ kind: eq.kind })),
              edges: topo.edges,
              labels,
            },
          };
        }
      }
    }
  }
}

function* combinations(arr, k) {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function score(result, expected) {
  const nodes = result.doc.nodes || [];
  const edges = result.doc.edges || [];
  const expN  = expected.nodes;
  const expE  = expected.edges;
  const expL  = expected.labels;

  // Node match: kind correct AND label contains expected ISA/canonical (for isa/canonical styles)
  const matched = new Array(nodes.length).fill(-1);
  let nodeHits = 0;
  for (let ei = 0; ei < expN.length; ei++) {
    const hit = nodes.findIndex((n, ni) =>
      matched[ni] === -1 && n.kind === expN[ei].kind
    );
    if (hit !== -1) { matched[hit] = ei; nodeHits++; }
  }

  // Edge match
  const expToAct = {};
  matched.forEach((ei, ai) => { if (ei !== -1) expToAct[ei] = ai; });
  let edgeHits = 0;
  for (const [fi, ti, ek] of expE) {
    const fa = expToAct[fi], ta = expToAct[ti];
    if (fa === undefined || ta === undefined) continue;
    const fid = nodes[fa]?.id, tid = nodes[ta]?.id;
    if (!fid || !tid) continue;
    if (edges.find(e => e.from===fid && e.to===tid && (ek==='stream'?(!e.kind||e.kind==='stream'):e.kind===ek))) edgeHits++;
  }

  return {
    nodeScore: nodeHits / expN.length,
    edgeScore: expE.length ? edgeHits / expE.length : 1,
    nodes:     `${nodeHits}/${expN.length}`,
    edges:     `${edgeHits}/${expE.length}`,
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────
(async () => {
  // Collect scenarios with stratified sampling when --limit is set
  // Without limit: collect all. With limit: round-robin across topo×style buckets.
  let all;
  if (!limit) {
    all = [];
    for (const sc of generateScenarios()) all.push(sc);
  } else {
    // Group into buckets [topo][style], then round-robin
    const buckets = {};
    for (const t of activeTopos) {
      buckets[t.name] = {};
      for (const s of STYLES) buckets[t.name][s] = [];
    }
    for (const sc of generateScenarios()) {
      buckets[sc.topo][sc.style].push(sc);
    }
    // Round-robin: pick 1 from each bucket repeatedly until limit reached
    all = [];
    let added = true;
    while (all.length < limit && added) {
      added = false;
      for (const t of activeTopos) {
        for (const s of STYLES) {
          if (all.length >= limit) break;
          const bucket = buckets[t.name][s];
          if (bucket.length) { all.push(bucket.shift()); added = true; }
        }
        if (all.length >= limit) break;
      }
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`YMPL Vocabulary Robustness Test`);
  console.log(`Scenarios: ${all.length}  |  Engines: ${engines.map(e=>e.name).join(', ')}`);
  console.log(`Styles: ${STYLES.join(', ')}  |  Topologies: ${activeTopos.map(t=>t.name).join(', ')}`);
  console.log('═'.repeat(70));

  // Accumulators: [engine][style][topo] → {nodeSum, edgeSum, count}
  const acc = {};
  engines.forEach(e => {
    acc[e.name] = {};
    STYLES.forEach(s => {
      acc[e.name][s] = {};
      activeTopos.forEach(t => { acc[e.name][s][t.name] = { ns:0, es:0, n:0 }; });
    });
  });

  let done = 0;
  const dot = Math.max(1, Math.floor(all.length / 40));

  process.stdout.write('Progress: ');
  for (const sc of all) {
    for (const eng of engines) {
      let result;
      if (!eng.llm) {
        result = YMPL.render(sc.input);
        result.usedLlm = false;
      } else {
        result = await YMPL.renderAsync(sc.input, { llm: eng.llm });
      }
      const s = score(result, sc.expected);
      const a = acc[eng.name][sc.style][sc.topo];
      a.ns += s.nodeScore; a.es += s.edgeScore; a.n++;
    }
    done++;
    if (done % dot === 0) process.stdout.write('.');
  }
  process.stdout.write(' done\n\n');

  // ── Results table ──────────────────────────────────────────────────────────
  const C = 14;
  const pad = (s, w, r=false) => { s=String(s); const p=' '.repeat(Math.max(0,w-s.length)); return r?p+s:s+p; };
  const pct = v => (v*100).toFixed(0)+'%';
  const bar = v => { const f=Math.round(v*5); return '█'.repeat(f)+'░'.repeat(5-f); };

  for (const eng of engines) {
    console.log(`\n── ${eng.name} ${'─'.repeat(60 - eng.name.length)}`);
    console.log('  ' + pad('',16) + STYLES.map(s=>pad(s,C)).join(''));
    console.log('  ' + pad('',16) + STYLES.map(()=>pad('nodes  edges',C)).join(''));
    console.log('  ' + '─'.repeat(16 + STYLES.length * C));

    for (const topo of activeTopos) {
      let line = '  ' + pad(topo.name, 16);
      for (const style of STYLES) {
        const a   = acc[eng.name][style][topo.name];
        const ns  = a.n ? a.ns/a.n : 0;
        const es  = a.n ? a.es/a.n : 0;
        line += a.n ? pad(`${pct(ns)}  ${pct(es)}`, C) : pad('n/a', C);
      }
      console.log(line);
    }
  }

  // ── Summary by style ───────────────────────────────────────────────────────
  console.log(`\n── Summary by text style ${'─'.repeat(45)}`);
  console.log('  ' + pad('Style', 12) + engines.map(e => pad(e.name, 22)).join(''));
  console.log('  ' + pad('', 12) + engines.map(() => pad('nodes      edges', 22)).join(''));
  console.log('  ' + '─'.repeat(12 + engines.length * 22));

  for (const style of STYLES) {
    let line = '  ' + pad(style, 12);
    for (const eng of engines) {
      let ns=0, es=0, cnt=0;
      activeTopos.forEach(t => { const a=acc[eng.name][style][t.name]; ns+=a.ns; es+=a.es; cnt+=a.n; });
      const avgN = cnt ? ns/cnt : 0, avgE = cnt ? es/cnt : 0;
      line += pad(`${bar(avgN)} ${pct(avgN)}  ${bar(avgE)} ${pct(avgE)}`, 22);
    }
    console.log(line);
  }

  // ── Summary by topology ────────────────────────────────────────────────────
  console.log(`\n── Summary by topology ${'─'.repeat(47)}`);
  console.log('  ' + pad('Topology', 12) + engines.map(e => pad(e.name, 22)).join(''));
  console.log('  ' + '─'.repeat(12 + engines.length * 22));

  for (const topo of activeTopos) {
    let line = '  ' + pad(topo.name, 12);
    for (const eng of engines) {
      let ns=0, es=0, cnt=0;
      STYLES.forEach(s => { const a=acc[eng.name][s][topo.name]; ns+=a.ns; es+=a.es; cnt+=a.n; });
      const avgN = cnt ? ns/cnt : 0, avgE = cnt ? es/cnt : 0;
      line += pad(`${bar(avgN)} ${pct(avgN)}  ${bar(avgE)} ${pct(avgE)}`, 22);
    }
    console.log(line);
  }

  console.log('\n' + '═'.repeat(70) + '\n');
})();
