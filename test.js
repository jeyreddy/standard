// test.js — YMPL standalone verification
// Runs entirely from this folder. No dependency on ympl-standalone-sdk or old engine files.

const YMPL = require('./ympl.js');

let pass = 0, fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log('  PASS  ' + label);
    pass++;
  } else {
    console.log('  FAIL  ' + label);
    console.log('         expected: ' + expected);
    console.log('         got:      ' + actual);
    fail++;
  }
}

function checkIncludes(label, actual, fragment) {
  if (actual.includes(fragment)) {
    console.log('  PASS  ' + label);
    pass++;
  } else {
    console.log('  FAIL  ' + label);
    console.log('         expected to contain: ' + fragment);
    console.log('         got: ' + actual);
    fail++;
  }
}

console.log('\n── Text → YAML + SVG ─────────────────────────────────────────');

// 1. Simple flow
{
  const r = YMPL.render('flash drum through trim cooler to product tank');
  check('simple 3-node: node count', r.doc.nodes.length, 3);
  check('simple 3-node: kinds', r.doc.nodes.map(n=>n.kind).join(','), 'separator,heat_exchanger,vessel');
  checkIncludes('simple 3-node: text', r.text, 'Flash Drum → Trim Cooler → Product Tank');
  checkIncludes('simple 3-node: svg', r.svg, '<svg');
  checkIncludes('simple 3-node: yaml', r.yaml, 'schema_version: ympl-1.0');
}

// 2. Typos normalised
{
  const r = YMPL.render('pumpp pushes into cntrol valev and then to heet exhanger');
  check('typos: node count', r.doc.nodes.length, 3);
  check('typos: kinds', r.doc.nodes.map(n=>n.kind).join(','), 'pump,valve,heat_exchanger');
}

// 3. ISA tag IDs
{
  const r = YMPL.render('tank 1 feeds P-101 through CV-101 to separator V-201');
  check('tag IDs: node count', r.doc.nodes.length, 4);
  check('tag IDs: P-101 is pump', r.doc.nodes[1].kind, 'pump');
  check('tag IDs: CV-101 is valve', r.doc.nodes[2].kind, 'valve');
  check('tag IDs: label uses tag', r.doc.nodes[1].label, 'P-101');
}

// 4. Bypass edge
{
  const r = YMPL.render('feed tank to P-101 through CV-101 to V-201, bypass around CV-101');
  const bypasses = r.doc.edges.filter(e => e.kind === 'bypass');
  check('bypass: bypass edge exists', bypasses.length, 1);
  checkIncludes('bypass: text mentions bypass', r.text, 'Bypass');
}

// 5. Recycle edge
{
  const r = YMPL.render('suction drum to K-101 to E-101 to product drum, recycle line back to suction drum');
  const recycles = r.doc.edges.filter(e => e.kind === 'recycle');
  check('recycle: recycle edge exists', recycles.length, 1);
  checkIncludes('recycle: text mentions recycle', r.text, 'Recycle');
}

// 6. Bypass synonym
{
  const r = YMPL.render('feed tank to pump to control valve to separator, parallel path around control valve');
  const bypasses = r.doc.edges.filter(e => e.kind === 'bypass');
  check('bypass synonym: parallel path', bypasses.length, 1);
}

// 7. Recycle synonym
{
  const r = YMPL.render('suction drum to compressor to cooler to product drum, recirculation line back to suction drum');
  const recycles = r.doc.edges.filter(e => e.kind === 'recycle');
  check('recycle synonym: recirculation line', recycles.length, 1);
}

// 8. Word bank terms
{
  const r = YMPL.render('sealless pump to fractionating column via dbb valve');
  check('word bank: sealless pump', r.doc.nodes[0].kind, 'pump');
  check('word bank: fractionating column', r.doc.nodes[1].kind, 'column');
  check('word bank: dbb valve', r.doc.nodes[2].kind, 'valve');
}

console.log('\n── YAML → text + SVG ─────────────────────────────────────────');

// 9. YAML round-trip
{
  const textResult = YMPL.render('flash drum through trim cooler to product tank');
  const yamlStr    = textResult.yaml;
  const yamlResult = YMPL.render(yamlStr);
  check('round-trip: same node count',  yamlResult.doc.nodes.length, textResult.doc.nodes.length);
  check('round-trip: same text output', yamlResult.text, textResult.text);
  checkIncludes('round-trip: svg generated', yamlResult.svg, '<svg');
}

