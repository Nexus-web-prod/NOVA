const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
for (const rel of ['proxy/scramjet/scramjet.js', 'proxy/scramjet/scramjet.mjs']) {
  const s = fs.readFileSync(path.join(root, rel), 'utf8');
  assert(!s.includes('!(t.args[0] in r))return;let r=t.args[1]'), `${rel}: must not contain the R8.2/R8.3 TDZ shadowing bug`);
  assert(s.includes('"message"!==t.args[0]&&"hashchange"!==t.args[0]&&"storage"!==t.args[0]'), `${rel}: listener wrapping must stay limited to the three Scramjet-transformed event types`);
}

// Reproduce the exact lexical-shadowing failure that escaped R8.2/R8.3 tests,
// then prove the R8.4 form does not touch a shadowed binding before init.
assert.throws(() => {
  const outer = { message: true };
  void outer;
  (function apply(t) {
    // This mirrors the broken minified shape: the later `let r` shadows any outer r.
    if (typeof t.args[1] !== 'function' || !(t.args[0] in r)) return;
    let r = t.args[1];
    return r;
  })({ args: ['message', () => {}] });
}, /before initialization|initialized/i);

assert.doesNotThrow(() => {
  (function apply(t) {
    if (typeof t.args[1] !== 'function' ||
        (t.args[0] !== 'message' && t.args[0] !== 'hashchange' && t.args[0] !== 'storage')) return;
    let r = t.args[1];
    return r;
  })({ args: ['message', () => {}] });
});

const tester = fs.readFileSync(path.join(root, 'tools', 'nova-compat-100.mjs'), 'utf8');
assert(tester.includes("Cannot access 'r' before initialization") || tester.includes('before initialization'),
  'compat tester must retain detection for the R8.2/R8.3 TDZ failure');

console.log('proxy-r84-regression.test.js: PASS');
