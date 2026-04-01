// test_engines.js — YMPL engine comparison runner
//
// Usage:
//   node test_engines.js                        # Tier 1 only
//   node test_engines.js --ollama               # Tier 1 + Ollama
//   node test_engines.js --haiku sk-ant-...     # Tier 1 + Haiku
//   node test_engines.js --ollama --haiku sk-ant-...  # all three
//
// Options:
//   --ollama                  use Ollama at http://localhost:11434
//   --ollama-url <url>        override Ollama URL
//   --ollama-model <model>    override model (default: qwen2.5:3b-instruct)
//   --haiku <apiKey>          enable Claude Haiku with this key
//   --scenario <id>           run only this scenario

'use strict';
const YMPL      = require('./ympl.js');
const scenarios = require('./scenarios.js');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const useOllama   = args.includes('--ollama') || args.includes('--ollama-url');
const ollamaUrl   = argVal('--ollama-url')   || 'http://localhost:11434';
const ollamaModel = argVal('--ollama-model') || 'qwen2.5:3b-instruct';
const haikuKey    = argVal('--haiku');
const onlyId      = argVal('--scenario');

function argVal(flag) {
  const i = args.indexOf(flag);
  return (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) ? args[i + 1] : null;
}

const engines = [{ name: 'Tier 1', llm: null }];
if (useOllama) engines.push({ name: `Ollama\n(${ollamaModel})`, llm: { provider: 'ollama', url: ollamaUrl, model: ollamaModel } });
if (haikuKey)  engines.push({ name: 'Claude\nHaiku', llm: { provider: 'haiku', apiKey: haikuKey } });

// ── Scoring ───────────────────────────────────────────────────────────────────
function scoreResult(result, expected) {
  const nodes   = result.doc.nodes || [];
  const edges   = result.doc.edges || [];
  const expN    = expected.nodes;
  const expE    = expected.edges;

  // Node score: how many expected nodes are matched (kind + label substring)
  let nodeHits = 0;
  const matchedNodes = new Array(nodes.length).fill(null); // node idx → expected idx
  for (let ei = 0; ei < expN.length; ei++) {
    const en = expN[ei];
    const hit = nodes.findIndex((n, ni) =>
      matchedNodes[ni] === null &&
      n.kind === en.kind &&
      n.label.toLowerCase().includes(en.labelIncludes.toLowerCase())
    );
    if (hit !== -1) { matchedNodes[hit] = ei; nodeHits++; }
  }

  // Edge score: how many expected edges exist (by matched node positions)
  // Build a map: expectedNodeIdx → actual node idx
  const expToActual = {};
  matchedNodes.forEach((expIdx, actIdx) => {
    if (expIdx !== null) expToActual[expIdx] = actIdx;
  });

  let edgeHits = 0;
  for (const ee of expE) {
    const fromActual = expToActual[ee.fromIdx];
    const toActual   = expToActual[ee.toIdx];
    if (fromActual === undefined || toActual === undefined) continue;
    const fromId = nodes[fromActual]?.id;
    const toId   = nodes[toActual]?.id;
    if (!fromId || !toId) continue;
    const hit = edges.find(e =>
      e.from === fromId && e.to === toId &&
      (ee.kind === 'stream' ? (!e.kind || e.kind === 'stream') : e.kind === ee.kind)
    );
    if (hit) edgeHits++;
  }

  return {
    nodes:      `${nodeHits}/${expN.length}`,
    nodeScore:  nodeHits / expN.length,
    edges:      `${edgeHits}/${expE.length}`,
    edgeScore:  expE.length ? edgeHits / expE.length : 1,
    confidence: result.doc.meta?.confidence || '—',
    usedLlm:    result.usedLlm || false,
    llmError:   result.llmError || null,
  };
}

// ── Table helpers ─────────────────────────────────────────────────────────────
function pad(str, width, right = false) {
  str = String(str);
  const p = ' '.repeat(Math.max(0, width - str.length));
  return right ? p + str : str + p;
}