// 10. YAML with bypass
{
  const yaml = `schema_version: ympl-1.0
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
  source_text: manual`;

  const r = YMPL.render(yaml);
  check('yaml bypass: 4 nodes', r.doc.nodes.length, 4);
  check('yaml bypass: text correct', r.text, 'Feed Tank → P-101 → CV-101 → V-201. Bypass from P-101 to V-201.');
  checkIncludes('yaml bypass: svg has nodes', r.svg, 'Feed Tank');
}

// 11. YAML with recycle
{
  const yaml = `schema_version: ympl-1.0
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
    label: E-101
    kind: heat_exchanger
  - id: n4
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
    to: n1
    kind: recycle
    label: Recycle
meta:
  confidence: high
  source_text: manual`;

  const r = YMPL.render(yaml);
  check('yaml recycle: 4 nodes', r.doc.nodes.length, 4);
  checkIncludes('yaml recycle: text has recycle', r.text, 'Recycle');
}

console.log('\n── Relation extraction (Tier 1) ──────────────────────────────');

// 12. "from X to Y with Z in between" — sink deferred to end
{
  const r = YMPL.render('gas moved from cylinder a to cylinder b with a reactor and check valves in between. there is a bypass around the reactor as well.');
  check('from/to: 4 nodes found',            r.doc.nodes.length, 4);
  check('from/to: cylinder a is first node', r.doc.nodes[0].label, 'Cylinder A');
  check('from/to: cylinder b is last node',  r.doc.nodes[3].label, 'Cylinder B');
  check('from/to: bypass edge exists',       r.doc.edges.filter(e => e.kind === 'bypass').length, 1);
}

// 13. Flow-verb pair "A feeds B" — A appears before B and intermediates follow
{
  const r = YMPL.render('pump P-101 feeds valve CV-101 to separator V-201');
  check('flow-verb: 3 nodes',        r.doc.nodes.length, 3);
  check('flow-verb: P-101 is first', r.doc.nodes[0].label, 'P-101');
  check('flow-verb: V-201 is last',  r.doc.nodes[2].label, 'V-201');
}

// 14. Upstream/downstream keyword — downstream node deferred to chain end
{
  const r = YMPL.render('P-101 upstream of V-201, with CV-101 in between');
  check('upstream: 3 nodes',       r.doc.nodes.length, 3);
  check('upstream: V-201 is last', r.doc.nodes[2].label, 'V-201');
}

// 15. Inverse verb "A receives from B" → B is source, A is sink
{
  const r = YMPL.render('separator V-201 receives flow from pump P-101 via valve CV-101');
  check('inverse-verb: 3 nodes',       r.doc.nodes.length, 3);
  check('inverse-verb: P-101 first',   r.doc.nodes[0].label, 'P-101');
  check('inverse-verb: V-201 last',    r.doc.nodes[2].label, 'V-201');
}

// 16. Inverse verb "A is fed by B"
{
  const r = YMPL.render('reactor R-101 is fed by pump P-101 through valve CV-101');
  check('is-fed-by: R-101 is sink',    r.doc.nodes[r.doc.nodes.length - 1].label, 'R-101');
  check('is-fed-by: P-101 is source',  r.doc.nodes[0].label, 'P-101');
}

// 17. renderAsync — no LLM config → returns same as render()
{
  (async () => {
    const sync  = YMPL.render('flash drum to trim cooler to product tank');
    const async_ = await YMPL.renderAsync('flash drum to trim cooler to product tank');
    check('renderAsync: same node count',  async_.doc.nodes.length, sync.doc.nodes.length);
    check('renderAsync: same text output', async_.text, sync.text);
  })().catch(e => { console.log('  FAIL  renderAsync threw: ' + e.message); fail++; });
}

console.log('\n── Warnings & smart LLM trigger ─────────────────────────────');

// 18. Clean parse → no warnings
{
  const r = YMPL.render('flash drum to trim cooler to product tank');
  check('warnings: clean parse has none', r.warnings.length, 0);
}

// 19. bypass keyword but no bypass edge → warning generated
{
  const r = YMPL.render('feed tank to pump to reactor with a bypass somewhere');
  check('warnings: bypass keyword flagged', r.warnings.some(w => w.includes('bypass keyword')), true);
}

// 20. recycle keyword but no recycle edge → warning generated
{
  const r = YMPL.render('suction drum to compressor to product drum, recycle to somewhere unknown');
  check('warnings: recycle keyword flagged', r.warnings.some(w => w.includes('recycle keyword')), true);
}

// 21. renderAsync no-LLM → usedLlm false, warnings present
{
  (async () => {
    const r = await YMPL.renderAsync('feed tank to pump to reactor with a bypass somewhere');
    check('renderAsync: usedLlm false when no llm config', r.usedLlm, false);
    check('renderAsync: warnings still surfaced',          r.warnings.some(w => w.includes('bypass')), true);
  })().catch(e => { console.log('  FAIL  renderAsync warnings: ' + e.message); fail++; });
}

