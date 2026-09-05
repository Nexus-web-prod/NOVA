const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const deploy = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy', 'deploy.sh'), 'utf8');

test('All four deploys Production, Dev, Beta, and Main without Void', () => {
  const allFour = deploy.match(/\n  5\)([\s\S]*?)\n    ;;/)?.[1] || '';
  assert.match(allFour, /deploy_production/);
  assert.match(allFour, /deploy_preview dev/);
  assert.match(allFour, /deploy_preview beta/);
  assert.match(allFour, /deploy_preview main/);
  assert.doesNotMatch(allFour, /deploy_preview void/);
});

test('Void remains an explicit separate deployment choice', () => {
  assert.match(deploy, /\n  7\) deploy_preview void ;;/);
  assert.match(deploy, /choose a number from 1 through 7/);
});
