const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'proxy', 'js', 'nova-proxy-manager.js'), 'utf8');
function ok(cond, msg){ if(!cond){ console.error('FAIL:',msg); process.exit(1);} }
ok(src.includes('function isBraveSearchURL'), 'Brave URL classifier exists');
ok(src.includes('if (isBraveSearchURL(requested.href)) return;'), 'compatibility fallback skips Brave');
ok(src.includes('if (isBraveSearchURL(fallbackTarget)) return;'), 'legacy activation aborts for Brave');
ok(src.includes('if (isBraveSearchURL(nextURL))'), 'go() forces Brave modern path');
ok(src.includes('this._returnToModern(nextURL)'), 'legacy Brave navigation returns to modern');
console.log('PASS proxy-brave-scramjet-routing');