console.log('\n── No dependency on old SDK files ────────────────────────────');

// 12. Confirm old SDK modules are NOT loaded
const oldModules = [
  'process_interpreter', 'process_ontology', 'process_graph',
  'process_relation_patterns', 'process_semantic_provider',
  'local_semantic_layer', 'process_language_sdk',
];
for (const mod of oldModules) {
  const loaded = Object.keys(require.cache).some(k => k.includes(mod));
  check('not loaded: ' + mod, loaded, false);
}

console.log('\n── Structured sections (Equipment: / Instruments:) ───────────');

// 36. Equipment: + Instruments: sections with signal loops + recycle
{
  const input =
    'Feed enters a shell-and-tube heat exchanger E-101 where it is preheated. ' +
    'The heated feed goes to CSTR reactor R-101 which has a cooling jacket. ' +
    'The reactor product goes to flash separator V-101. ' +
    'The vapor product leaves as product stream. ' +
    'The liquid from V-101 is recycled back to the shell side of E-101. ' +
    'Equipment: - E-101: shell and tube heat exchanger - R-101: CSTR reactor with cooling jacket' +
    ' - V-101: flash separator vessel' +
    ' Instruments: - TT-201: temperature transmitter on R-101 reactor temperature' +
    ' - TCV-201: control valve on R-101 jacket cooling water flow, fail open' +
    ' - TIC-201: PID controller, TT-201 to TCV-201, reverse acting, startup priority 1' +
    ' - LT-201: level transmitter on V-101 liquid level' +
    ' - LV-101: control valve on V-101 liquid outlet, fail open' +
    ' - LIC-201: PID controller, LT-201 to LV-101, direct acting, startup priority 2';

  const r = YMPL.render(input);
  const nl = label => r.doc.nodes.find(n => n.label === label);
  const hasEdge = (from, to, kind) =>
    r.doc.edges.some(e => e.from === nl(from)?.id && e.to === nl(to)?.id && e.kind === kind);

  // Node count and kinds
  check('structured: 9 nodes',               r.doc.nodes.length,    9);
  check('structured: E-101 heat_exchanger',  nl('E-101')?.kind,     'heat_exchanger');
  check('structured: R-101 reactor',         nl('R-101')?.kind,     'reactor');
  check('structured: V-101 separator',       nl('V-101')?.kind,     'separator');
  check('structured: TT-201 transmitter',    nl('TT-201')?.kind,    'transmitter');
  check('structured: TIC-201 controller',    nl('TIC-201')?.kind,   'controller');
  check('structured: TCV-201 valve',         nl('TCV-201')?.kind,   'valve');
  check('structured: LT-201 transmitter',    nl('LT-201')?.kind,    'transmitter');
  check('structured: LIC-201 controller',    nl('LIC-201')?.kind,   'controller');
  check('structured: LV-101 valve',          nl('LV-101')?.kind,    'valve');

  // Equipment flow edges
  check('structured: E-101→R-101 stream',    hasEdge('E-101', 'R-101', 'stream'),  true);
  check('structured: R-101→V-101 stream',    hasEdge('R-101', 'V-101', 'stream'),  true);
  check('structured: V-101→E-101 recycle',   hasEdge('V-101', 'E-101', 'recycle'), true);

  // Signal loop 1: TT-201 → TIC-201 → TCV-201
  check('structured: TT-201→TIC-201 signal', hasEdge('TT-201',  'TIC-201', 'signal'), true);
  check('structured: TIC-201→TCV-201 signal',hasEdge('TIC-201', 'TCV-201', 'signal'), true);

  // Signal loop 2: LT-201 → LIC-201 → LV-101
  check('structured: LT-201→LIC-201 signal', hasEdge('LT-201',  'LIC-201', 'signal'), true);
  check('structured: LIC-201→LV-101 signal', hasEdge('LIC-201', 'LV-101',  'signal'), true);
}

console.log('\n── Test Case File — 15 simulation engineer patterns ──────────');

// Helper: look up node by label, get edge by label pair
function mkHelpers(r) {
  const nl = label => r.doc.nodes.find(n => n.label === label);
  const hasEdge = (from, to, kind) =>
    r.doc.edges.some(e => {
      const fn = r.doc.nodes.find(n => n.id === e.from);
      const tn = r.doc.nodes.find(n => n.id === e.to);
      return fn && tn && fn.label === from && tn.label === to && e.kind === kind;
    });
  return { nl, hasEdge };
}

