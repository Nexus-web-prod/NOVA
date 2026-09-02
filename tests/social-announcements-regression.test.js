const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "website/html/index.html"), "utf8");
const social = fs.readFileSync(path.join(root, "website/js/social.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "_worker.js"), "utf8");

test("Announcements appears directly above Everyone Chat", () => {
  assert.ok(html.indexOf('id="social-announcements-tab"') < html.indexOf('id="social-everyone-tab"'));
  assert.match(html, /id="social-announcements-panel"/);
});

test("Everyone remains the normal default and unread announcements take priority on entry", () => {
  assert.match(social, /if\(announcementLatest>seen\|\|activePane==="announcements"\)_openAnnouncementsWithMsgs/);
  assert.match(social, /else _openEveryoneWithMsgs\(everyoneMsgs\|\|\[\]\)/);
  assert.match(social, /localStorage\.setItem\(announcementsSeenKey\(\),String\(latest\)\)/);
  assert.doesNotMatch(social, /_socialEntryPending/, "background initialization timing must not consume the unread announcement decision");
});

test("Announcements use the shared message channel with server-side admin-only posting", () => {
  assert.match(worker, /requested === "announcements"/);
  assert.match(worker, /channel\.kind === "announcements" && !auth\.roles\.some\(role => ADMIN_ROLES\.has\(role\)\)/);
  assert.match(worker, /Only Nova admins can post announcements/);
  assert.match(social, /streamAdd\("nova:stream:announcements"/);
});
