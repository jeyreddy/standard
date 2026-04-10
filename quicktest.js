const YMPL = require('./ympl.js');

const input = `Feed enters a shell-and-tube heat exchanger E-101 where it is preheated. The heated feed goes to CSTR reactor R-101 which has a cooling jacket. The reactor product goes to flash separator V-101. The vapor product leaves as product stream. The liquid from V-101 is recycled back to the shell side of E-101.
Equipment:
- E-101: shell and tube heat exchanger
- R-101: CSTR reactor with cooling jacket
- V-101: flash separator vessel
Instruments:
- TT-201: temperature transmitter on R-101 reactor temperature
- TCV-201: control valve on R-101 jacket cooling water flow, fail open
- TIC-201: PID controller, TT-201 to TCV-201, reverse acting
- LT-201: level transmitter on V-101 liquid level
- LV-101: control valve on V-101 liquid outlet, fail open
- LIC-201: PID controller, LT-201 to LV-101, direct acting`;

const r = YMPL.render(input);

console.log('=== TEXT READBACK ===');
console.log(r.text);

console.log('\n=== NODES ===');
r.doc.nodes.forEach(n => console.log(n.label, '-', n.kind));

console.log('\n=== EDGES ===');
r.doc.edges.forEach(e => {
  const from = r.doc.nodes.find(n => n.id === e.from);
  const to   = r.doc.nodes.find(n => n.id === e.to);
  console.log(from.label, '->', to.label, '[' + e.kind + ']');
});

console.log('\n=== WARNINGS ===');
console.log(r.warnings.length ? r.warnings.join('\n') : 'none');