// Case 01 — Structured sections: Equipment: + Instruments: with recycle
{
  const input =
    'Feed enters a shell-and-tube heat exchanger E-101 where it is preheated. ' +
    'The heated feed goes to CSTR reactor R-101 which has a cooling jacket. ' +
    'The reactor product goes to flash separator V-101. ' +
    'The vapor product leaves as product stream. ' +
    'The liquid from V-101 is recycled back to the shell side of E-101. ' +
    'Equipment: - E-101: shell and tube heat exchanger - R-101: CSTR reactor with cooling jacket' +
    ' - V-101: flash separator vessel' +
    ' Instruments: - TT-201: temperature transmitter on R-101 reactor temperature' +
    ' - TCV-201: control valve on R-101 jacket cooling water flow, fail open' +
    ' - TIC-201: PID controller, TT-201 to TCV-201, reverse acting' +
    ' - LT-201: level transmitter on V-101 liquid level' +
    ' - LV-101: control valve on V-101 liquid outlet, fail open' +
    ' - LIC-201: PID controller, LT-201 to LV-101, direct acting';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case01: 9 nodes',                r.doc.nodes.length,         9);
  check('case01: E-101 heat_exchanger',   nl('E-101')?.kind,          'heat_exchanger');
  check('case01: R-101 reactor',          nl('R-101')?.kind,          'reactor');
  check('case01: V-101 separator',        nl('V-101')?.kind,          'separator');
  check('case01: TT-201 transmitter',     nl('TT-201')?.kind,         'transmitter');
  check('case01: TIC-201 controller',     nl('TIC-201')?.kind,        'controller');
  check('case01: TCV-201 valve',          nl('TCV-201')?.kind,        'valve');
  check('case01: LT-201 transmitter',     nl('LT-201')?.kind,         'transmitter');
  check('case01: LIC-201 controller',     nl('LIC-201')?.kind,        'controller');
  check('case01: LV-101 valve',           nl('LV-101')?.kind,         'valve');
  check('case01: 7 edges',                r.doc.edges.length,         7);
  check('case01: E-101→R-101 stream',     hasEdge('E-101','R-101','stream'),   true);
  check('case01: R-101→V-101 stream',     hasEdge('R-101','V-101','stream'),   true);
  check('case01: V-101→E-101 recycle',    hasEdge('V-101','E-101','recycle'),  true);
  check('case01: TT-201→TIC-201 signal',  hasEdge('TT-201','TIC-201','signal'),true);
  check('case01: TIC-201→TCV-201 signal', hasEdge('TIC-201','TCV-201','signal'),true);
  check('case01: LT-201→LIC-201 signal',  hasEdge('LT-201','LIC-201','signal'),true);
  check('case01: LIC-201→LV-101 signal',  hasEdge('LIC-201','LV-101','signal'),true);
}

// Case 02 — Simple forward chain, prose only
{
  const r = YMPL.render('Feed tank T-101 feeds centrifugal pump P-101 through suction valve. P-101 discharge goes through flow control valve FCV-101 to reactor feed drum V-201.');
  const { nl, hasEdge } = mkHelpers(r);
  check('case02: 4 nodes',        r.doc.nodes.length, 4);
  check('case02: T-101 vessel',   nl('T-101')?.kind,  'vessel');
  check('case02: P-101 pump',     nl('P-101')?.kind,  'pump');
  check('case02: FCV-101 valve',  nl('FCV-101')?.kind,'valve');
  check('case02: V-201 vessel',   nl('V-201')?.kind,  'vessel');
  check('case02: 3 edges',        r.doc.edges.length, 3);
  check('case02: T-101→P-101',    hasEdge('T-101','P-101','stream'),   true);
  check('case02: P-101→FCV-101',  hasEdge('P-101','FCV-101','stream'), true);
  check('case02: FCV-101→V-201',  hasEdge('FCV-101','V-201','stream'), true);
}

// Case 03 — Inverted verb ("receives from", "fed from")
{
  const r = YMPL.render('Separator V-201 receives feed from pump P-101. Reactor R-101 is fed from V-201. Product drum V-301 receives product from R-101.');
  const { nl, hasEdge } = mkHelpers(r);
  check('case03: 4 nodes',        r.doc.nodes.length, 4);
  check('case03: P-101 pump',     nl('P-101')?.kind,  'pump');
  check('case03: V-201 separator',nl('V-201')?.kind,  'separator');
  check('case03: R-101 reactor',  nl('R-101')?.kind,  'reactor');
  check('case03: V-301 vessel',   nl('V-301')?.kind,  'vessel');
  check('case03: P-101 first',    r.doc.nodes[0].label,'P-101');
  check('case03: V-301 last',     r.doc.nodes[3].label,'V-301');
  check('case03: P-101→V-201',    hasEdge('P-101','V-201','stream'), true);
  check('case03: V-201→R-101',    hasEdge('V-201','R-101','stream'), true);
  check('case03: R-101→V-301',    hasEdge('R-101','V-301','stream'), true);
}

