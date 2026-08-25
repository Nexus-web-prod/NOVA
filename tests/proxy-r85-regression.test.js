const fs = require('fs');
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'proxy/js/nova-proxy-manager.js'), 'utf8');
const sj = fs.readFileSync(path.join(root, 'proxy/scramjet/scramjet.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'proxy/sw.js'), 'utf8');

assert(manager.includes('20260822-sj2067-r8.17'));
assert(manager.includes('disableComputedWrap: false'));
assert(!manager.includes('disableComputedWrap: true'));
assert(sw.includes('20260822-sj2067-r8.17'));

// Scramjet's property helper must virtualize protected dynamic keys while
// returning ordinary method/property keys unchanged.
assert(sj.includes('"location"'));
assert(sj.includes('"parent"'));
assert(sj.includes('"top"'));
assert(sj.includes('"eval"'));
assert(sj.includes('wrappropertybase'));

const protectedKeys = new Set(['location', 'parent', 'top', 'eval']);
const wrapProp = key => protectedKeys.has(key) ? '$scramjet__' + key : key;
class Probe {
  constructor(v) { this.v = v; this._instance = () => this.v; }
  method(n) { return this.v + n; }
}
const x = new Probe(40);
const methodKey = 'method';
const instanceKey = '_instance';
assert.equal(x[wrapProp(methodKey)](2), 42);
assert.equal(x[wrapProp(instanceKey)](), 40);
assert.equal(wrapProp('location'), '$scramjet__location');
assert.equal(wrapProp('method'), 'method');
console.log('R8.5 computed-property virtualization regression passed');