function bar(score) {
  const filled = Math.round(score * 5);
  return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

function grade(score) {
  if (score >= 1.0) return '✓';
  if (score >= 0.8) return '~';
  if (score >= 0.5) return '△';
  return '✗';
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const active = onlyId ? scenarios.filter(s => s.id === onlyId) : scenarios;
  if (!active.length) { console.error('No scenarios found for id:', onlyId); process.exit(1); }

  const colW    = 22;
  const labelW  = 30;
  const results = [];

  // Header
  console.log('\n' + '═'.repeat(labelW + engines.length * colW));
  console.log('YMPL Engine Comparison — ' + new Date().toLocaleString());
  console.log('Engines: ' + engines.map(e => e.name.replace('\n', ' ')).join('  ·  '));
  console.log('═'.repeat(labelW + engines.length * colW));

  for (const sc of active) {
    const row = { id: sc.id, input: sc.input, scores: [] };

    console.log('\n▸ ' + sc.id);
    console.log('  "' + sc.input.slice(0, 90) + (sc.input.length > 90 ? '…' : '') + '"');
    console.log('  ' + '─'.repeat(labelW - 2 + engines.length * colW));

    const header = pad('', labelW) + engines.map(e => pad(e.name.split('\n')[0], colW)).join('');
    console.log('  ' + header);

    // Run each engine
    const engineResults = [];
    for (const eng of engines) {
      const t0 = Date.now();
      let result;
      if (!eng.llm) {
        result = YMPL.render(sc.input);
        result.usedLlm = false;
      } else {
        result = await YMPL.renderAsync(sc.input, { llm: eng.llm });
      }
      const ms = Date.now() - t0;
      const s  = scoreResult(result, sc.expected);
      s.ms     = ms;
      engineResults.push(s);
      row.scores.push({ engine: eng.name.replace('\n', ' '), ...s });
    }

    // Print rows
    const metrics = [
      { label: 'Nodes found', fn: s => pad(s.nodes, 8) + bar(s.nodeScore) + ' ' + grade(s.nodeScore) },
      { label: 'Edges found', fn: s => pad(s.edges, 8) + bar(s.edgeScore) + ' ' + grade(s.edgeScore) },
      { label: 'Confidence',  fn: s => pad(s.confidence, colW - 1) },
      { label: 'LLM used',    fn: s => pad(s.usedLlm ? 'yes' : 'no', colW - 1) },
      { label: 'Time (ms)',   fn: s => pad(s.ms + 'ms', colW - 1) },
    ];
    for (const m of metrics) {
      const line = pad(m.label, labelW) + engineResults.map(s => pad(m.fn(s), colW)).join('');
      console.log('  ' + line);
    }

    // Show errors if any
    for (let i = 0; i < engineResults.length; i++) {
      if (engineResults[i].llmError) {
        console.log('  ⚠ ' + engines[i].name.replace('\n', ' ') + ' error: ' + engineResults[i].llmError);
      }
    }

    results.push(row);
  }

  // Summary
  console.log('\n' + '═'.repeat(labelW + engines.length * colW));
  console.log('SUMMARY — average scores across ' + active.length + ' scenario(s)');
  console.log('─'.repeat(labelW + engines.length * colW));

  for (let ei = 0; ei < engines.length; ei++) {
    const name    = engines[ei].name.replace('\n', ' ');
    const allRows = results.map(r => r.scores[ei]);
    const avgNode = allRows.reduce((a, s) => a + s.nodeScore, 0) / allRows.length;
    const avgEdge = allRows.reduce((a, s) => a + s.edgeScore, 0) / allRows.length;
    const llmUsed = allRows.filter(s => s.usedLlm).length;
    const avgMs   = Math.round(allRows.reduce((a, s) => a + s.ms, 0) / allRows.length);
    console.log(`  ${pad(name, 20)}  nodes: ${bar(avgNode)} ${(avgNode * 100).toFixed(0)}%   edges: ${bar(avgEdge)} ${(avgEdge * 100).toFixed(0)}%   llm: ${llmUsed}/${allRows.length}   avg: ${avgMs}ms`);
  }

  console.log('═'.repeat(labelW + engines.length * colW) + '\n');
})();