// Case 04 — Compressor antisurge circuit with signal loop
{
  const input =
    'Suction drum V-101 feeds compressor K-101. K-101 discharge goes through discharge cooler E-101 to high pressure separator V-201. Antisurge valve FCV-101 recycles from K-101 discharge back to V-101 suction.\n' +
    'Instruments:\n' +
    '- PT-101: pressure transmitter on K-101 suction\n' +
    '- PT-201: pressure transmitter on K-101 discharge\n' +
    '- FT-101: flow transmitter on antisurge line\n' +
    '- FCV-101: antisurge control valve, fail open\n' +
    '- PIC-101: antisurge controller, PT-101 to FCV-101';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case04: 9 nodes',           r.doc.nodes.length,         9);
  check('case04: V-101 separator',   nl('V-101')?.kind,          'separator');
  check('case04: K-101 compressor',  nl('K-101')?.kind,          'compressor');
  check('case04: E-101 heat_exchanger', nl('E-101')?.kind,       'heat_exchanger');
  check('case04: V-201 separator',   nl('V-201')?.kind,          'separator');
  check('case04: PT-101 transmitter',nl('PT-101')?.kind,         'transmitter');
  check('case04: PT-201 transmitter',nl('PT-201')?.kind,         'transmitter');
  check('case04: FT-101 transmitter',nl('FT-101')?.kind,         'transmitter');
  check('case04: FCV-101 valve',     nl('FCV-101')?.kind,        'valve');
  check('case04: PIC-101 controller',nl('PIC-101')?.kind,        'controller');
  check('case04: V-101→K-101',       hasEdge('V-101','K-101','stream'),   true);
  check('case04: K-101→E-101',       hasEdge('K-101','E-101','stream'),   true);
  check('case04: E-101→V-201',       hasEdge('E-101','V-201','stream'),   true);
  check('case04: FCV-101→V-101 recycle', hasEdge('FCV-101','V-101','recycle'), true);
  check('case04: PT-101→PIC-101',    hasEdge('PT-101','PIC-101','signal'),true);
  check('case04: PIC-101→FCV-101',   hasEdge('PIC-101','FCV-101','signal'),true);
}

// Case 05 — Distillation column with auxiliaries and signal loops
{
  const input =
    'Feed enters distillation column C-101 at mid-section. Overhead vapor goes to condenser E-101. Condensate collects in reflux drum V-101. Reflux pump P-101 returns reflux to column top. Bottoms product leaves C-101 through reboiler E-102 which is heated by steam.\n' +
    'Instruments:\n' +
    '- FT-101: flow transmitter on feed line\n' +
    '- FCV-101: feed control valve, fail closed\n' +
    '- FIC-101: feed flow controller, FT-101 to FCV-101\n' +
    '- LT-101: level transmitter on V-101\n' +
    '- LCV-101: reflux control valve\n' +
    '- LIC-101: reflux drum level controller, LT-101 to LCV-101\n' +
    '- TT-101: temperature transmitter on C-101 tray 10';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case05: 12 nodes',          r.doc.nodes.length,         12);
  check('case05: C-101 column',      nl('C-101')?.kind,          'column');
  check('case05: E-101 heat_exchanger', nl('E-101')?.kind,       'heat_exchanger');
  check('case05: V-101 vessel',      nl('V-101')?.kind,          'vessel');
  check('case05: P-101 pump',        nl('P-101')?.kind,          'pump');
  check('case05: E-102 heat_exchanger', nl('E-102')?.kind,       'heat_exchanger');
  check('case05: FT-101 transmitter',nl('FT-101')?.kind,         'transmitter');
  check('case05: FCV-101 valve',     nl('FCV-101')?.kind,        'valve');
  check('case05: FIC-101 controller',nl('FIC-101')?.kind,        'controller');
  check('case05: LT-101 transmitter',nl('LT-101')?.kind,         'transmitter');
  check('case05: LCV-101 valve',     nl('LCV-101')?.kind,        'valve');
  check('case05: LIC-101 controller',nl('LIC-101')?.kind,        'controller');
  check('case05: TT-101 transmitter',nl('TT-101')?.kind,         'transmitter');
  check('case05: C-101→E-102',       hasEdge('C-101','E-102','stream'),   true);
  check('case05: FT-101→FIC-101',    hasEdge('FT-101','FIC-101','signal'),true);
  check('case05: FIC-101→FCV-101',   hasEdge('FIC-101','FCV-101','signal'),true);
  check('case05: LT-101→LIC-101',    hasEdge('LT-101','LIC-101','signal'),true);
  check('case05: LIC-101→LCV-101',   hasEdge('LIC-101','LCV-101','signal'),true);
}

