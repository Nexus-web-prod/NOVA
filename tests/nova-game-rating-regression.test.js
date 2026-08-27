const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nova = fs.readFileSync(path.join(root, 'website/js/nova.js'), 'utf8');
const detail = fs.readFileSync(path.join(root, 'website/js/nova-game-detail.js'), 'utf8');

assert.equal(nova.includes('nova:rating_sum:'), false, 'Games must not read the obsolete rating sum');
assert.equal(nova.includes('nova:rating_cnt:'), false, 'Games must not read the obsolete rating count');
assert.match(nova, /NovaAPI\.gameStats\(slugs\)/, 'Games must use the authoritative stats API');
assert.match(nova, /schema===2/, 'Games must reject legacy cached rating data');
assert.match(detail, /cache\.schema === 2/, 'Game detail must reject legacy cached rating data');

console.log('Nova game rating regression checks passed.');
