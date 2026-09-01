const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const social = fs.readFileSync(path.join(root, 'website/js/social.js'), 'utf8');

test('photo message copy writes an image to the clipboard', () => {
  assert.match(social, /new ClipboardItem\(\{"image\/png":imageMessagePng\(dataUrl\)\}\)/);
  assert.match(social, /msg\.type==="image"\)await copyImageMessage\(msg\.text\)/);
});

test('all Social composers accept pasted clipboard images', () => {
  assert.match(social, /function pastedImage\(event\)/);
  assert.match(social, /input\.addEventListener\("paste"/);
  assert.match(social, /wireAttachmentPaste\(document\.getElementById\("social-everyone-input"\)/);
  assert.match(social, /wireAttachmentPaste\(document\.getElementById\("social-msg-input"\)/);
  assert.match(social, /wireAttachmentPaste\(document\.getElementById\("social-group-msg-input"\)/);
});