// Case 06 — Two feeds converging (fan-in to mixer)
{
  const input =
    'Equipment:\n- T-101: hydrocarbon feed tank\n- T-102: solvent feed tank\n' +
    '- P-101: hydrocarbon feed pump\n- P-102: solvent feed pump\n' +
    '- M-101: static mixer\n- R-101: plug flow reactor\n\n' +
    'Hydrocarbon feed flows from T-101 through P-101 to mixer M-101. Solvent feed flows from T-102 through P-102 to mixer M-101. Mixed feed from M-101 goes to reactor R-101.';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case06: 6 nodes',        r.doc.nodes.length, 6);
  check('case06: T-101 vessel',   nl('T-101')?.kind,  'vessel');
  check('case06: T-102 vessel',   nl('T-102')?.kind,  'vessel');
  check('case06: P-101 pump',     nl('P-101')?.kind,  'pump');
  check('case06: P-102 pump',     nl('P-102')?.kind,  'pump');
  check('case06: M-101 vessel',   nl('M-101')?.kind,  'vessel');
  check('case06: R-101 reactor',  nl('R-101')?.kind,  'reactor');
  check('case06: 5 edges',        r.doc.edges.length, 5);
  check('case06: T-101→P-101',    hasEdge('T-101','P-101','stream'), true);
  check('case06: T-102→P-102',    hasEdge('T-102','P-102','stream'), true);
  check('case06: P-101→M-101',    hasEdge('P-101','M-101','stream'), true);
  check('case06: P-102→M-101',    hasEdge('P-102','M-101','stream'), true);
  check('case06: M-101→R-101',    hasEdge('M-101','R-101','stream'), true);
}

// Case 07 — Bypass around heat exchanger with temperature control loop
{
  const input =
    'Feed pump P-101 discharges through feed preheater E-101 to reactor R-101. A bypass line goes around E-101 directly from P-101 to R-101.\n' +
    'Instruments:\n' +
    '- TT-101: temperature transmitter on R-101 inlet\n' +
    '- TCV-101: temperature control valve on E-101 bypass, fail open\n' +
    '- TIC-101: inlet temperature controller, TT-101 to TCV-101';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case07: 6 nodes',            r.doc.nodes.length,          6);
  check('case07: P-101 pump',         nl('P-101')?.kind,           'pump');
  check('case07: E-101 heat_exchanger', nl('E-101')?.kind,         'heat_exchanger');
  check('case07: R-101 reactor',      nl('R-101')?.kind,           'reactor');
  check('case07: TT-101 transmitter', nl('TT-101')?.kind,          'transmitter');
  check('case07: TCV-101 valve',      nl('TCV-101')?.kind,         'valve');
  check('case07: TIC-101 controller', nl('TIC-101')?.kind,         'controller');
  check('case07: 5 edges',            r.doc.edges.length,          5);
  check('case07: P-101→E-101',        hasEdge('P-101','E-101','stream'),  true);
  check('case07: E-101→R-101',        hasEdge('E-101','R-101','stream'),  true);
  check('case07: P-101→R-101 bypass', hasEdge('P-101','R-101','bypass'),  true);
  check('case07: TT-101→TIC-101',     hasEdge('TT-101','TIC-101','signal'),true);
  check('case07: TIC-101→TCV-101',    hasEdge('TIC-101','TCV-101','signal'),true);
}

// Case 08 — ISA tag chain, no prose
{
  const r = YMPL.render('FE-101 → FT-101 → FIC-101 → FCV-101');
  const { nl, hasEdge } = mkHelpers(r);
  check('case08: 4 nodes',             r.doc.nodes.length,         4);
  check('case08: FE-101 element',      nl('FE-101')?.kind,         'element');
  check('case08: FT-101 transmitter',  nl('FT-101')?.kind,         'transmitter');
  check('case08: FIC-101 controller',  nl('FIC-101')?.kind,        'controller');
  check('case08: FCV-101 valve',       nl('FCV-101')?.kind,        'valve');
  check('case08: 3 edges',             r.doc.edges.length,         3);
  check('case08: FE-101→FT-101',       hasEdge('FE-101','FT-101','signal'),  true);
  check('case08: FT-101→FIC-101',      hasEdge('FT-101','FIC-101','signal'), true);
  check('case08: FIC-101→FCV-101',     hasEdge('FIC-101','FCV-101','signal'),true);
}

