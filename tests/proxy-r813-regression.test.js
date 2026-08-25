const fs = require('fs');
const assert = require('assert');
const mgr = fs.readFileSync('proxy/js/nova-proxy-manager.js','utf8');

assert(
  mgr.includes('let response;') && mgr.includes('response = await originalRequest(remote, method, body, forceIdentityEncoding(headers), signal);'),
  'transport response must remain mutable before font buffering/subtransport replacement'
);
assert(
  !mgr.includes('const response = await originalRequest(remote, method, body, forceIdentityEncoding(headers), signal);'),
  'R8.12 const-response regression must not return'
);
assert(
  mgr.includes('response = await bufferFontResponseExactly(remote, response);'),
  'exact font buffering must remain enabled'
);
assert(mgr.includes('20260822-sj2067-r8.17'), 'R8.13 revision missing');
console.log('R8.13 regression checks passed');
