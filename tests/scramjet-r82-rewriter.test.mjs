import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as sj from '../proxy/scramjet/scramjet.mjs';

sj.setWasm(fs.readFileSync(new URL('../proxy/scramjet/scramjet.wasm', import.meta.url)));
const config = structuredClone(sj.defaultConfig);
Object.assign(config.flags, {
  sourcemaps: false,
  disableComputedWrap: false,
  allowInvalidJs: true,
  captureErrors: false,
  rewriterLogs: false
});
const context = {
  prefix: new URL('https://nova.invalid/~/sj/'),
  config,
  interface: { codecEncode: encodeURIComponent, codecDecode: decodeURIComponent }
};
const meta = { origin: new URL('https://example.com/'), base: new URL('https://example.com/') };
const source = `
class CallableProbe {
  constructor(v) { this.value = v; this._instance = () => this.value; this.bound = this.method.bind(this); }
  method(n) { return this.value + n; }
  get callable() { return function(n) { return this.value + n; }; }
}
const x = new CallableProbe(40);
globalThis.__result = [
  typeof x._instance,
  x._instance(),
  x.method(2),
  x.bound(2),
  x.callable.call(x, 2),
  Reflect.apply(x.method, x, [2]),
  Reflect.construct(CallableProbe, [42]).value,
  x["method"](2),
  x["_instance"]()
];`;
const rewritten = sj.rewriteJs(source, 'r82-probe.js', context, meta, false);
assert.equal(typeof rewritten, 'string');
// Scramjet may rewrite constructor syntax, but it must not transform the receiver
// call into a detached callable or replace the private-ish storage property.
assert.match(rewritten, /x\._instance\(\)/);
assert.match(rewritten, /this\.method\.bind\(this\)/);
assert.doesNotMatch(rewritten, /_instance\.call\(void 0/);
const realm = { __result: null };
new Function('globalThis', rewritten)(realm);
assert.deepEqual(realm.__result, ['function', 40, 42, 42, 42, 42, 42, 42, 40]);

const dynamicSource = `
const key = "location";
globalThis.__dynamicPath = globalThis[key].pathname;
const methodKey = "method";
const obj = { value: 40, method() { return this.value + 2; } };
globalThis.__dynamicMethod = obj[methodKey]();`;
const dynamicRewritten = sj.rewriteJs(dynamicSource, 'r85-dynamic-probe.js', context, meta, false);
assert.match(dynamicRewritten, /\$scramjet\$prop/);
assert.match(dynamicRewritten, /obj\[\$scramjet\$prop/);

console.log('Scramjet R8.5 real rewriter computed-callable probe passed');