// Case 09 — Messy typos and field shorthand, unnamed nodes
{
  const r = YMPL.render('crude goes thru desalter V-101 then to atm distillation column C-101. overhead from C-101 thru condensor E-101 to reflux drum. bottoms pumped by P-101 to vacuum unit.');
  const { nl, hasEdge } = mkHelpers(r);
  check('case09: 6 nodes',              r.doc.nodes.length,         6);
  check('case09: V-101 vessel',         nl('V-101')?.kind,          'vessel');
  check('case09: C-101 column',         nl('C-101')?.kind,          'column');
  check('case09: E-101 heat_exchanger', nl('E-101')?.kind,          'heat_exchanger');
  check('case09: P-101 pump',           nl('P-101')?.kind,          'pump');
  check('case09: Reflux Drum present',  nl('Reflux Drum') !== undefined, true);
  check('case09: Vacuum Unit present',  nl('Vacuum Unit') !== undefined, true);
  check('case09: V-101→C-101',          hasEdge('V-101','C-101','stream'), true);
  check('case09: C-101→E-101',          hasEdge('C-101','E-101','stream'), true);
}

// Case 10 — Heat exchanger network, feed-effluent exchanger
{
  const input =
    'Equipment:\n' +
    '- E-101: feed-effluent exchanger, shell side feed, tube side effluent\n' +
    '- E-102: feed preheater, steam heated\n' +
    '- E-103: product cooler, cooling water\n' +
    '- V-101: feed drum\n' +
    '- V-201: product drum\n\n' +
    'Feed from V-101 goes through E-101 shell side then E-102 to reactor R-101. Reactor effluent goes through E-101 tube side then E-103 to product drum V-201.';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case10: 6 nodes',               r.doc.nodes.length,        6);
  check('case10: E-101 heat_exchanger',  nl('E-101')?.kind,         'heat_exchanger');
  check('case10: E-102 heat_exchanger',  nl('E-102')?.kind,         'heat_exchanger');
  check('case10: E-103 heat_exchanger',  nl('E-103')?.kind,         'heat_exchanger');
  check('case10: V-101 vessel',          nl('V-101')?.kind,         'vessel');
  check('case10: V-201 vessel',          nl('V-201')?.kind,         'vessel');
  check('case10: R-101 reactor',         nl('R-101')?.kind,         'reactor');
  check('case10: V-101→E-101',           hasEdge('V-101','E-101','stream'), true);
  check('case10: E-101→E-102',           hasEdge('E-101','E-102','stream'), true);
  check('case10: E-102→R-101',           hasEdge('E-102','R-101','stream'), true);
  check('case10: E-101→E-103',           hasEdge('E-101','E-103','stream'), true);
  check('case10: E-103→V-201',           hasEdge('E-103','V-201','stream'), true);
}

// Case 11 — Safety instrumented system (PSHH trip, SDV, PSV)
{
  const input =
    'Instruments:\n' +
    '- PT-301: pressure transmitter on V-301 high pressure separator\n' +
    '- PSHH-301: pressure switch high high on V-301, trip setpoint 85 barg\n' +
    '- SDV-301: shutdown valve on V-301 inlet, fail closed\n' +
    '- PSV-301: pressure safety valve on V-301, set 90 barg';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case11: 4 nodes',              r.doc.nodes.length,         4);
  check('case11: PT-301 transmitter',   nl('PT-301')?.kind,         'transmitter');
  check('case11: PSHH-301 switch',      nl('PSHH-301')?.kind,       'switch');
  check('case11: SDV-301 valve',        nl('SDV-301')?.kind,        'valve');
  check('case11: PSV-301 relief',       nl('PSV-301')?.kind,        'relief');
  check('case11: 2 edges',              r.doc.edges.length,         2);
  check('case11: PT-301→PSHH-301',      hasEdge('PT-301','PSHH-301','signal'), true);
  check('case11: PSHH-301→SDV-301',     hasEdge('PSHH-301','SDV-301','signal'),true);
}

