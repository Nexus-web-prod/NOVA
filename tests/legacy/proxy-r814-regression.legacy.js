const fs = require('fs');
const assert = require('assert');
const mgr = fs.readFileSync('proxy/js/nova-proxy-manager.js','utf8');
const sw = fs.readFileSync('proxy/sw.js','utf8');
const sj = fs.readFileSync('proxy/scramjet/scramjet.js','utf8');

assert(mgr.includes('font-byte-validation') || mgr.includes('font-byte-subtransport'), 'font subtransport/validation path missing');
assert(mgr.includes('primaryTransport: "libcurl"'), 'font subtransport must preserve libcurl as primary');
assert(mgr.includes('if (name === "libcurl" && /^(?:GET|HEAD)$/i.test'), 'font subtransport must be narrowly scoped to libcurl GET/HEAD');
assert(sw.includes('stripProxiedSriFromHtml'), 'R8.14 final HTML SRI sanitizer missing');
assert(!sw.includes('if (!isNavigation || !/\\btext\\/html\\b/i.test(contentType)) return response;'), 'HTML sanitizer must not depend on destination metadata');
assert(sj.includes('"integrity"===(0,n.Qf)(r).toLowerCase()'), 'dynamic integrity setAttribute suppression missing');
assert(sj.includes('removeAttribute",t.this,"scramjet-attr-integrity"'), 'hidden integrity marker cleanup missing');
assert(mgr.includes('20260822-sj2067-r8.17') || sw.includes('20260822-sj2067-r8.17'), 'R8.14 revision missing');
console.log('R8.14 regression checks passed');
