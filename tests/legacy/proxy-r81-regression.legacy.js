'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(ROOT,'proxy/js/nova-proxy-manager.js'),'utf8');
const inject = fs.readFileSync(path.join(ROOT,'proxy/controller/controller.inject.js'),'utf8');
const libcurl = fs.readFileSync(path.join(ROOT,'proxy/transports/libcurl/index.mjs'),'utf8');
const pt = fs.readFileSync(path.join(ROOT,'proxy/proxy-transports/index.mjs'),'utf8');
const tester = fs.readFileSync(path.join(ROOT,'tools/nova-compat-100.mjs'),'utf8');
const sw = fs.readFileSync(path.join(ROOT,'proxy/sw.js'),'utf8');

assert(manager.includes('20260822-sj2067-r8.17'));
assert(manager.includes('disableComputedWrap: false'));
assert(manager.includes('isDestinationFailure(category)'));
assert(manager.includes('category === "target-challenge"'));
assert(manager.includes('const MIN_TRANSPORT_SAMPLE_COUNT = 4'));
assert(manager.includes('const TRANSPORT_DISTINCT_TARGET_THRESHOLD = 3'));
assert(manager.includes('const FAILURE_COOLDOWN_MS = 30000'));
assert(manager.includes('captureTransportSnapshot'));
assert(manager.includes('websocketSessions'));
assert(inject.includes('callableSemantics'));
assert(libcurl.includes('data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)'));
assert(pt.includes('_pendingClose = null'));
assert(tester.includes('this\\._instance is not a function'));
assert(tester.includes('does-not-exist-nova-test.invalid'));
assert(tester.includes('discordReconnectLoop'));
assert(tester.includes('captureTransportSnapshot'));
assert(sw.includes('20260822-sj2067-r8.17'));
assert(sw.includes('!name.includes("20260822-sj2067-r8.17")'));

// Generic receiver/callable semantics acceptance probe.
class C { constructor(v){this.v=v;} method(x){return this.v+x;} get callable(){return function(x){return this.v+x;};} }
const c = new C(40);
const proxy = new Proxy(c,{get:(t,p,r)=>Reflect.get(t,p,r)});
assert.strictEqual(typeof proxy.method,'function');
assert.strictEqual(proxy.method(2),42);
assert.strictEqual(c.method.bind(c)(2),42);
assert.strictEqual(Object.getOwnPropertyDescriptor(C.prototype,'callable').get.call(c).call(c,2),42);
const PC = new Proxy(C,{construct:(t,a,n)=>Reflect.construct(t,a,n),apply:(t,r,a)=>Reflect.apply(t,r,a)});
assert.strictEqual(new PC(42).v,42);
console.log('proxy r8.1 regression rules: ok');
