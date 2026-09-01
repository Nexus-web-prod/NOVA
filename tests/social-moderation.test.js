const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const worker = fs.readFileSync(path.join(__dirname, "..", "_worker.js"), "utf8");
const social = fs.readFileSync(path.join(__dirname, "..", "website", "js", "social.js"), "utf8");
const start = worker.indexOf("const MODERATION_MILD_TERMS");
const end = worker.indexOf("async function recordChatModerationEvent", start);
assert.ok(start >= 0 && end > start, "moderation engine was not found in the Worker");

const prelude = `
const MODERATION_VERSION = 3;
const MODERATION_CONFIG = Object.freeze({
  mildProfanityEnabled:true,severeFilterEnabled:true,fuzzyFilterEnabled:true,
  spamShortLimit:4,spamShortWindowMs:4000,spamLongLimit:8,spamLongWindowMs:15000,
  maxMentions:5,crossMessageCount:3,crossMessageWindowMs:10000,
  crossMessageMaxLength:150,stateTtlMs:1800000
});
const moderationUserState = new Map();
`;
const context = { console };
vm.createContext(context);
vm.runInContext(`${prelude}${worker.slice(start, end)}\nthis.api={moderationForms,baseModerationDecision,moderateMessage};`, context);
const { moderationForms, baseModerationDecision, moderateMessage } = context.api;

assert.strictEqual(moderationForms("F.u.C.K!!!").leet, "f u c k");
assert.strictEqual(moderationForms("w\u200bord").normal, "word");
assert.strictEqual(moderationForms("fück").normal, "fuck");

assert.strictEqual(baseModerationDecision("hello everyone").action, "allow");
assert.strictEqual(baseModerationDecision("this assignment is classic").action, "allow");
assert.strictEqual(baseModerationDecision("that was damn close").action, "censor");
assert.strictEqual(baseModerationDecision("what the fuck").displayText, "what the ****");
assert.strictEqual(baseModerationDecision("f.u.c.k").action, "censor");
assert.strictEqual(baseModerationDecision("fuuuuuck").action, "censor");
assert.match(baseModerationDecision("fucckk").displayText, /^\*+$/, "repeated-letter profanity must be masked in the stored display text");
assert.strictEqual(baseModerationDecision("fuuuuuuuuuuuuujjujjuckwdoijda").rule, "character_spam");

const severe = "nigger";
assert.strictEqual(baseModerationDecision(severe).action, "block");
assert.strictEqual(baseModerationDecision("n1gger").action, "block");
assert.strictEqual(baseModerationDecision("nіgger").action, "block");
assert.strictEqual(baseModerationDecision("niggre").action, "block");
assert.strictEqual(baseModerationDecision("n.i.g.g.e.r").action, "block");
assert.strictEqual(baseModerationDecision("please go kill yourself").severity, 5);
assert.strictEqual(baseModerationDecision("@a @b @c @d @e @f hello").rule, "mention_spam");
assert.match(social, /streamAdd\(stream,fields,optimisticEl\)/, "Social sends must accept the optimistic bubble for reconciliation");
assert.match(social, /authoritativeText=String\(a\.message\.body/, "Social must render the server-moderated message body");
assert.match(social, /streamAdd\("nova:stream:everyone",fields,optEl\)/, "Everyone chat must reconcile its optimistic bubble");
assert.match(social, /streamAdd\(dk,fields,optEl\)/, "DM chat must reconcile its optimistic bubble");
assert.match(social, /streamAdd\(groupStreamKey\(gid\),fields,optEl\)/, "Group chat must reconcile its optimistic bubble");
assert.doesNotMatch(worker, /EVERYONE_CHAT_COOLDOWN_MS|EVERYONE_COOLDOWN/, "Everyone chat must not impose a cooldown after every message");
assert.doesNotMatch(worker, /DUPLICATE_MESSAGE/, "a harmless repeated message must use rolling spam limits instead of an immediate database rejection");
assert.match(worker, /persistAutomaticChatTimeout\(db, auth\.id, channel\.kind, moderation\)/, "automatic timeouts must be persisted for Chat Moderation");
assert.match(worker, /id LIKE 'auto_chat_%'/, "automatic restrictions must remain distinguishable from staff actions");
assert.doesNotMatch(social, /startEveryoneCooldown|_everyoneCooldownUntil/, "the client must not impose a cooldown after every message");
assert.match(fs.readFileSync(path.join(__dirname, "..", "website", "html", "index.html"), "utf8"), /social\.js\?v=20260901-social-polls-r2/, "Social moderation client cache key must be current");

(async () => {
  const first = await moderateMessage({ userId:"fragment-user", text:"nig", now:1000 });
  const second = await moderateMessage({ userId:"fragment-user", text:"ger", now:1500 });
  assert.strictEqual(first.action, "allow");
  assert.strictEqual(second.rule, "fragmented_severe_language");

  const helloOne = await moderateMessage({ userId:"duplicate-user", text:"hello", now:2000 });
  const helloTwo = await moderateMessage({ userId:"duplicate-user", text:"hello!", now:5000 });
  const helloThree = await moderateMessage({ userId:"duplicate-user", text:"HELLO", now:8000 });
  const helloFour = await moderateMessage({ userId:"duplicate-user", text:"hello", now:11000 });
  const duplicate = await moderateMessage({ userId:"duplicate-user", text:"hello", now:14000 });
  assert.strictEqual(helloOne.action, "allow");
  assert.strictEqual(helloTwo.action, "allow");
  assert.strictEqual(helloThree.action, "allow");
  assert.strictEqual(helloFour.action, "allow");
  assert.strictEqual(duplicate.rule, "duplicate_spam");

  for (let index = 0; index < 4; index += 1) await moderateMessage({ userId:"burst-user", text:`message ${index}`, now:3000 + index * 100 });
  const burst = await moderateMessage({ userId:"burst-user", text:"message final", now:3500 });
  assert.strictEqual(burst.rule, "rate_spam");

  const severeAttempt = await moderateMessage({ userId:"strike-user", text:severe, now:5000 });
  assert.strictEqual(severeAttempt.timeoutSeconds, 30);
  const timeout = await moderateMessage({ userId:"strike-user", text:"hello", now:5100 });
  assert.strictEqual(timeout.action, "timeout");
  assert.strictEqual(timeout.moderationVersion, 3);
  console.log("social moderation assertions passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
