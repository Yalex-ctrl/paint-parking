/**
 * Lists what looks like an allocation inside every useFrame callback of src (a `new X(`, a clone, a closure, a map/filter/slice): `node scripts/audit-frame-allocations.js`.
 * Part of the audit of the bridge (docs/perf): nothing may be allocated in a frame, so every line it prints must be a one-time setup
 * (the start of a slide, of a transition) and not something that runs every frame.
 */
const fs = require('fs');
const path = require('path');
function walk(d, out = []) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p, out); else if (/\.(tsx|ts)$/.test(f)) out.push(p); } return out; }
for (const file of walk('src')) {
  const s = fs.readFileSync(file, 'utf8');
  let idx = 0;
  while ((idx = s.indexOf('useFrame(', idx)) >= 0) {
    // find the callback body by brace matching starting at first '{' after '=>'
    const arrow = s.indexOf('=>', idx);
    const open = s.indexOf('{', arrow);
    if (arrow < 0 || open < 0) break;
    let depth = 0, i = open;
    for (; i < s.length; i++) { if (s[i] === '{') depth++; else if (s[i] === '}') { depth--; if (depth === 0) break; } }
    const body = s.slice(open, i);
    const line0 = s.slice(0, open).split('\n').length;
    const hits = [];
    body.split('\n').forEach((ln, k) => { if (/\bnew [A-Z]\w*\(|\.clone\(\)|\.map\(|\.filter\(|\.slice\(|=> \{|\[\.\.\./.test(ln) && !/^\s*\/\//.test(ln)) hits.push(`${line0 + k}: ${ln.trim().slice(0, 110)}`); });
    if (hits.length) console.log(`\n${file}`, '\n  ' + hits.join('\n  '));
    idx = i;
  }
}
