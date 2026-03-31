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
  check('simple 3-node: kinds', r.doc.nodes.map(n=>n.kind).join(','), 'vessel,heat_exchanger,vessel');
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

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`  ${pass} passed  /  ${fail} failed  /  ${pass + fail} total`);
if (fail > 0) { console.log('\n  SOME TESTS FAILED'); process.exit(1); }
else           { console.log('\n  ALL TESTS PASSED'); }
