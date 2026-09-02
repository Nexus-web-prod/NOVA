const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "_worker.js"), "utf8");
const api = fs.readFileSync(path.join(root, "website/js/nova-v7-api.js"), "utf8");
const admin = fs.readFileSync(path.join(root, "website/js/nova-v7-admin.js"), "utf8");

test("Chat Moderation exposes a confirmed Announcements-only clear action", () => {
  assert.match(admin, /id="nova-admin-clear-announcements-chat">Clear Announcements/);
  assert.match(admin, /openClearAnnouncementsChatDialog/);
  assert.match(admin, /Audit reason/);
  assert.match(admin, /Everyone chat, direct messages, and groups are not affected/);
  assert.match(api, /adminClearAnnouncementsChat:[\s\S]*?api\/admin\/chat\/announcements\/clear/);
});

test("clearing Announcements is admin-only, audited, and channel-scoped", () => {
  assert.match(worker, /api\/admin\/chat\/announcements\/clear/);
  assert.match(worker, /async function adminClearAnnouncementsChat[\s\S]*?requireRole\(request, db, ADMIN_ROLES\)/);
  assert.match(worker, /UPDATE social_messages SET deleted_at=\? WHERE channel_id='announcements'/);
  assert.match(worker, /chat\.announcements_clear/);
});
