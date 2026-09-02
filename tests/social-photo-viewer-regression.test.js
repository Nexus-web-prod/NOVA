const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const social = fs.readFileSync(path.join(root, 'website/js/social.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'website/css/nova.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'website/html/index.html'), 'utf8');

test('chat photos open the accessible Nova photo viewer', () => {
  assert.match(social, /function openPhotoViewer\(src,trigger\)/);
  assert.match(social, /setAttribute\("role","dialog"\)/);
  assert.match(social, /const photo=el\.querySelector\("\.social-chat-photo"\)/);
  assert.match(social, /openPhotoViewer\(msg\.text,e\.currentTarget\)/);
  assert.match(html, /social-announcements-r2/);
});

test('photo viewer supports visible and gesture zoom controls', () => {
  assert.match(social, /data-photo-action="zoom-out"/);
  assert.match(social, /data-photo-action="zoom-in"/);
  assert.match(social, /addEventListener\("wheel"/);
  assert.match(social, /pointX-\(pointX-state\.x\)\*ratio/);
  assert.match(social, /zoom\(event\.deltaY<0\?1\.15:1\/1\.15,event\.clientX,event\.clientY\)/);
  assert.match(social, /zoom\(2,event\.clientX,event\.clientY\)/);
  assert.match(social, /zoom\(distance\/state\.lastPinchDistance,midX,midY\)/);
  assert.match(social, /state\.pointers\.size===2/);
  assert.match(social, /event\.key==="Escape"/);
  assert.match(css, /\.social-photo-viewer-controls button\{[^}]*min-width:44px/);
  assert.match(css, /\.social-photo-viewer-stage img\{pointer-events:auto;cursor:inherit\}/);
  assert.match(social, /state\.backgroundPress=event\.target===stage/);
  assert.match(social, /if\(state\.backgroundPress&&!state\.dragged\)close\(\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\).*social-photo-viewer/);
});
