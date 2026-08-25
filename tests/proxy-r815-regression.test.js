const fs = require('fs');
const assert = require('assert');
const sw = fs.readFileSync('proxy/sw.js','utf8');
const mgr = fs.readFileSync('proxy/js/nova-proxy-manager.js','utf8');

assert(sw.includes('if (!isNavigation && !/\\btext\\/html\\b/i.test(contentType)) return response;'), 'navigation HTML must be sanitized regardless of Content-Type metadata');
assert(sw.includes('scramjet-attr-integrity') && sw.includes("return ' integrity=\"\"';"), 'final serialized response must neutralize both SRI forms');
assert(mgr.includes('fontContainerLooksDecoded'), 'font container magic detection missing');
assert(mgr.includes('Boolean(encoding && !decodedContainer)'), 'encoded font responses must preserve Content-Encoding');
const binaryBlock = sw.slice(sw.indexOf('if (isBinaryContentType'), sw.indexOf('if (!isNavigation &&'));
assert(!binaryBlock.includes('headers.delete("content-encoding")'), 'service worker must not blindly remove font Content-Encoding');
console.log('R8.15 regression checks passed');
