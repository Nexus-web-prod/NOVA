const fs = require('fs');
const worker = fs.readFileSync(require('path').join(__dirname, '..', '_worker.js'), 'utf8');
function must(re, msg) { if (!re.test(worker)) throw new Error(msg); }
must(/SOCIAL_GAME_TTL_MS\s*=\s*2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, '2 hour social-game TTL missing');
for (const table of ['uno_lobbies','checkers_matches','chess_matches','connect4_matches']) {
  must(new RegExp(`cleanupExpiredSocialGames\\(db, ?["']${table}["']\\)`), `creation cleanup missing for ${table}`);
  must(new RegExp(`removeExpiredSocialGame\\([^,]+, ?["']${table}["']`), `lazy expiry missing for ${table}`);
}
must(/l\.updated_at>\?/, 'UNO invite query does not hide expired lobbies');
console.log('social game expiry assertions passed');
