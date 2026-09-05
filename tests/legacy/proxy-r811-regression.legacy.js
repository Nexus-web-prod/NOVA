'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(ROOT, 'proxy/sw.js'), 'utf8');
const inject = fs.readFileSync(path.join(ROOT, 'proxy/controller/controller.inject.js'), 'utf8');
const manager = fs.readFileSync(path.join(ROOT, 'proxy/js/nova-proxy-manager.js'), 'utf8');
const libcurl = fs.readFileSync(path.join(ROOT, 'proxy/transports/libcurl/index.mjs'), 'utf8');

assert(sw.includes('20260822-sj2067-r8.17'), 'R8.11 service-worker revision missing');
assert(manager.includes('20260822-sj2067-r8.17'), 'R8.11 manager revision missing');

// Binary body bytes must remain untouched while stale upstream wire metadata is removed.
for (const h of ['content-length','content-range','accept-ranges','transfer-encoding']) {
  assert(sw.includes(`headers.delete("${h}")`), `binary response must remove ${h}`);
}
assert(sw.includes('rebuildResponseSafely(response.body') || sw.includes('new Response(response.body'), 'binary response must reuse the original stream without text decoding');
assert(sw.includes('x-nova-proxy-binary'), 'binary byte-safe response should be diagnosable');

// SRI must be removed synchronously before insertion, not only by MutationObserver.
assert(inject.includes('__NOVA_R811_SYNC_SRI__'), 'R8.11 synchronous SRI guard missing');
for (const api of ['appendChild','insertBefore','replaceChild']) {
  assert(inject.includes(`"${api}"`), `SRI guard missing ${api} interception`);
}
assert(inject.includes('Element.prototype.insertAdjacentHTML'), 'SRI guard missing insertAdjacentHTML interception');
assert(inject.includes('setAttributeNS = function'), 'SRI guard must cover setAttributeNS');
assert(inject.includes('Object.getOwnPropertyDescriptor(proto, "innerHTML")'), 'SRI guard must cover innerHTML');
assert(inject.includes('stripTreeSync(args[i])'), 'inserted subtrees must be sanitized before native insertion');

// Preserve the proven R8.10 WebSocket work.
assert(libcurl.includes('this.send_queue.push({ data: stable, is_text })'), 'R8.10 WebSocket queue regressed');
assert(libcurl.includes('if (result === 81)'), 'R8.10 CURLE_AGAIN handling regressed');

console.log('proxy-r811-regression: PASS');