// Case 12 — Cascade control loop (primary TIC → secondary FIC → valve)
{
  const input =
    'Instruments:\n' +
    '- TT-401: temperature transmitter on R-401 bed outlet\n' +
    '- TIC-401: primary temperature controller, cascade master\n' +
    '- FT-401: flow transmitter on quench gas line\n' +
    '- FIC-401: quench gas flow controller, cascade slave, TIC-401 to FIC-401\n' +
    '- FCV-401: quench gas control valve, fail open';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case12: 5 nodes',              r.doc.nodes.length,         5);
  check('case12: TT-401 transmitter',   nl('TT-401')?.kind,         'transmitter');
  check('case12: TIC-401 controller',   nl('TIC-401')?.kind,        'controller');
  check('case12: FT-401 transmitter',   nl('FT-401')?.kind,         'transmitter');
  check('case12: FIC-401 controller',   nl('FIC-401')?.kind,        'controller');
  check('case12: FCV-401 valve',        nl('FCV-401')?.kind,        'valve');
  check('case12: 4 edges',              r.doc.edges.length,         4);
  check('case12: TT-401→TIC-401',       hasEdge('TT-401','TIC-401','signal'), true);
  check('case12: FT-401→FIC-401',       hasEdge('FT-401','FIC-401','signal'), true);
  check('case12: TIC-401→FIC-401 cascade', hasEdge('TIC-401','FIC-401','signal'), true);
  check('case12: FIC-401→FCV-401',      hasEdge('FIC-401','FCV-401','signal'),true);
}

// Case 13 — Absorber with lean/rich amine streams
{
  const input =
    'Sour gas enters absorber C-101 at bottom. Lean amine enters C-101 at top from lean amine pump P-101. Rich amine leaves C-101 bottom to rich amine flash drum V-101. Sweet gas leaves C-101 overhead.\n' +
    'Equipment:\n- C-101: amine absorber\n- P-101: lean amine pump\n- V-101: rich amine flash drum';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case13: 3 nodes',         r.doc.nodes.length, 3);
  check('case13: C-101 absorber',  nl('C-101')?.kind,  'absorber');
  check('case13: P-101 pump',      nl('P-101')?.kind,  'pump');
  check('case13: V-101 present',   nl('V-101') !== undefined, true);
  check('case13: P-101→C-101',     hasEdge('P-101','C-101','stream'), true);
  check('case13: C-101→V-101',     hasEdge('C-101','V-101','stream'), true);
}

// Case 14 — Typos and field shorthand + recycle
{
  const r = YMPL.render('Feed tank thru cntrifugal pumpp P-101 thru contrrol valve CV-101 to seprator V-201. recyle line back to feed tank from V-201.');
  const { nl, hasEdge } = mkHelpers(r);
  check('case14: 4 nodes',          r.doc.nodes.length, 4);
  check('case14: Feed Tank vessel', nl('Feed Tank')?.kind, 'vessel');
  check('case14: P-101 pump',       nl('P-101')?.kind,    'pump');
  check('case14: CV-101 valve',     nl('CV-101')?.kind,   'valve');
  check('case14: V-201 separator',  nl('V-201')?.kind,    'separator');
  check('case14: 4 edges',          r.doc.edges.length,   4);
  check('case14: Feed Tank→P-101',  hasEdge('Feed Tank','P-101','stream'),   true);
  check('case14: P-101→CV-101',     hasEdge('P-101','CV-101','stream'),      true);
  check('case14: CV-101→V-201',     hasEdge('CV-101','V-201','stream'),      true);
  check('case14: V-201→Feed Tank recycle', hasEdge('V-201','Feed Tank','recycle'), true);
}

// Case 15 — Instruments only, no process equipment
{
  const input =
    'Instruments:\n' +
    '- FE-501: orifice plate on crude feed line\n' +
    '- FT-501: differential pressure transmitter\n' +
    '- FIC-501: flow indicating controller, FE-501 to FCV-501\n' +
    '- FCV-501: crude feed control valve, fail closed';
  const r = YMPL.render(input);
  const { nl, hasEdge } = mkHelpers(r);
  check('case15: 4 nodes',              r.doc.nodes.length,         4);
  check('case15: FE-501 element',       nl('FE-501')?.kind,         'element');
  check('case15: FT-501 transmitter',   nl('FT-501')?.kind,         'transmitter');
  check('case15: FIC-501 controller',   nl('FIC-501')?.kind,        'controller');
  check('case15: FCV-501 valve',        nl('FCV-501')?.kind,        'valve');
  check('case15: 3 edges',              r.doc.edges.length,         3);
  check('case15: FE-501→FT-501',        hasEdge('FE-501','FT-501','signal'),  true);
  check('case15: FT-501→FIC-501',       hasEdge('FT-501','FIC-501','signal'), true);
  check('case15: FIC-501→FCV-501',      hasEdge('FIC-501','FCV-501','signal'),true);
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`  ${pass} passed  /  ${fail} failed  /  ${pass + fail} total`);
if (fail > 0) { console.log('\n  SOME TESTS FAILED'); process.exit(1); }
else           { console.log('\n  ALL TESTS PASSED'); }
