const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "_worker.js"), "utf8");
const social = fs.readFileSync(path.join(root, "website/js/social.js"), "utf8");
const api = fs.readFileSync(path.join(root, "website/js/nova-v7-api.js"), "utf8");
const html = fs.readFileSync(path.join(root, "website/html/index.html"), "utf8");

test("Everyone polls and pins have server-enforced permissions", () => {
  assert.match(worker, /createEveryonePoll\(request, getDb\(env\)\)/);
  assert.match(worker, /setEveryonePin\(request, getDb\(env\)\)/);
  assert.match(worker, /async function createEveryonePoll[\s\S]*?requireRole\(request, db, ADMIN_ROLES\)/);
  assert.match(worker, /async function setEveryonePin[\s\S]*?requireRole\(request, db, ADMIN_ROLES\)/);
  assert.match(worker, /async function endEveryonePoll[\s\S]*?requireRole\(request, db, ADMIN_ROLES\)/);
  assert.match(worker, /async function voteEveryonePoll[\s\S]*?requireSocialUser\(request, db\)/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS social_polls/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS social_channel_pins/);
  assert.match(worker, /bind\(auth\.id, question, "text", now\)/, "polls must respect the original text\/image message type constraint");
  assert.match(worker, /polls\[String\(message\.id\)\].*type: "poll"/, "poll messages must be exposed to the client as polls");
});

test("Everyone chat exposes accessible poll and pin controls", () => {
  assert.match(api, /createEveryonePoll/);
  assert.match(api, /voteEveryonePoll/);
  assert.match(api, /endEveryonePoll/);
  assert.match(api, /pinEveryoneMessage/);
  assert.match(html, /id="social-everyone-poll-btn"[^>]*hidden/);
  assert.match(html, /id="social-everyone-pinned"[^>]*hidden/);
  assert.match(social, /function currentUserIsAdmin/);
  assert.match(social, /function pollBubbleHtml/);
  assert.match(social, /Only admins can create polls/);
  assert.match(social, /data-poll-end/);
});
