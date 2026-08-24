!function(){"use strict";
// ── Nova Social — authenticated Nova 7 API ───────────────────────────────────

// ── Stream ops (direct Supabase) ──────────────────────────────────────────────
async function streamAdd(stream,fields){
  try{
    // Always build a fresh data object (never mutate the input)
    let data={};
    if(Array.isArray(fields)){for(let i=0;i<fields.length-1;i+=2)data[fields[i]]=fields[i+1];}
    else if(fields&&typeof fields==="object"){data=Object.assign({},fields);}
    const a=await NovaAPI.sendMessage({channel:streamToChannel(stream),body:data.text||"",messageType:data.type||"text",replyToId:data.replyToId||null});
    return a&&a.message?String(a.message.id):null;
  }catch(e){console.warn("[nova] streamAdd error",e);throw e;}
}

function normalizeStreamMsg(row){
  const d=row.data||{};
  const msg={_id:String(row.id),ts:Number(d.ts)||row.ts||Date.now(),...d};
  if(d.cid&&!msg._clientId)msg._clientId=String(d.cid);
  if(msg.from)msg.from=String(msg.from).toLowerCase();
  return msg;
}
function msgClientId(msg){return msg&&(msg._clientId||msg.cid)||null;}
async function streamRange(stream,afterId,count){
  try{
    const channel=streamToChannel(stream),a=await NovaAPI.messages(channel,afterId||0),reactionMap=a.reactions||{};
    applyReactionSnapshot(reactionMap,channel);
    return (a.messages||[]).map(m=>({_id:String(m.id),from:m.from,text:m.body,type:m.type||"text",ts:m.createdAt||m.ts,replyToId:m.replyToId,replyFrom:m.replyFrom,replyText:m.replyBody,replyType:m.replyType,avatarUrl:m.avatarUrl,displayName:m.displayName,reactions:reactionMap[String(m.id)]||[],_channel:channel}));
  }catch(e){console.warn("[nova] message load failed",e);return[];}
}

function streamToChannel(stream){
  if(stream==="nova:stream:everyone")return"everyone";
  if(stream.startsWith("nova:stream:group:"))return"group:"+stream.slice("nova:stream:group:".length);
  if(stream.startsWith("nova:stream:dm:")){
    const me=(getAccount()?.username||"").toLowerCase();
    const users=stream.slice("nova:stream:dm:".length).split(":");
    return"dm:"+(users.find(u=>u.toLowerCase()!==me)||users[0]||"");
  }
  return stream;
}

// ── Keys ──────────────────────────────────────────────────────────────────────
function dmKey(a,b){const s=[a,b].sort();return"nova:stream:dm:"+s[0]+":"+s[1]}
function groupStreamKey(gid){return"nova:stream:group:"+gid}

// ── State ─────────────────────────────────────────────────────────────────────
let friends=[],requests=[],groups=[],blockedUsers=[];
const _socialProfiles={};
let activePane="everyone";
let sendLock=false,domWired=false;
let replyTarget=null;
const _seenByPane={};
function _getSeenIds(p){if(!_seenByPane[p])_seenByPane[p]=new Set();return _seenByPane[p]}
let seenIds={has:id=>_getSeenIds(activePane).has(id),add:id=>_getSeenIds(activePane).add(id),delete:id=>_getSeenIds(activePane).delete(id),clear:()=>{if(_seenByPane[activePane])_seenByPane[activePane].clear()}};
let activeGroupId=null;

// Cursor: track last seen stream id per pane for efficient polling
const _cursors={};
function getCursor(pane){return _cursors[pane]||0}
function setCursor(pane,id){_cursors[pane]=parseInt(id)||0}

// ── Everyone cooldown ─────────────────────────────────────────────────────────
let _everyoneCooldownUntil=0,_everyoneCooldownTimer=null;
function startEveryoneCooldown(duration){
  _everyoneCooldownUntil=Math.max(_everyoneCooldownUntil,Date.now()+Math.max(0,Number(duration)||5000));
  clearInterval(_everyoneCooldownTimer);
  const tick=()=>{
    const left=Math.max(0,_everyoneCooldownUntil-Date.now()),seconds=Math.ceil(left/1000);
    const button=document.getElementById("social-everyone-send-btn"),status=document.getElementById("social-everyone-cooldown");
    if(button){button.disabled=left>0;button.classList.toggle("is-cooling",left>0);button.title=left>0?"Ready in "+seconds+" seconds":"Send";}
    if(status){status.textContent=left>0?seconds+"s":"";status.classList.toggle("active",left>0);}
    if(left<=0){clearInterval(_everyoneCooldownTimer);_everyoneCooldownTimer=null;}
  };
  tick();_everyoneCooldownTimer=setInterval(tick,200);
}

// ── polling timers ─────────────────────────────────────────────────────────────
let _chatPollTimer=null,_socialPollTimer=null,_friendsPollTimer=null,_reactionPollTimer=null;
let _friendsPollBusy=false,_socialPollBusy=false,_reactionPollBusy=false;
const _pollLocks={everyone:false,dm:false,group:false};

// ── Visibility-aware poll guard ─────────────────────────────────────────────────
// Stops ALL network polling the moment the tab is hidden (user switched tabs,
// About-Blank mode kicked in, Chromebook screen locked, etc.). Resumes and
// immediately fires one round when the tab becomes visible again.
let _visibilityBound=false;
function _bindVisibility(){
  if(_visibilityBound)return;
  _visibilityBound=true;
  document.addEventListener("visibilitychange",function(){
    if(!document.hidden){
      // Tab just became visible — fire one immediate catch-up round
      const acct=getAccount();
      if(!acct)return;
      _pollFriendsList();
      _pollSocialData();
      if(activePane==="everyone")_pollEveryone();
      else if(activePane.startsWith("group:"))_pollGroup();
      else if(activePane!=="none")_pollDM();
      _pollReactions();
    }
  });
}

// ── Exponential backoff for chat (saves egress on idle convos) ─────────────────
let _chatEmptyStreak=0;
const CHAT_BASE_MS=5000, CHAT_MAX_MS=20000;
let _chatCurrentMs=CHAT_BASE_MS;
function _chatBackoff(hadMessages){
  if(hadMessages){_chatEmptyStreak=0;_chatCurrentMs=CHAT_BASE_MS;}
  else{_chatEmptyStreak=Math.min(_chatEmptyStreak+1,6);_chatCurrentMs=Math.min(CHAT_BASE_MS*Math.pow(1.4,Math.floor(_chatEmptyStreak/2)),CHAT_MAX_MS);}
}

// ── Friend presence polling — near-real-time, lightweight endpoint ──────────────
async function _pollFriendsList(){
  const acct=getAccount();if(!acct||_friendsPollBusy)return;
  _friendsPollBusy=true;
  try{
    let overview;
    try{overview=await NovaAPI.friendPresence();}
    catch(error){overview=await NovaAPI.social();}
    (overview.friends||[]).forEach(p=>{
      const key=p.username.toLowerCase();
      _socialProfiles[key]={...(_socialProfiles[key]||{}),...p};
    });
    const newFriends=(overview.friends||[]).map(r=>r.username);
    const newHash=JSON.stringify((overview.friends||[]).map(r=>[r.username,r.presenceState,r.activityType,r.activityLabel]));
    if(newHash!==_lastFriendsHash){_lastFriendsHash=newHash;friends=newFriends;renderFriendsListDebounced();}
  }catch(e){/* network blip - keep old list */}
  finally{_friendsPollBusy=false;}
}
function startFriendsPolling(){
  stopFriendsPolling();
  _bindVisibility();
  _friendsPollTimer=setInterval(async()=>{
    if(document.hidden||!getAccount())return;
    await _pollFriendsList();
  },15000);
}
function stopFriendsPolling(){clearInterval(_friendsPollTimer);_friendsPollTimer=null;}

// ── Chat polling — 5s base with exponential backoff & visibility guard ──────────
function startChatPolling(){
  stopChatPolling();
  _bindVisibility();
  _chatEmptyStreak=0;_chatCurrentMs=CHAT_BASE_MS;
  startReactionPolling();
  // 800ms initial delay to let render + cursor settle before first poll
  _chatPollTimer=setTimeout(function(){
    function _scheduleNext(){
      _chatPollTimer=setTimeout(async function(){
        if(document.hidden){_scheduleNext();return;}
        let hadMessages=false;
        if(activePane==="everyone")hadMessages=await _pollEveryone();
        else if(activePane.startsWith("group:"))hadMessages=await _pollGroup();
        else if(activePane!=="none")hadMessages=await _pollDM();
        _chatBackoff(!!hadMessages);
        _scheduleNext();
      },_chatCurrentMs);
    }
    _scheduleNext();
  },800);
}
function stopChatPolling(){clearTimeout(_chatPollTimer);_chatPollTimer=null;stopReactionPolling();}

// Reactions stay on a fixed 3-second refresh independent of message backoff.
async function _pollReactions(){
  if(_reactionPollBusy||document.hidden||!getAccount()||activePane==="none")return;
  const channel=currentPaneChannel();
  _reactionPollBusy=true;
  try{
    const result=await NovaAPI.reactions(channel);
    if(currentPaneChannel()===channel)applyReactionSnapshot(result.reactions||{},channel);
  }catch(e){/* keep the last rendered snapshot during a network blip */}
  finally{_reactionPollBusy=false;}
}
function startReactionPolling(){
  stopReactionPolling();
  _pollReactions();
  _reactionPollTimer=setInterval(_pollReactions,3000);
}
function stopReactionPolling(){clearInterval(_reactionPollTimer);_reactionPollTimer=null;}

// ── Typing presence (DMs and groups only) ─────────────────────────────────────
let _typingPollTimer=null,_typingStopTimer=null,_typingLastSent=0;
function typingChannel(){
  if(activePane.startsWith("group:")&&activeGroupId)return"group:"+activeGroupId;
  if(activePane!=="everyone"&&activePane!=="none")return"dm:"+activePane;
  return"";
}
function typingIndicator(){return document.getElementById(activePane.startsWith("group:")?"social-group-typing":"social-dm-typing");}
function renderTyping(users){
  const el=typingIndicator();if(!el)return;
  users=(users||[]).filter(Boolean);
  let text="";
  if(users.length>5)text="5+ people are typing";
  else if(users.length===1)text=users[0]+" is typing";
  else if(users.length===2)text=users[0]+" and "+users[1]+" are typing";
  else if(users.length>2)text=users.slice(0,-1).join(", ")+", and "+users[users.length-1]+" are typing";
  el.textContent=text;el.classList.toggle("active",!!text);
}
async function pollTyping(){
  const channel=typingChannel();if(!channel||document.hidden)return renderTyping([]);
  try{const result=await NovaAPI.typing(channel);if(channel===typingChannel())renderTyping(result.users||[]);}catch{}
}
function startTypingPolling(){
  stopTypingPolling();if(!typingChannel())return;
  pollTyping();_typingPollTimer=setInterval(pollTyping,3000);
}
function stopTypingPolling(){
  clearInterval(_typingPollTimer);_typingPollTimer=null;clearTimeout(_typingStopTimer);_typingStopTimer=null;
  ["social-dm-typing","social-group-typing"].forEach(id=>{const el=document.getElementById(id);if(el){el.textContent="";el.classList.remove("active");}});
}
function signalTyping(){
  const channel=typingChannel();if(!channel)return;
  const now=Date.now();
  if(now-_typingLastSent>1800){_typingLastSent=now;NovaAPI.setTyping(channel,true).catch(()=>{});}
  clearTimeout(_typingStopTimer);_typingStopTimer=setTimeout(()=>NovaAPI.setTyping(channel,false).catch(()=>{}),2800);
}
function clearMyTyping(){
  const channel=typingChannel();clearTimeout(_typingStopTimer);_typingStopTimer=null;
  if(channel)NovaAPI.setTyping(channel,false).catch(()=>{});
}

// ── Request polling — every 15s (friend requests and group invites) ──────────────
function startSocialPolling(){
  stopSocialPolling();
  _bindVisibility();
  _socialPollTimer=setInterval(async()=>{
    if(document.hidden||!getAccount())return;
    await _pollSocialData();
  },15000);
}
function stopSocialPolling(){clearInterval(_socialPollTimer);_socialPollTimer=null;}

// ── Admin / dev list — badge next to names in chat ───────────────────────────
const K_DEVS="nova:admin:devs";
const SOCIAL_ADMIN_BOOT=[];
let _adminSet=null,_adminListTs=0;
async function refreshAdminList(force){
  _adminSet=_adminSet||new Set();_adminListTs=Date.now();
}
function isSocialAdmin(username){if(!username)return false;const u=String(username).toLowerCase();return !!(_socialProfiles[u]&&_socialProfiles[u].staff)||(_adminSet?_adminSet.has(u):SOCIAL_ADMIN_BOOT.includes(u));}
function adminBadgeHtml(username){return isSocialAdmin(username)?'<span class="social-admin-badge" title="Nova admin">admin</span>':"";}
function supernovaBadgeHtml(username){
  if(!username)return "";
  var u=String(username).toLowerCase();
  // Check if user is supernova pro via the tier system's KV list
  var isMe=false;
  try{var acct=JSON.parse(localStorage.getItem('nova_account')||'null');isMe=acct&&acct.username&&acct.username.toLowerCase()===u;}catch(e){}
  if(isMe&&(window._novaIsSupernovaUser||(window.NovaSupernovaTier&&window.NovaSupernovaTier.isPro())))return '<span class="social-supernova-badge" title="Supernova Pro">✦ supernova</span>';
  if(_socialProfiles[u]&&_socialProfiles[u].supernova)return '<span class="social-supernova-badge" title="Supernova Pro">✦ supernova</span>';
  // Check against cached supernova list
  if(window._novaSnUserSet&&window._novaSnUserSet.has(u))return '<span class="social-supernova-badge" title="Supernova Pro">✦ supernova</span>';
  return "";
}
window._novaSnUserSet=window._novaSnUserSet||new Set();
function displayNameWithAdmin(username){return esc(displayName(username))+adminBadgeHtml(username)+supernovaBadgeHtml(username);}

// ── Avatar cache ──────────────────────────────────────────────────────────────
const _avatarCache={};
// ── Batched avatar fetching — queues requests and fires them in a single call ──
const _avatarPending={};
let _avatarBatchTimer=null;
function _flushAvatarBatch(){
  _avatarBatchTimer=null;
  const usernames=Object.keys(_avatarPending);
  if(!usernames.length)return;
  const resolvers={};
  usernames.forEach(u=>{resolvers[u]=_avatarPending[u];delete _avatarPending[u];});
  const needed=usernames.filter(u=>_avatarCache[u]===undefined);
  // Resolve cached ones immediately
  usernames.filter(u=>_avatarCache[u]!==undefined).forEach(u=>resolvers[u].forEach(r=>r(_avatarCache[u])));
  if(!needed.length)return;
  // Batch fetch all uncached avatars in one request
  NovaAPI.publicProfiles(needed).then(data=>{
    _adminSet=_adminSet||new Set();
    const map={};(data.profiles||[]).forEach(r=>{const key=r.username.toLowerCase();map[key]=r.avatarUrl||null;_socialProfiles[key]={...(_socialProfiles[key]||{}),...r};if(r.staff)_adminSet.add(key);else _adminSet.delete(key);if(r.supernova)window._novaSnUserSet.add(key);else window._novaSnUserSet.delete(key);});
    needed.forEach(u=>{
      const av=map[u]||null;
      _avatarCache[u]=av;
      (resolvers[u]||[]).forEach(r=>r(av));
    });
    needed.forEach(u=>{
      document.querySelectorAll('.social-msg-sender[data-np-user="'+u+'"]' ).forEach(sender=>{
        const row=sender.parentElement;if(!row)return;
        row.querySelectorAll('.social-admin-badge,.social-supernova-badge').forEach(badge=>badge.remove());
        sender.insertAdjacentHTML('afterend',adminBadgeHtml(u)+supernovaBadgeHtml(u));
      });
    });
    if(typeof renderFriendsList==='function'){_rflHash='';renderFriendsList();}
    if(activePane&&needed.includes(String(activePane).toLowerCase())){const nameEl=document.getElementById('social-chat-peer-name');if(nameEl)nameEl.innerHTML=displayNameWithAdmin(activePane);}
  }).catch(()=>needed.forEach(u=>{_avatarCache[u]=null;(resolvers[u]||[]).forEach(r=>r(null));}));
}
async function getPeerAvatar(u){
  const lc=u.toLowerCase();
  if(_avatarCache[lc]!==undefined)return _avatarCache[lc];
  try{const acct=JSON.parse(localStorage.getItem('nova_account')||'null');if(acct&&acct.username&&acct.username.toLowerCase()===lc&&acct.avatar&&!acct.avatar.startsWith('__builtin__')){_avatarCache[lc]=acct.avatar;return acct.avatar;}}catch{}
  return new Promise(resolve=>{
    if(!_avatarPending[lc])_avatarPending[lc]=[];
    _avatarPending[lc].push(resolve);
    if(!_avatarBatchTimer)_avatarBatchTimer=setTimeout(_flushAvatarBatch,30);
  });
}
function avatarHtml(u,size){size=size||"100%";const c=_avatarCache[u.toLowerCase()];if(c)return'<img src="'+esc(c)+'" style="width:'+size+';height:'+size+';object-fit:cover;border-radius:50%;display:block;" onerror="this.parentNode.textContent=\''+esc(u.charAt(0).toUpperCase())+'\'"/>';return esc(u.charAt(0).toUpperCase())}
function applyAvatarToEl(el,u){getPeerAvatar(u).then(av=>{if(!av||!el.isConnected)return;el.innerHTML='<img src="'+esc(av)+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.parentNode.textContent=\''+esc(u.charAt(0).toUpperCase())+'\'"/>';});}

// ── Nameplate system ──────────────────────────────────────────────────────────
// Maps nameplate IDs to text color + glow for the sender name in messages
const _NAMEPLATE_STYLES={
  nameplate_purple:{color:'#c0c0ff',textShadow:'0 0 8px rgba(139,143,255,0.9), 0 0 2px rgba(139,143,255,0.6)'},
  nameplate_cyan:{color:'#80ffdd',textShadow:'0 0 8px rgba(78,204,163,0.9), 0 0 2px rgba(78,204,163,0.6)'},
  nameplate_gold:{color:'#ffe066',textShadow:'0 0 8px rgba(245,197,24,0.9), 0 0 2px rgba(245,197,24,0.6)'},
  nameplate_crimson:{color:'#ffaaaa',textShadow:'0 0 8px rgba(248,113,113,0.9), 0 0 2px rgba(248,113,113,0.6)'},
  nameplate_rainbow:{color:null,textShadow:'none',rainbow:true},
  nameplate_galaxy:{color:'#e8c0ff',textShadow:'0 0 10px rgba(192,132,252,1), 0 0 3px rgba(192,132,252,0.7)',animation:'nova-galaxy-pulse 2s ease-in-out infinite'},
};
// Apply nameplate color effect directly to a sender name element
function applyNameplateToEl(el,u){
  getPeerNameplate(u).then(np=>{
    if(!el.isConnected)return;
    const s=np?_NAMEPLATE_STYLES[np]:null;
    if(s){
      if(s.rainbow){
        // Rainbow: animated gradient text
        el.style.background='linear-gradient(90deg,#f87171,#f5c518,#4ecca3,#8b8fff,#c084fc)';
        el.style.webkitBackgroundClip='text';
        el.style.webkitTextFillColor='transparent';
        el.style.backgroundClip='text';
        el.style.backgroundSize='200% auto';
        el.style.animation='nova-rainbow-border 3s linear infinite';
        el.style.color='';
        el.style.textShadow='none';
      }else{
        el.style.background='';
        el.style.webkitBackgroundClip='';
        el.style.webkitTextFillColor='';
        el.style.backgroundClip='';
        el.style.backgroundSize='';
        el.style.color=s.color;
        el.style.textShadow=s.textShadow;
        el.style.animation=s.animation||'';
      }
    }else{
      el.style.background='';
      el.style.webkitBackgroundClip='';
      el.style.webkitTextFillColor='';
      el.style.backgroundClip='';
      el.style.backgroundSize='';
      el.style.color='';
      el.style.textShadow='';
      el.style.animation='';
    }
  });
}
// Apply nameplate color as a tinted border + subtle glow to the message bubble
const _NAMEPLATE_BUBBLE={
  nameplate_purple:{border:'1px solid rgba(139,143,255,0.38)',boxShadow:'0 0 8px rgba(139,143,255,0.15)'},
  nameplate_cyan:{border:'1px solid rgba(78,204,163,0.38)',boxShadow:'0 0 8px rgba(78,204,163,0.15)'},
  nameplate_gold:{border:'1px solid rgba(245,197,24,0.38)',boxShadow:'0 0 8px rgba(245,197,24,0.15)'},
  nameplate_crimson:{border:'1px solid rgba(248,113,113,0.38)',boxShadow:'0 0 8px rgba(248,113,113,0.15)'},
  nameplate_rainbow:{border:'1px solid transparent',boxShadow:'none',rainbow:true},
  nameplate_galaxy:{border:'1px solid rgba(192,132,252,0.38)',boxShadow:'0 0 10px rgba(192,132,252,0.18)'},
};
function applyNameplateToBubble(bubbleEl,u){
  getPeerNameplate(u).then(np=>{
    if(!bubbleEl.isConnected)return;
    const s=np?_NAMEPLATE_BUBBLE[np]:null;
    if(s){
      if(s.rainbow){
        bubbleEl.style.border='1px solid transparent';
        bubbleEl.style.backgroundImage='linear-gradient(rgba(255,255,255,0.05),rgba(255,255,255,0.05)),linear-gradient(90deg,rgba(248,113,113,0.5),rgba(245,197,24,0.5),rgba(78,204,163,0.5),rgba(139,143,255,0.5),rgba(192,132,252,0.5))';
        bubbleEl.style.backgroundOrigin='border-box';
        bubbleEl.style.backgroundClip='padding-box,border-box';
        bubbleEl.style.boxShadow='none';
      }else{
        bubbleEl.style.border=s.border;
        bubbleEl.style.boxShadow=s.boxShadow;
        bubbleEl.style.backgroundImage='';
        bubbleEl.style.backgroundOrigin='';
        bubbleEl.style.backgroundClip='';
      }
    }
  });
}
// Nameplate cache: username -> nameplate ID or null
const _nameplateCache={};
const _nameplatePending={};
let _nameplateBatchTimer=null;
function _flushNameplateBatch(){
  _nameplateBatchTimer=null;
  const usernames=Object.keys(_nameplatePending);if(!usernames.length)return;
  const resolvers={};
  usernames.forEach(u=>{resolvers[u]=_nameplatePending[u];delete _nameplatePending[u];});
  const needed=usernames.filter(u=>_nameplateCache[u]===undefined);
  usernames.filter(u=>_nameplateCache[u]!==undefined).forEach(u=>resolvers[u].forEach(r=>r(_nameplateCache[u])));
  if(!needed.length)return;
  needed.forEach(u=>{_nameplateCache[u]=null;(resolvers[u]||[]).forEach(r=>r(null));});
}
function getPeerNameplate(u){
  const lc=u.toLowerCase();
  if(_nameplateCache[lc]!==undefined)return Promise.resolve(_nameplateCache[lc]);
  // Check self from localStorage first
  try{
    const acct=JSON.parse(localStorage.getItem('nova_account')||'null');
    if(acct&&acct.username&&acct.username.toLowerCase()===lc){
      const eq=JSON.parse(localStorage.getItem('nova_shop_equipped')||'{}');
      const np=eq.nameplate||null;_nameplateCache[lc]=np;return Promise.resolve(np);
    }
  }catch{}
  return new Promise(resolve=>{
    if(!_nameplatePending[lc])_nameplatePending[lc]=[];
    _nameplatePending[lc].push(resolve);
    if(!_nameplateBatchTimer)_nameplateBatchTimer=setTimeout(_flushNameplateBatch,30);
  });
}
// Called by nova-shop.js after equip/unequip to sync nameplate to Supabase KV
window._novaSyncMyNameplate=async function(){
  const acct=getAccount();if(!acct)return;
  const eq=JSON.parse(localStorage.getItem('nova_shop_equipped')||'{}');
  _nameplateCache[acct.username.toLowerCase()]=eq.nameplate||null;
};
// ── Helpers ───────────────────────────────────────────────────────────────────
function getAccount(){try{const a=JSON.parse(localStorage.getItem("nova_account")||"null");if(a&&!a.username){localStorage.removeItem("nova_account");return null;}return a;}catch{return null;}}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function setReply(msg){
  replyTarget=msg;const bar=document.getElementById("nova-reply-bar");if(!bar)return;
  const preview=msg.type==="image"?"📷 Photo":esc(msg.text).substring(0,80)+(msg.text.length>80?"…":"");
  bar.innerHTML='<div class="nova-reply-bar-inner"><span class="nova-reply-label">↩ Replying to <strong>'+esc(msg.from)+'</strong></span><span class="nova-reply-preview">'+preview+'</span></div><button class="nova-reply-cancel" id="nova-reply-cancel-btn">✕</button>';
  bar.style.display="flex";document.getElementById("nova-reply-cancel-btn")?.addEventListener("click",clearReply);
}
function clearReply(){replyTarget=null;const bar=document.getElementById("nova-reply-bar");if(bar)bar.style.display="none";}
function fmtTime(ts){return new Date(Number(ts)).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function toast(msg,dur){if(typeof window.toast==="function")return window.toast(msg,dur);const el=document.createElement("div");el.textContent=msg;el.style.cssText="position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:rgba(12,12,28,.95);border:1px solid rgba(139,143,255,.25);border-radius:100px;color:#c8c8d8;font-family:Space Mono,monospace;font-size:.52rem;padding:.45rem 1.1rem;z-index:99999;pointer-events:none;transition:opacity .3s;";document.body.appendChild(el);setTimeout(()=>{el.style.opacity="0";setTimeout(()=>el.remove(),300)},dur||2200)}

let _evPhotoInput=null,_dmPhotoInput=null,_grpPhotoInput=null;
let _evCameraInput=null,_dmCameraInput=null,_grpCameraInput=null;
async function prepareImageFile(file){
  if(!file||!file.type.startsWith("image/"))throw new Error("Choose an image file");
  if(file.size>10485760)throw new Error("Image must be under 10 MB");
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Nova could not read that image"));img.src=url;});
    const canvas=document.createElement("canvas");let data="";
    for(const maxSide of [1280,1024,800,640]){
      const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext("2d",{alpha:true});ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.8,.65,.5,.4]){data=canvas.toDataURL("image/webp",quality);if(data.length<=120000)break;}
      if(data.length<=120000)break;
    }
    if(!/^data:image\/(?:webp|jpeg|png);base64,/.test(data)||data.length>125000)throw new Error("Image is still too large after compression");
    return data;
  }finally{URL.revokeObjectURL(url);}
}
async function handleImageFile(file,acceptCb){
  try{toast("Preparing image…");await acceptCb(await prepareImageFile(file));}
  catch(error){toast(error.message||"Could not prepare image");}
}
function makeFileInput(acceptCb,camera){
  const inp=document.createElement("input");
  inp.type="file";inp.accept="image/*";inp.style.cssText="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;";
  if(camera)inp.setAttribute("capture","environment");
  inp.addEventListener("change",()=>{
    const f=inp.files[0];inp.value="";if(!f)return;
    handleImageFile(f,acceptCb);
  });
  document.body.appendChild(inp);return inp;
}

let _attachmentInteractionCount=0;
function beginAttachmentInteraction(){
  _attachmentInteractionCount+=1;
  document.body.classList.add("social-attachment-active");
  let released=false;
  return ()=>{
    if(released)return;
    released=true;
    _attachmentInteractionCount=Math.max(0,_attachmentInteractionCount-1);
    if(!_attachmentInteractionCount)document.body.classList.remove("social-attachment-active");
  };
}
function openFilePicker(input){
  const release=beginAttachmentInteraction();let pickerBlurred=false;
  const cleanup=()=>{
    window.removeEventListener("blur",onBlur);
    window.removeEventListener("focus",onFocus);
    input.removeEventListener("change",onChange);
    input.removeEventListener("cancel",onCancel);
    setTimeout(release,180);
  };
  const onBlur=()=>{pickerBlurred=true;};
  const onFocus=()=>{if(pickerBlurred)cleanup();};
  const onChange=()=>cleanup();
  const onCancel=()=>cleanup();
  window.addEventListener("blur",onBlur);
  window.addEventListener("focus",onFocus);
  input.addEventListener("change",onChange,{once:true});
  input.addEventListener("cancel",onCancel,{once:true});
  input.value="";
  try{input.click();}catch(error){cleanup();throw error;}
}
function stopCameraStream(stream){if(stream)stream.getTracks().forEach(track=>track.stop());}
async function openCameraCapture(fallbackInput,acceptCb){
  if(!navigator.mediaDevices?.getUserMedia)return openFilePicker(fallbackInput);
  const releaseInteraction=beginAttachmentInteraction();
  document.querySelector(".social-camera-overlay")?.remove();
  const overlay=document.createElement("div");overlay.className="social-camera-overlay";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-label","Take photo");
  overlay.innerHTML='<div class="social-camera-panel"><div class="social-camera-header"><strong>Take photo</strong><button type="button" class="social-camera-close" aria-label="Close camera">&times;</button></div><div class="social-camera-preview"><video autoplay muted playsinline></video><div class="social-camera-loading">Starting camera…</div></div><div class="social-camera-actions"><button type="button" class="social-camera-cancel">Cancel</button><button type="button" class="social-camera-shutter" disabled><span></span>Capture</button></div></div>';
  overlay.addEventListener("pointerdown",event=>event.stopPropagation());overlay.addEventListener("click",event=>event.stopPropagation());document.body.appendChild(overlay);
  const video=overlay.querySelector("video"),shutter=overlay.querySelector(".social-camera-shutter"),loading=overlay.querySelector(".social-camera-loading");let stream=null;
  const close=()=>{stopCameraStream(stream);overlay.remove();releaseInteraction();};
  overlay.querySelector(".social-camera-close").onclick=close;overlay.querySelector(".social-camera-cancel").onclick=close;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    if(!overlay.isConnected)return stopCameraStream(stream);
    video.srcObject=stream;await video.play();loading.hidden=true;shutter.disabled=false;
  }catch(error){close();toast(error?.name==="NotAllowedError"?"Camera permission was not allowed":"Camera is unavailable on this device");return;}
  shutter.onclick=async()=>{
    shutter.disabled=true;
    try{
      const canvas=document.createElement("canvas");canvas.width=video.videoWidth||1280;canvas.height=video.videoHeight||720;canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
      const photo=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",.9));if(!photo)throw new Error("Nova could not capture that photo");
      close();await handleImageFile(photo,acceptCb);
    }catch(error){shutter.disabled=false;toast(error.message||"Could not take photo");}
  };
}

let _attachmentOutsideHandler=null;
function closeAttachmentMenu(){
  document.querySelector(".social-attachment-menu")?.remove();
  document.querySelectorAll(".social-attach-btn.menu-open").forEach(btn=>{btn.classList.remove("menu-open");btn.setAttribute("aria-expanded","false");});
  if(_attachmentOutsideHandler){document.removeEventListener("pointerdown",_attachmentOutsideHandler,true);_attachmentOutsideHandler=null;}
}
function openAttachmentMenu(button,fileInput,cameraInput,acceptCb){
  closeAttachmentMenu();button.classList.add("menu-open");button.setAttribute("aria-expanded","true");
  const menu=document.createElement("div");menu.className="social-attachment-menu";menu.setAttribute("role","menu");
  menu.innerHTML='<button type="button" data-attach="upload"><span class="social-attachment-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span><span><strong>Upload photo</strong><small>Choose from this device</small></span></button><button type="button" data-attach="camera"><span class="social-attachment-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span><span><strong>Take photo</strong><small>Open your camera</small></span></button>';
  menu.addEventListener("pointerdown",event=>event.stopPropagation());menu.addEventListener("click",event=>event.stopPropagation());document.body.appendChild(menu);
  const rect=button.getBoundingClientRect();menu.style.left=Math.max(10,Math.min(innerWidth-230,rect.left))+'px';menu.style.bottom=Math.max(10,innerHeight-rect.top+8)+'px';
  menu.querySelector('[data-attach="upload"]').onclick=()=>{closeAttachmentMenu();openFilePicker(fileInput);};
  menu.querySelector('[data-attach="camera"]').onclick=()=>{closeAttachmentMenu();openCameraCapture(cameraInput,acceptCb);};
  setTimeout(()=>{
    _attachmentOutsideHandler=event=>{if(!menu.contains(event.target)&&!button.contains(event.target))closeAttachmentMenu();};
    document.addEventListener("pointerdown",_attachmentOutsideHandler,true);
  },0);
}
const _attachmentDropTargets=[];let _globalAttachmentDropWired=false;
function activeAttachmentDropTarget(){return _attachmentDropTargets.find(target=>target.guard()&&target.wrap.isConnected&&target.surface.getClientRects().length>0&&getComputedStyle(target.surface).display!=="none");}
function attachmentDragSupported(dataTransfer){
  const types=Array.from(dataTransfer?.types||[]),items=Array.from(dataTransfer?.items||[]);
  return types.includes("Files")||types.includes("text/uri-list")||types.includes("text/html")||items.some(item=>item.kind==="file");
}
function showAttachmentDrop(target){
  if(!target)return;target.wrap.classList.add("social-drop-active");
  if(!target.wrap.querySelector(".social-drop-zone")){const zone=document.createElement("div");zone.className="social-drop-zone";zone.innerHTML='<span class="social-drop-plus">+</span><strong>Drop image to send</strong><small>Nova will resize it automatically</small>';target.wrap.appendChild(zone);}
}
function hideAttachmentDrops(){_attachmentDropTargets.forEach(target=>{target.wrap.classList.remove("social-drop-active");target.wrap.querySelector(".social-drop-zone")?.remove();});}
function droppedImageUrl(dataTransfer){
  const html=dataTransfer?.getData("text/html")||"";
  if(html){try{const src=new DOMParser().parseFromString(html,"text/html").querySelector("img")?.src;if(src)return src;}catch{}}
  return (dataTransfer?.getData("text/uri-list")||"").split(/\r?\n/).find(line=>line&&!line.startsWith("#"))||"";
}
async function handleDroppedImage(file,url,acceptCb){
  if(file){if(!file.type.startsWith("image/"))return toast("Drop an image file");return handleImageFile(file,acceptCb);}
  if(!url)return toast("Drop an image file");
  if(/^data:image\//i.test(url)){try{return await handleImageFile(await (await fetch(url)).blob(),acceptCb);}catch(error){return toast(error.message||"Could not send image");}}
  if(!/^(https?:|blob:)/i.test(url))return toast("Drop an image file");
  try{const response=await fetch(url);if(!response.ok)throw new Error();const blob=await response.blob();if(!blob.type.startsWith("image/"))throw new Error();await handleImageFile(blob,acceptCb);}
  catch{toast("That site blocked the image. Download it, then drop the file.");}
}
function wireAttachmentDrop(wrap,acceptCb,guard){
  if(!wrap||wrap.dataset.dropWired)return;wrap.dataset.dropWired="1";
  _attachmentDropTargets.push({wrap,acceptCb,guard,surface:wrap.closest(".social-chat-inner,.social-everyone-panel")||wrap});
  if(_globalAttachmentDropWired)return;_globalAttachmentDropWired=true;
  document.addEventListener("dragenter",event=>{if(!attachmentDragSupported(event.dataTransfer))return;const target=activeAttachmentDropTarget();if(!target)return;event.preventDefault();event.stopPropagation();showAttachmentDrop(target);},true);
  document.addEventListener("dragover",event=>{if(!attachmentDragSupported(event.dataTransfer))return;const target=activeAttachmentDropTarget();if(!target)return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="copy";showAttachmentDrop(target);},true);
  document.addEventListener("dragleave",event=>{if(!event.relatedTarget)hideAttachmentDrops();},true);
  document.addEventListener("dragend",hideAttachmentDrops,true);
  document.addEventListener("drop",event=>{const target=activeAttachmentDropTarget();if(!target||!attachmentDragSupported(event.dataTransfer))return;event.preventDefault();event.stopPropagation();const file=Array.from(event.dataTransfer?.files||[]).find(item=>item.type.startsWith("image/"))||Array.from(event.dataTransfer?.items||[]).map(item=>item.kind==="file"?item.getAsFile():null).find(item=>item?.type.startsWith("image/"));const url=droppedImageUrl(event.dataTransfer);hideAttachmentDrops();handleDroppedImage(file,url,target.acceptCb);},true);
}
function wireAttachmentButton(buttonId,wrapId,fileInput,cameraInput,acceptCb,guard){
  const button=document.getElementById(buttonId),wrap=document.getElementById(wrapId);if(!button)return;
  button.addEventListener("click",()=>{if(!guard())return;openAttachmentMenu(button,fileInput,cameraInput,acceptCb);});
  wireAttachmentDrop(wrap,acceptCb,guard);
}

// ── Unread badge ──────────────────────────────────────────────────────────────
let _unreadBadgeHash="";
function updateUnreadBadge(){
  const el=document.getElementById("social-unread-badge");if(!el)return;
  const dmTotal=friends.reduce((s,f)=>s+parseInt(localStorage.getItem("nova:social:unread:"+f)||"0"),0);
  const grpTotal=groups.reduce((s,g)=>s+parseInt(localStorage.getItem("nova:social:grpunread:"+g.id)||"0"),0);
  const total=dmTotal+grpTotal;
  const _ubh=String(total);if(_ubh===_unreadBadgeHash&&el.textContent===_ubh)return;_unreadBadgeHash=_ubh;
  el.style.display=total>0?"":"none";el.textContent=total>99?"99+":String(total);
}

// ── Panel switch ──────────────────────────────────────────────────────────────
function showPane(which){
  const evPanel=document.getElementById("social-everyone-panel");
  const chatPanel=document.getElementById("social-chat-inner");
  const groupPanel=document.getElementById("social-group-chat-inner");
  const noChat=document.getElementById("social-no-chat");
  const isGroup=which.startsWith("group:");
  const isDM=which!=="everyone"&&which!=="none"&&!isGroup;
  if(evPanel)evPanel.style.display=which==="everyone"?"flex":"none";
  if(chatPanel){chatPanel.style.display=isDM?"flex":"none";chatPanel.style.flexDirection="column";}
  if(groupPanel){groupPanel.style.display=isGroup?"flex":"none";groupPanel.style.flexDirection="column";}
  if(noChat)noChat.style.display=which==="none"?"flex":"none";
  document.getElementById("social-everyone-tab")?.classList.toggle("active",which==="everyone");
}

// ── Friends list render ───────────────────────────────────────────────────────
let groupInvites=[];
// hash of last rendered friends list — skip DOM write if nothing changed
let _rflHash="";
function renderFriendsList(){
  const listEl=document.getElementById("social-friends-list");
  const emptyEl=document.getElementById("social-friends-empty");
  const reqLabel=document.getElementById("social-requests-label");
  const reqList=document.getElementById("social-requests-list");
  if(!listEl)return;
  const q=(document.getElementById("social-friend-search")?.value||"").toLowerCase();
  const filtered=friends.filter(f=>f.toLowerCase().includes(q));
  const filteredGroups=groups.filter(g=>(g.name||"").toLowerCase().includes(q)||!q);

  // Build a lightweight hash — if nothing the user can see changed, skip the DOM entirely
  const unreadSnap=filtered.map(f=>localStorage.getItem("nova:social:unread:"+f)||"0").join(",");
  const grpUnreadSnap=filteredGroups.map(g=>localStorage.getItem("nova:social:grpunread:"+g.id)||"0").join(",");
  const presenceSnap=filtered.map(f=>_socialProfiles[f.toLowerCase()]?.presenceState||"offline").join(",");
  const profileSnap=filtered.map(f=>{const p=_socialProfiles[f.toLowerCase()]||{};return[p.displayName||"",p.bio||"",p.statusText||"",p.role||"",p.supernova?"supernova":"free"];}).join("|");
  const hash=filtered.join("|")+"/"+filteredGroups.map(g=>g.id+g.name).join("|")+"/"+activePane+"/"+unreadSnap+"/"+grpUnreadSnap+"/"+requests.join(",")+"/"+presenceSnap+"/"+profileSnap+"/"+q;
  if(hash===_rflHash){updateUnreadBadge();return;}
  _rflHash=hash;

  if(emptyEl)emptyEl.style.display=(filtered.length===0&&filteredGroups.length===0)?"flex":"none";

  // Build new nodes in a fragment — single reflow
  const frag=document.createDocumentFragment();
  filtered.forEach(f=>{
    const unread=parseInt(localStorage.getItem("nova:social:unread:"+f)||"0");
    const active=activePane===f;
    const el=document.createElement("div");
    el.className="social-friend-item"+(active?" active":"")+(unread>0?" has-unread":"");
    el.dataset.username=f;
    const avHtml=avatarHtml(f);
    const profile=_socialProfiles[f.toLowerCase()]||{};
    const presence=profile.presenceState||"offline";
    const presenceClass=presence==="online"?" is-online":(presence==="idle"?" is-idle":"");
    const presenceLabel=presence==="online"?"Online":(presence==="idle"?"Idle":"Offline");
    const bio=String(profile.bio||"").trim();
    el.innerHTML='<div class="social-friend-avatar'+presenceClass+'">'+avHtml+'</div><div class="social-friend-copy"><div class="social-friend-primary"><div class="social-friend-name">'+displayNameWithAdmin(f)+'</div>'+(bio?'<div class="social-friend-bio" title="'+esc(bio)+'">'+esc(bio)+'</div>':'')+'</div><div class="social-friend-presence '+presence+'">'+presenceLabel+"</div></div>"+(unread>0?'<div class="social-friend-unread">'+(unread>99?"99+":unread)+"</div>":"");
    const avEl=el.querySelector(".social-friend-avatar");
    if(avEl&&!_avatarCache[f.toLowerCase()])applyAvatarToEl(avEl,f);
    el.addEventListener("click",()=>openDM(f));
    frag.appendChild(el);
  });
  if(filteredGroups.length>0){
    const label=document.createElement("div");
    label.className="social-groups-section-label";
    label.innerHTML='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Groups';
    frag.appendChild(label);
    filteredGroups.forEach(g=>{
      const unread=parseInt(localStorage.getItem("nova:social:grpunread:"+g.id)||"0");
      const active=activePane==="group:"+g.id;
      const memberCount=Array.isArray(g.members)?g.members.length:(Number(g.memberCount)||0);
      const el=document.createElement("div");
      el.className="social-friend-item social-group-item"+(active?" active":"")+(unread>0?" has-unread":"");
      el.innerHTML='<div class="social-friend-avatar" style="font-size:.55rem;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div class="social-friend-copy"><div class="social-friend-name">'+esc(g.name||"Group")+'</div><div class="social-friend-presence">'+memberCount+' member'+(memberCount===1?'':'s')+'</div></div>'+(unread>0?'<div class="social-friend-unread">'+(unread>99?"99+":unread)+"</div>":"");
      el.title=memberCount+" members";
      el.addEventListener("click",()=>openGroup(g.id));
      frag.appendChild(el);
    });
  }
  // Swap in one paint — remove old items, append new fragment
  listEl.querySelectorAll(".social-friend-item,.social-groups-section-label").forEach(el=>el.remove());
  listEl.appendChild(frag);

  if(reqLabel)reqLabel.style.display=requests.length>0?"flex":"none";
  const badge=reqLabel?.querySelector(".social-req-count-badge");if(badge)badge.textContent=requests.length;
  if(reqList){
    reqList.innerHTML="";
    requests.forEach(from=>{
      const el=document.createElement("div");el.className="social-request-item";
      el.dataset.username=from;
      el.innerHTML='<div class="social-request-from">'+esc(from)+'</div><div class="social-request-actions"><button class="social-req-btn accept">Accept</button><button class="social-req-btn decline">Decline</button></div>';
      el.querySelector(".accept").addEventListener("click",()=>acceptRequest(from));
      el.querySelector(".decline").addEventListener("click",()=>declineRequest(from));
      reqList.appendChild(el);
    });
  }
  renderGroupInvites();
  updateUnreadBadge();
}
// Debounced version — collapses rapid-fire calls (e.g. 3 poll callbacks at once) into one render
let _rflDebTimer=null;
function renderFriendsListDebounced(){
  if(_rflDebTimer)return;
  _rflDebTimer=setTimeout(()=>{_rflDebTimer=null;renderFriendsList();},60);
}

// ── Load social data (friends/requests/groups/invites) ────────────────────────
let _lastRequestsHash="",_lastFriendsHash="";
async function loadSocial(){
  const acct=getAccount();if(!acct)return;
  const [overview,everyoneMsgs]=await Promise.all([NovaAPI.social(),streamRange("nova:stream:everyone",0,200)]);
  (overview.friends||[]).forEach(p=>{_socialProfiles[p.username.toLowerCase()]=p;if(p.avatarUrl)_avatarCache[p.username.toLowerCase()]=p.avatarUrl;});
  _adminSet=new Set((overview.friends||[]).filter(p=>p.staff).map(p=>p.username.toLowerCase()));
  if(window.__novaV7User?.staff)_adminSet.add(window.__novaV7User.username.toLowerCase());
  friends=(overview.friends||[]).map(r=>r.username);
  requests=(overview.incoming||[]).map(r=>r.username);
  _lastRequestsHash=JSON.stringify(requests);
  _lastFriendsHash=JSON.stringify((overview.friends||[]).map(r=>[r.username,r.presenceState,r.activityType,r.activityLabel]));
  groups=overview.groups||[];
  blockedUsers=overview.blocked||[];
  groupInvites=(overview.groupInvites||[]).map(r=>({gid:r.id,name:r.name,from:r.fromUsername,ts:r.createdAt}));
  renderFriendsList();
  // Use the already-fetched messages — no second round trip
  _openEveryoneWithMsgs(everyoneMsgs||[]);
}

// ── Live friend-request and group-invite polling ──────────────────────────────
async function _pollSocialData(){
  const acct=getAccount();if(!acct||_socialPollBusy)return;
  _socialPollBusy=true;
  try{
    const overview=await NovaAPI.socialRequests();
    const newReqs=(overview.incoming||[]).map(r=>r.username);
    const newReqHash=JSON.stringify(newReqs);
    if(newReqHash!==_lastRequestsHash){_lastRequestsHash=newReqHash;requests=newReqs;renderFriendsListDebounced();}
    const newInvites=(overview.groupInvites||[]).map(r=>({gid:r.id,name:r.name,from:r.fromUsername,ts:r.createdAt}));
    if(JSON.stringify(newInvites)!==JSON.stringify(groupInvites)){groupInvites=newInvites;renderFriendsListDebounced();}
  }catch(e){/* network blip - keep old requests */}
  finally{_socialPollBusy=false;}
}

// ── Message rendering ─────────────────────────────────────────────────────────
function dateSep(ts){const d=new Date(Number(ts)),now=new Date();if(d.toDateString()===now.toDateString())return"Today";if(d.toDateString()===new Date(Date.now()-86400000).toDateString())return"Yesterday";return d.toLocaleDateString(undefined,{month:"short",day:"numeric"})}
const MESSAGE_REACTIONS=["❤️","👍","😂","😮","😢","🔥"];
let _reactionPicker=null,_reactionOutsideHandler=null;
function currentPaneChannel(){
  if(activePane==="everyone")return"everyone";
  if(activePane.startsWith("group:"))return activePane;
  return"dm:"+activePane.toLowerCase();
}
function closeReactionPicker(){
  if(_reactionPicker)_reactionPicker.remove();
  _reactionPicker=null;document.body.classList.remove("social-reaction-active");
  if(_reactionOutsideHandler){document.removeEventListener("pointerdown",_reactionOutsideHandler,true);_reactionOutsideHandler=null;}
}
function renderReactionChips(el,msg){
  const wrap=el.querySelector(".social-msg-reactions");if(!wrap)return;
  const reactions=Array.isArray(msg.reactions)?msg.reactions.filter(item=>item&&item.count>0):[];
  wrap.innerHTML="";
  reactions.forEach(item=>{
    const chip=document.createElement("button");chip.type="button";chip.className="social-msg-reaction-chip"+(item.mine?" mine":"");
    chip.setAttribute("aria-label",(item.mine?"Remove ":"Add ")+item.emoji+" reaction");
    chip.innerHTML='<span class="social-msg-reaction-emoji">'+esc(item.emoji)+'</span><span class="social-msg-reaction-count">'+Number(item.count)+"</span>";
    chip.addEventListener("click",event=>{event.stopPropagation();toggleMessageReaction(msg,item.emoji,el);});wrap.appendChild(chip);
  });
}
function applyReactionSnapshot(snapshot,channel){
  document.querySelectorAll(".social-msg[data-stream-id]").forEach(el=>{
    if(el.dataset.reactionChannel!==channel)return;
    const msg=el._novaMessage;if(!msg)return;
    if(msg._reactionBackup)return;
    msg.reactions=Array.isArray(snapshot[String(el.dataset.streamId)])?snapshot[String(el.dataset.streamId)]:[];
    renderReactionChips(el,msg);
  });
}
async function toggleMessageReaction(msg,emoji,el){
  const messageId=el.dataset.streamId,channel=el.dataset.reactionChannel||msg._channel||currentPaneChannel();
  if(!messageId)return toast("Wait for the message to finish sending");
  const backup=(msg.reactions||[]).map(item=>({...item})),optimistic=backup.map(item=>({...item}));msg._reactionBackup=backup;
  const current=optimistic.find(item=>item.emoji===emoji);
  if(current){current.count=Math.max(0,current.count+(current.mine?-1:1));current.mine=!current.mine;}
  else optimistic.push({emoji,count:1,mine:true});
  msg.reactions=optimistic.filter(item=>item.count>0);renderReactionChips(el,msg);closeReactionPicker();
  try{const result=await NovaAPI.toggleReaction(channel,messageId,emoji);msg.reactions=result.reactions||[];renderReactionChips(el,msg);}
  catch(error){msg.reactions=(msg._reactionBackup||[]);renderReactionChips(el,msg);toast(error.message||"Could not react");}
  finally{delete msg._reactionBackup;}
}
function openReactionPicker(button,msg,el){
  closeReactionPicker();document.body.classList.add("social-reaction-active");
  const picker=document.createElement("div");picker.className="social-reaction-picker";picker.setAttribute("role","menu");picker.setAttribute("aria-label","Choose a reaction");
  MESSAGE_REACTIONS.forEach((emoji,index)=>{const choice=document.createElement("button");choice.type="button";choice.setAttribute("role","menuitem");choice.setAttribute("aria-label","React with "+emoji);choice.textContent=emoji;choice.style.setProperty("--reaction-index",index);choice.addEventListener("click",event=>{event.stopPropagation();toggleMessageReaction(msg,emoji,el);});picker.appendChild(choice);});
  picker.addEventListener("pointerdown",event=>event.stopPropagation());picker.addEventListener("click",event=>event.stopPropagation());document.body.appendChild(picker);_reactionPicker=picker;
  const rect=button.getBoundingClientRect(),pickerWidth=picker.offsetWidth||238,pickerHeight=picker.offsetHeight||48;
  picker.style.left=Math.max(10,Math.min(innerWidth-pickerWidth-10,rect.left+rect.width/2-pickerWidth/2))+"px";
  picker.style.top=(rect.top>pickerHeight+16?rect.top-pickerHeight-8:rect.bottom+8)+"px";
  setTimeout(()=>{if(_reactionPicker!==picker)return;_reactionOutsideHandler=event=>{if(!picker.contains(event.target)&&event.target!==button)closeReactionPicker();};document.addEventListener("pointerdown",_reactionOutsideHandler,true);},0);
}
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&_reactionPicker)closeReactionPicker();});
async function copyPlainText(text){
  if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return;}catch{}}
  const area=document.createElement("textarea");area.value=text;area.style.cssText="position:fixed;opacity:0;pointer-events:none";document.body.appendChild(area);area.select();const copied=document.execCommand("copy");area.remove();if(!copied)throw new Error("Could not copy message");
}
function imageMessagePng(dataUrl){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{
      try{
        const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
        const context=canvas.getContext("2d");if(!context)return reject(new Error("Could not copy photo"));
        context.drawImage(image,0,0);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Could not copy photo")),"image/png");
      }catch(error){reject(error);}
    };
    image.onerror=()=>reject(new Error("Could not read photo"));image.src=dataUrl;
  });
}
function copyImageMessageFallback(dataUrl){
  const handler=event=>{
    event.preventDefault();
    event.clipboardData.setData("text/html",'<img src="'+esc(dataUrl)+'" alt="Nova photo">');
    event.clipboardData.setData("text/plain",dataUrl);
  };
  document.addEventListener("copy",handler,{once:true});
  const copied=document.execCommand("copy");
  if(!copied){document.removeEventListener("copy",handler);throw new Error("Photo copying is not supported in this browser");}
}
async function copyImageMessage(dataUrl){
  if(navigator.clipboard?.write&&window.ClipboardItem){
    // Start the write during the click gesture. Chromium can reject it if image
    // decoding finishes first and the user-activation window has expired.
    try{
      await navigator.clipboard.write([new ClipboardItem({"image/png":imageMessagePng(dataUrl)})]);
      return;
    }catch(error){
      try{copyImageMessageFallback(dataUrl);return;}catch{throw error;}
    }
  }
  copyImageMessageFallback(dataUrl);
}
async function copyMessage(msg,button){
  try{if(msg.type==="image")await copyImageMessage(msg.text);else await copyPlainText(msg.text||"");button.classList.add("is-copied");button.setAttribute("aria-label","Copied");toast(msg.type==="image"?"Photo copied":"Message copied");setTimeout(()=>{button.classList.remove("is-copied");button.setAttribute("aria-label","Copy message");},1100);}
  catch(error){toast(error.message||"Could not copy message");}
}
function messageActionsHtml(){
  return '<div class="social-msg-actions" role="toolbar" aria-label="Message actions"><button type="button" class="social-msg-action" data-message-action="reply" title="Reply" aria-label="Reply"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg></button><button type="button" class="social-msg-action" data-message-action="react" title="React" aria-label="React"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg></button><button type="button" class="social-msg-action" data-message-action="copy" title="Copy message" aria-label="Copy message"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg></button></div>';
}
function openSocialUno(lobbyId){
  window.NovaSocialCheckersNative?.stop();
  const shell=document.getElementById("social-game-shell");
  const chatArea=document.getElementById("social-chat-area");
  if(!shell)return;
  // Games is a first-class Social view. Do not depend on a delayed animation
  // frame to make the surface visible; that could leave the whole chat pane blank.
  shell.hidden=false;
  shell.style.display="flex";
  shell.style.opacity="1";
  shell.style.transform="none";
  shell.classList.add("open");
  chatArea?.classList.add("social-game-active");
  document.getElementById("page-social")?.classList.add("social-game-open");
  document.getElementById("social-games-tab")?.classList.add("active");
  document.getElementById("social-game-picker")?.setAttribute("hidden","");
  document.getElementById("checkers-surface")?.setAttribute("hidden","");
  const title=document.getElementById("social-game-title");if(title)title.textContent="UNO TABLE";
  const id=String(lobbyId||"").trim();
  if(id)window.NovaSocialUnoNative?.openLobby(id);
  else window.NovaSocialUnoNative?.reset();
}
function openSocialGamePicker(){openSocialUno("");document.getElementById("social-game-picker")?.removeAttribute("hidden");const title=document.getElementById("social-game-title");if(title)title.textContent="GAME ROOM";}
function openSocialCheckers(matchId){openSocialUno("");document.getElementById("social-game-picker")?.setAttribute("hidden","");document.getElementById("checkers-surface")?.removeAttribute("hidden");const title=document.getElementById("social-game-title");if(title)title.textContent="CHECKERS";const id=String(matchId||"").trim();if(id)window.NovaSocialCheckersNative?.openMatch(id);else window.NovaSocialCheckersNative?.showHome();}
function closeSocialUno(){
  window.NovaSocialCheckersNative?.stop();
  const shell=document.getElementById("social-game-shell");
  const chatArea=document.getElementById("social-chat-area");
  if(!shell)return;
  shell.classList.remove("open");
  shell.hidden=true;
  shell.style.removeProperty("display");
  shell.style.removeProperty("opacity");
  shell.style.removeProperty("transform");
  chatArea?.classList.remove("social-game-active");
  document.getElementById("page-social")?.classList.remove("social-game-open");
  document.getElementById("social-games-tab")?.classList.remove("active");
}
window.NovaSocialGames={open:openSocialGamePicker,openUno:openSocialUno,openCheckers:openSocialCheckers,close:closeSocialUno};

function makeMsg(msg,mine,showSender){
  const el=document.createElement("div");
  el.className="social-msg "+(mine?"mine":"theirs");
  el.tabIndex=0;msg._channel=msg._channel||currentPaneChannel();el.dataset.reactionChannel=msg._channel;el._novaMessage=msg;
  if(msg._clientId)el.dataset.clientId=msg._clientId;
  if(msg._id)el.dataset.streamId=msg._id;
  let sender="";
  if(showSender){
    const senderKey=String(msg.from||"").toLowerCase();
    const ownAccount=mine?getAccount():null;
    const knownAvatar=msg.avatarUrl||ownAccount?.avatarUrl||ownAccount?.avatar;
    if(senderKey&&knownAvatar&&!String(knownAvatar).startsWith("__builtin__"))_avatarCache[senderKey]=knownAvatar;
    const avHtml=avatarHtml(msg.from);
    sender='<div class="social-msg-sender-row" style="display:flex;align-items:center;gap:.3rem;margin-bottom:.15rem;"><div class="social-msg-avatar" style="width:18px;height:18px;min-width:18px;border-radius:50%;background:var(--glass-bg-h);display:flex;align-items:center;justify-content:center;font-size:.45rem;overflow:hidden;">'+avHtml+'</div><div style="display:flex;align-items:center;gap:.25rem;flex-wrap:wrap;overflow:visible;"><div class="social-msg-sender" data-np-user="'+esc((msg.from||'').toLowerCase())+'">'+esc(displayName(msg.from||'?'))+'</div>'+adminBadgeHtml(msg.from||'')+supernovaBadgeHtml(msg.from||'')+"</div></div>";
  }
  let replyCtx="";
  if(msg.replyFrom&&msg.replyText){
    const rPreview=msg.replyType==="image"?"📷 Photo":esc(msg.replyText).substring(0,60)+(msg.replyText.length>60?"…":"");
    replyCtx='<div class="social-msg-reply-ctx"><span class="social-msg-reply-ctx-name">'+esc(msg.replyFrom)+'</span><span class="social-msg-reply-ctx-text">'+rPreview+"</span></div>";
  }
  const time='<div class="social-msg-time">'+fmtTime(msg.ts)+"</div>";
  let bubble="";
  const unoMatch=msg.type==="text"&&String(msg.text||"").match(/^\[\[NOVA_UNO:([A-Za-z0-9_-]+)\]\]$/);
  const checkersMatch=msg.type==="text"&&String(msg.text||"").match(/^\[\[NOVA_CHECKERS:([A-Za-z0-9_-]+)\]\]$/);
  if(unoMatch){
    bubble='<div class="social-msg-bubble social-uno-invite"><div class="social-uno-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div><div class="social-uno-copy"><small>NOVA TABLE</small><strong>UNO</strong><span>'+(mine?'Invites sent — your table is ready.':'You were invited to play.')+'</span></div><button class="social-uno-join" type="button" data-social-uno-lobby="'+esc(unoMatch[1])+'">'+(mine?'Open':'Join')+' table<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>';
  }else if(checkersMatch){
    bubble='<div class="social-msg-bubble social-uno-invite social-checkers-invite"><div class="social-checkers-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="social-uno-copy"><small>NOVA MATCH</small><strong>CHECKERS</strong><span>'+(mine?'Challenge sent — the board is ready.':'You were challenged to a match.')+'</span></div><button class="social-uno-join" type="button" data-social-checkers-match="'+esc(checkersMatch[1])+'">'+(mine?'Open':'Play')+' match<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>';
  }else if(msg.type==="image"){
    bubble='<div class="social-msg-bubble social-msg-bubble--img"><img src="'+esc(msg.text)+'" alt="photo" class="social-chat-photo" loading="lazy"></div>';
  }else{
    bubble='<div class="social-msg-bubble">'+esc(msg.text)+"</div>";
  }
  el.innerHTML=sender+replyCtx+'<div class="social-msg-main">'+bubble+messageActionsHtml()+'</div><div class="social-msg-reactions"></div>'+time;
  el.querySelector("[data-social-uno-lobby]")?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openSocialUno(e.currentTarget.dataset.socialUnoLobby);});
  el.querySelector("[data-social-checkers-match]")?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openSocialCheckers(e.currentTarget.dataset.socialCheckersMatch);});
  el.querySelector('[data-message-action="reply"]')?.addEventListener("click",e=>{
    e.stopPropagation();setReply({_id:el.dataset.streamId||null,from:msg.from,text:msg.text,type:msg.type||"text"});
    const inp=document.getElementById(activePane.startsWith("group:")?"social-group-msg-input":"social-msg-input")||document.getElementById("social-everyone-input");
    inp?.focus();
  });
  el.querySelector('[data-message-action="react"]')?.addEventListener("click",e=>{e.stopPropagation();openReactionPicker(e.currentTarget,msg,el);});
  el.querySelector('[data-message-action="copy"]')?.addEventListener("click",e=>{e.stopPropagation();copyMessage(msg,e.currentTarget);});
  renderReactionChips(el,msg);
  if(showSender&&msg.from&&!_avatarCache[msg.from.toLowerCase()]){
    const avEl=el.querySelector(".social-msg-avatar");if(avEl)applyAvatarToEl(avEl,msg.from);
  }
  if(showSender){
    const npEl=el.querySelector(".social-msg-sender[data-np-user]");
    const bubbleEl=el.querySelector(".social-msg-bubble");
    // Defer nameplate styling to next idle moment — avoids blocking paint on Chromebooks
    if(npEl||bubbleEl){
      const _from=msg.from;
      requestAnimationFrame(()=>{
        if(npEl&&npEl.isConnected)applyNameplateToEl(npEl,_from);
        if(bubbleEl&&bubbleEl.isConnected)applyNameplateToBubble(bubbleEl,_from);
      });
    }
  }
  return el;
}

async function startUnoFromSocial(button){
  const acct=getAccount();if(!acct)return toast("Sign in to start UNO");
  const group=activePane.startsWith("group:");
  if(!group&&(activePane==="everyone"||activePane==="none"))return;
  button.disabled=true;button.classList.add("is-loading");
  try{
    const payload=group?{kind:"group",groupId:activeGroupId}:{kind:"dm",username:activePane};
    const data=await NovaAPI.request("/api/boardgames/uno/social-invite",{method:"POST",body:payload});
    const marker="[[NOVA_UNO:"+data.lobby.id+"]]";
    const channel=group?groupStreamKey(activeGroupId):dmKey(acct.username.toLowerCase(),activePane.toLowerCase());
    const sid=await streamAdd(channel,{from:acct.username.toLowerCase(),text:marker,ts:String(Date.now()),type:"text",cid:uid()});
    if(!sid)throw new Error("The table was created, but its chat invite could not be sent");
    const container=document.getElementById(group?"social-group-messages":"social-messages");
    if(container){container.appendChild(makeMsg({_id:sid,from:acct.username.toLowerCase(),text:marker,ts:Date.now(),type:"text"},true,group));container.scrollTop=container.scrollHeight;}
    toast("UNO table created — invites sent");openSocialUno(data.lobby.id);
  }catch(error){toast(error.message||"Could not start UNO");}
  finally{button.disabled=false;button.classList.remove("is-loading");}
}
async function startCheckersFromSocial(button){
  const acct=getAccount();if(!acct)return toast("Sign in to start Checkers");
  if(activePane==="everyone"||activePane==="none"||activePane.startsWith("group:"))return toast("Open a friend chat to play Checkers");
  button.disabled=true;button.classList.add("is-loading");
  try{
    const data=await NovaAPI.request("/api/boardgames/checkers/social-invite",{method:"POST",body:{username:activePane}});
    const marker="[[NOVA_CHECKERS:"+data.match.id+"]]",channel=dmKey(acct.username.toLowerCase(),activePane.toLowerCase());
    const sid=await streamAdd(channel,{from:acct.username.toLowerCase(),text:marker,ts:String(Date.now()),type:"text",cid:uid()});
    if(!sid)throw new Error("The match was created, but its chat invite could not be sent");
    const container=document.getElementById("social-messages");if(container){container.appendChild(makeMsg({_id:sid,from:acct.username.toLowerCase(),text:marker,ts:Date.now(),type:"text"},true,false));container.scrollTop=container.scrollHeight;}
    toast("Checkers challenge sent");openSocialCheckers(data.match.id);
  }catch(error){toast(error.message||"Could not start Checkers");}
  finally{button.disabled=false;button.classList.remove("is-loading");}
}
function emptyState(txt){return'<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:.6rem;opacity:.35;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><div style="font-family:\'Space Mono\',monospace;font-size:.5rem;color:var(--muted);">'+txt+"</div></div>"}
function renderMessages(msgs,containerId,showSender){
  closeReactionPicker();
  const acct=getAccount();const el=document.getElementById(containerId);if(!el)return;
  el.innerHTML="";seenIds.clear();
  if(!msgs||!msgs.length){el.innerHTML=emptyState(showSender?"Be first to say something!":"Start the conversation");return;}
  const frag=document.createDocumentFragment();let lastDate=null;
  msgs.forEach(msg=>{
    const ds=dateSep(msg.ts);
    if(ds!==lastDate){lastDate=ds;const sep=document.createElement("div");sep.className="social-date-sep";sep.innerHTML="<span>"+ds+"</span>";frag.appendChild(sep);}
    const _from=(msg.from||'').toLowerCase();
    // System broadcast — render as announcement banner, not a chat bubble
    if(msg._system||_from==='[nova]'||_from===''){
      const ann=document.createElement('div');
      ann.className='social-broadcast-msg';
      ann.innerHTML='<span class="social-broadcast-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.5c0-2.8-2.2-5-5-5s-5 2.2-5 5v7c0 2.8 2.2 5 5 5s5-2.2 5-5v-7z"/><path d="M12 8.5H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h9"/><line x1="12" y1="12" x2="12" y2="12"/><path d="M6 15v3"/></svg></span><span class="social-broadcast-text">'+esc(msg.text||'')+'</span>';
      frag.appendChild(ann);
      if(msg._id)seenIds.add(msg._id);
      return;
    }
    const mine=acct&&_from===acct.username.toLowerCase();
    const cid=msgClientId(msg);
    if(cid&&!msg._clientId)msg._clientId=cid;
    frag.appendChild(makeMsg(msg,mine,showSender));
    if(msg._id)seenIds.add(msg._id);
    if(cid)seenIds.add(cid);
  });
  el.appendChild(frag);el.scrollTop=el.scrollHeight;
}
function _msgAlreadyInDom(el,msg){
  if(!el||!msg)return false;
  if(msg._id){
    if(el.querySelector('[data-stream-id="'+CSS.escape(String(msg._id))+'"]'))return true;
  }
  const cid=msgClientId(msg);
  if(cid&&el.querySelector('[data-client-id="'+CSS.escape(cid)+'"]'))return true;
  return false;
}
function appendMessages(msgs,containerId,showSender){
  const acct=getAccount();const el=document.getElementById(containerId);
  if(!el||!msgs.length)return;
  // Pre-warm avatars for new senders in batch (async, will update avatars when resolved)
  if(showSender){const newSenders=[...new Set(msgs.filter(m=>m.from&&!m._system).map(m=>m.from.toLowerCase()).filter(u=>_avatarCache[u]===undefined))];if(newSenders.length)Promise.all(newSenders.map(u=>getPeerAvatar(u)));}

  const atBottom=el.scrollHeight-el.scrollTop-el.clientHeight<80;
  if(el.querySelector('div[style*="opacity:.35"]'))el.innerHTML="";
  const frag=document.createDocumentFragment();
  msgs.forEach(msg=>{
    const cid=msgClientId(msg);
    if(msg._id&&seenIds.has(msg._id))return;
    if(_msgAlreadyInDom(el,msg))return;
    // System broadcast
    if(msg._system||(msg.from||'').toLowerCase()==='[nova]'||(!msg.from&&msg.text)){
      const ann=document.createElement('div');
      ann.className='social-broadcast-msg';
      ann.innerHTML='<span class="social-broadcast-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.5c0-2.8-2.2-5-5-5s-5 2.2-5 5v7c0 2.8 2.2 5 5 5s5-2.2 5-5v-7z"/><path d="M12 8.5H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h9"/><line x1="12" y1="12" x2="12" y2="12"/><path d="M6 15v3"/></svg></span><span class="social-broadcast-text">'+esc(msg.text||'')+'</span>';
      frag.appendChild(ann);
      if(msg._id)seenIds.add(msg._id);
      return;
    }
    if(cid&&seenIds.has(cid)){
      const ex=el.querySelector('[data-client-id="'+CSS.escape(cid)+'"]');
      if(ex&&msg._id){ex.dataset.streamId=msg._id;seenIds.add(msg._id);}
      return;
    }
    // Skip system/broadcast messages here — handled earlier in the flow
    if(msg._system||(msg.from||'').toLowerCase()==='[nova]'||!(msg.from||'').trim()){return;}
    const mine=acct&&msg.from.toLowerCase()===acct.username.toLowerCase();
    if(cid&&!msg._clientId)msg._clientId=cid;
    frag.appendChild(makeMsg(msg,mine,showSender));
    if(msg._id)seenIds.add(msg._id);
    if(cid)seenIds.add(cid);
  });
  el.appendChild(frag);if(atBottom)el.scrollTop=el.scrollHeight;
}

// ── Everyone chat ─────────────────────────────────────────────────────────────
function _openEveryoneWithMsgs(msgs){
  activePane="everyone";activeGroupId=null;seenIds.clear();
  stopTypingPolling();
  // Chromebook perf: hint compositor to promote scroll container
  const _msgCont=document.getElementById("social-everyone-messages");
  if(_msgCont){_msgCont.style.willChange="transform";_msgCont.style.contain="content";}
  renderFriendsList();showPane("everyone");
  if(msgs.length)setCursor("everyone",msgs[msgs.length-1]._id);
  // Render immediately, then kick off avatar batch async (they'll fill in)
  renderMessages(msgs,"social-everyone-messages",true);
  if(msgs.length){const uniq=[...new Set(msgs.filter(m=>m.from&&!m._system&&m.from!=='[NOVA]').map(m=>m.from.toLowerCase()))];Promise.all(uniq.map(u=>getPeerAvatar(u))).then(()=>renderFriendsList());}
  startChatPolling();
}
async function openEveryone(){
  activePane="everyone";activeGroupId=null;seenIds.clear();
  document.dispatchEvent(new CustomEvent("nova:social-pane-opened",{detail:{pane:"everyone"}}));
  renderFriendsList();showPane("everyone");
  const msgs=await streamRange("nova:stream:everyone",0,200);
  _openEveryoneWithMsgs(msgs);
}
async function _pollEveryone(){
  if(activePane!=="everyone"||_pollLocks.everyone)return false;
  _pollLocks.everyone=true;
  try{
    const cur=getCursor("everyone");
    const msgs=await streamRange("nova:stream:everyone",cur,50);
    if(msgs.length){setCursor("everyone",msgs[msgs.length-1]._id);appendMessages(msgs,"social-everyone-messages",true);return true;}
    return false;
  }catch(e){console.warn("[nova] everyone poll error",e);return false;}
  finally{_pollLocks.everyone=false;}
}

// ── DM chat ───────────────────────────────────────────────────────────────────
async function openDM(peer){
  const acct=getAccount();if(!acct)return;
  activePane=peer;activeGroupId=null;seenIds.clear();
  document.dispatchEvent(new CustomEvent("nova:social-pane-opened",{detail:{pane:peer}}));
  renderFriendsList();
  const me=acct.username.toLowerCase();
  // Clear unread
  localStorage.setItem("nova:social:unread:"+peer,"0");updateUnreadBadge();
  const avatarEl=document.getElementById("social-chat-peer-avatar");
  const nameEl=document.getElementById("social-chat-peer-name");
  const bioEl=document.getElementById("social-chat-peer-bio");
  if(avatarEl){avatarEl.textContent=peer.charAt(0).toUpperCase();applyAvatarToEl(avatarEl,peer);}
  if(nameEl)nameEl.innerHTML=displayNameWithAdmin(peer);
  if(nameEl)nameEl.dataset.username=peer.toLowerCase();
  let profile=_socialProfiles[peer.toLowerCase()]||null;
  try{const result=await NovaAPI.publicProfile(peer);profile=result?.profile||result?.user||result||{};_socialProfiles[peer.toLowerCase()]=profile;}catch{profile=profile||{};}
  if(bioEl){const bio=String(profile?.bio||"").trim();bioEl.textContent=bio;bioEl.title=bio;bioEl.hidden=!bio;}
  showPane(peer);
  const dk=dmKey(me,peer.toLowerCase());
  const msgs=await streamRange(dk,0,200);
  if(msgs.length){
    setCursor("dm:"+peer,msgs[msgs.length-1]._id);
    await getPeerAvatar(peer); // pre-warm peer avatar
  }
  renderMessages(msgs,"social-messages",false);
  startChatPolling();startTypingPolling();
}
async function _pollDM(){
  const acct=getAccount();
  if(!acct||activePane==="everyone"||activePane==="none"||activePane.startsWith("group:"))return false;
  if(_pollLocks.dm)return false;
  _pollLocks.dm=true;
  try{
    const me=acct.username.toLowerCase(),peer=activePane.toLowerCase();
    const cur=getCursor("dm:"+peer);
    const msgs=await streamRange(dmKey(me,peer),cur,50);
    if(msgs.length){
      setCursor("dm:"+peer,msgs[msgs.length-1]._id);
      appendMessages(msgs,"social-messages",false);
      localStorage.setItem("nova:social:unread:"+activePane,"0");updateUnreadBadge();
      return true;
    }
    return false;
  }catch(e){return false;}
  finally{_pollLocks.dm=false;}
}

// ── Group chat ────────────────────────────────────────────────────────────────
async function openGroup(gid){
  const acct=getAccount();if(!acct)return;
  activePane="group:"+gid;activeGroupId=gid;seenIds.clear();
  startTypingPolling();
  document.dispatchEvent(new CustomEvent("nova:social-pane-opened",{detail:{pane:"group:"+gid}}));
  localStorage.setItem("nova:social:grpunread:"+gid,"0");updateUnreadBadge();renderFriendsList();
  const info=groups.find(g=>g.id===gid)||{name:"Group",memberCount:0};
  const members=[];
  const name=info.name||"Group";
  const nameEl=document.getElementById("social-group-chat-name");
  const membersEl=document.getElementById("social-group-chat-members");
  if(nameEl)nameEl.textContent=name;
  if(membersEl)membersEl.textContent=(info.memberCount||members.length)+" members";
  showPane("group:"+gid);
  const msgs=await streamRange(groupStreamKey(gid),0,200);
  if(msgs.length){
    setCursor("group:"+gid,msgs[msgs.length-1]._id);
    const uniq=[...new Set(msgs.filter(m=>m.from&&!m._system).map(m=>m.from.toLowerCase()))];
    await Promise.all(uniq.map(u=>getPeerAvatar(u)));
  }
  renderMessages(msgs,"social-group-messages",true);
  startChatPolling();
}
async function _pollGroup(){
  const acct=getAccount();if(!acct||!activeGroupId||!activePane.startsWith("group:"))return false;
  if(_pollLocks.group)return false;
  _pollLocks.group=true;
  try{
    const gid=activeGroupId;const cur=getCursor("group:"+gid);
    const msgs=await streamRange(groupStreamKey(gid),cur,50);
    if(msgs.length){
      setCursor("group:"+gid,msgs[msgs.length-1]._id);
      appendMessages(msgs,"social-group-messages",true);
      localStorage.setItem("nova:social:grpunread:"+gid,"0");updateUnreadBadge();
      return true;
    }
    return false;
  }catch(e){return false;}
  finally{_pollLocks.group=false;}
}

// ── Create group ──────────────────────────────────────────────────────────────
async function createGroup(name,memberUsernames){
  const acct=getAccount();if(!acct)return{ok:false,msg:"Not signed in"};
  try{const data=await NovaAPI.createGroup(name,memberUsernames);groups.push(data.group);renderFriendsList();return{ok:true,gid:data.group.id};}
  catch(error){return{ok:false,msg:error.message};}
}

// ── Accept group invite ───────────────────────────────────────────────────────
async function acceptGroupInvite(gid){
  const acct=getAccount();if(!acct)return{ok:false,msg:"Not signed in"};
  const invite=groupInvites.find(i=>i.gid===gid);
  try{await NovaAPI.respondGroup(gid,"accept");}catch(error){return{ok:false,msg:error.message};}
  groupInvites=groupInvites.filter(i=>i.gid!==gid);
  if(!groups.find(g=>g.id===gid))groups.push({id:gid,name:invite?.name||"Group"});
  renderFriendsList();
  return{ok:true,name:invite?.name||"Group"};
}

// ── Decline group invite ──────────────────────────────────────────────────────
async function declineGroupInvite(gid){
  const acct=getAccount();if(!acct)return{ok:false};
  try{await NovaAPI.respondGroup(gid,"decline");}catch(error){return{ok:false,msg:error.message};}
  groupInvites=groupInvites.filter(i=>i.gid!==gid);renderFriendsList();
  return{ok:true};
}

// ── Group invites render ──────────────────────────────────────────────────────
function renderGroupInvites(){
  const container=document.getElementById("social-group-invites-list");
  const label=document.getElementById("social-group-invites-label");
  if(!container)return;
  if(!groupInvites.length){if(label)label.style.display="none";container.innerHTML="";return;}
  if(label)label.style.display="flex";
  container.innerHTML="";
  groupInvites.forEach(inv=>{
    const el=document.createElement("div");el.className="social-request-item";
    el.innerHTML='<div class="social-request-from" style="font-size:.48rem">📬 <strong>'+esc(inv.from)+'</strong> invited you to <strong>'+esc(inv.name)+'</strong></div><div class="social-request-actions"><button class="social-req-btn accept" data-gid="'+esc(inv.gid)+'">Join</button><button class="social-req-btn decline" data-gid="'+esc(inv.gid)+'">Decline</button></div>';
    el.querySelector(".accept").addEventListener("click",async()=>{const res=await acceptGroupInvite(inv.gid);if(res.ok){toast("Joined "+res.name+"!");}else toast(res.msg||"Failed");});
    el.querySelector(".decline").addEventListener("click",async()=>{await declineGroupInvite(inv.gid);toast("Invite declined");});
    container.appendChild(el);
  });
}

// ── Add member to group ───────────────────────────────────────────────────────
async function addMemberToGroup(gid,newMember){
  const acct=getAccount();if(!acct)return{ok:false,msg:"Not signed in"};
  const nm=newMember.toLowerCase();
  try{await NovaAPI.inviteGroup(gid,nm);return{ok:true,invited:true};}
  catch(error){return{ok:false,msg:error.message};}
}

// ── Leave group ───────────────────────────────────────────────────────────────
async function leaveGroup(gid){
  const acct=getAccount();if(!acct)return;
  try{await NovaAPI.leaveGroup(gid);}catch(error){return toast(error.message);}
  groups=groups.filter(g=>g.id!==gid);
  activePane="everyone";activeGroupId=null;
  toast("Left group");renderFriendsList();openEveryone();
}

// ── Filters ───────────────────────────────────────────────────────────────────
// ── Send helpers ──────────────────────────────────────────────────────────────
function showSendError(error){
  if(error?.code==="EVERYONE_COOLDOWN")startEveryoneCooldown(error.retryAfterMs||5000);
  toast(error?.message||"Nova could not send that message",4200);
}
async function sendEveryone(text,type){
  type=type||"text";const acct=getAccount();if(!acct)return toast("Sign in to chat");
  if(sendLock||Date.now()<_everyoneCooldownUntil)return;
  sendLock=true;const cid=uid(),me=acct.username.toLowerCase();
  const rt=replyTarget;clearReply();
  const msg={_clientId:cid,from:me,text,ts:Date.now(),type,...(rt?{replyFrom:rt.from,replyText:rt.text,replyType:rt.type}:{})};
  const container=document.getElementById("social-everyone-messages");let optEl=null;
  if(container){if(container.querySelector('div[style*="opacity:.35"]'))container.innerHTML="";optEl=makeMsg(msg,true,true);container.appendChild(optEl);container.scrollTop=container.scrollHeight;seenIds.add(cid);}
  try{
    const fields={from:me,text,ts:String(msg.ts),type,cid,...(rt?{replyToId:rt._id||null,replyFrom:rt.from,replyText:rt.text.substring(0,200),replyType:rt.type}:{})};
    const sid=await streamAdd("nova:stream:everyone",fields);
    if(sid){setCursor("everyone",sid);seenIds.add(sid);if(optEl)optEl.dataset.streamId=sid;startEveryoneCooldown(5000);}else{if(optEl)optEl.remove();seenIds.delete(cid);toast("Send failed");}
  }catch(error){if(optEl)optEl.remove();seenIds.delete(cid);const input=document.getElementById("social-everyone-input");if(type==="text"&&input&&!input.value)input.value=text;showSendError(error);}
  finally{sendLock=false;}
}

async function sendDM(){
  const acct=getAccount();if(!acct||activePane==="everyone"||activePane==="none"||activePane.startsWith("group:"))return;
  if(sendLock)return;
  const inputEl=document.getElementById("social-msg-input");
  const text=inputEl?.value?.trim();if(!text)return;
  clearMyTyping();sendLock=true;if(inputEl)inputEl.value="";
  const me=acct.username.toLowerCase(),peer=activePane.toLowerCase();
  const cid=uid();const rt=replyTarget;clearReply();
  const msg={_clientId:cid,from:me,text,ts:Date.now(),type:"text",...(rt?{replyFrom:rt.from,replyText:rt.text,replyType:rt.type}:{})};
  const container=document.getElementById("social-messages");let optEl=null;
  if(container){if(container.querySelector('div[style*="opacity:.35"]'))container.innerHTML="";optEl=makeMsg(msg,true,false);container.appendChild(optEl);container.scrollTop=container.scrollHeight;seenIds.add(cid);}
  try{
    const dk=dmKey(me,peer);
    const fields={from:me,text,ts:String(msg.ts),type:"text",cid,...(rt?{replyToId:rt._id||null,replyFrom:rt.from,replyText:rt.text.substring(0,200),replyType:rt.type}:{})};
    const sid=await streamAdd(dk,fields);
    if(sid){
      setCursor("dm:"+peer,sid);
      seenIds.add(sid);
      if(optEl)optEl.dataset.streamId=sid;
    }else{if(optEl)optEl.remove();seenIds.delete(cid);if(inputEl)inputEl.value=text;toast("Send failed");}
  }catch(error){if(optEl)optEl.remove();seenIds.delete(cid);if(inputEl)inputEl.value=text;showSendError(error);}
  finally{sendLock=false;}
}

async function sendDMPhoto(dataUrl){
  const acct=getAccount();if(!acct||activePane==="everyone"||activePane==="none"||activePane.startsWith("group:"))return;
  if(sendLock)return;sendLock=true;
  const me=acct.username.toLowerCase(),peer=activePane.toLowerCase();
  const cid=uid();
  const msg={_clientId:cid,from:me,text:dataUrl,ts:Date.now(),type:"image"};
  const container=document.getElementById("social-messages");let optEl=null;
  if(container){if(container.querySelector('div[style*="opacity:.35"]'))container.innerHTML="";optEl=makeMsg(msg,true,false);container.appendChild(optEl);container.scrollTop=container.scrollHeight;seenIds.add(cid);}
  try{
    const sid=await streamAdd(dmKey(me,peer),{from:me,text:dataUrl,ts:String(msg.ts),type:"image",cid});
    if(sid){setCursor("dm:"+peer,sid);seenIds.add(sid);if(optEl)optEl.dataset.streamId=sid;}
    else{if(optEl)optEl.remove();seenIds.delete(cid);toast("Photo send failed");}
  }catch(error){if(optEl)optEl.remove();seenIds.delete(cid);showSendError(error);}
  finally{sendLock=false;}
}

async function sendGroupMsg(text,type){
  const acct=getAccount();if(!acct||!activeGroupId)return;
  if(sendLock)return;
  clearMyTyping();sendLock=true;const inputEl=document.getElementById("social-group-msg-input");
  if(type==="text"&&inputEl)inputEl.value="";
  const me=acct.username.toLowerCase();const cid=uid();
  const rt=replyTarget;clearReply();
  const msg={_clientId:cid,from:me,text,ts:Date.now(),type:type||"text",...(rt?{replyFrom:rt.from,replyText:rt.text,replyType:rt.type}:{})};
  const container=document.getElementById("social-group-messages");let optEl=null;
  if(container){if(container.querySelector('div[style*="opacity:.35"]'))container.innerHTML="";optEl=makeMsg(msg,true,true);container.appendChild(optEl);container.scrollTop=container.scrollHeight;seenIds.add(cid);}
  const gid=activeGroupId;
  try{
    const fields={from:me,text,ts:String(msg.ts),type:type||"text",cid,...(rt?{replyToId:rt._id||null,replyFrom:rt.from,replyText:rt.text.substring(0,200),replyType:rt.type}:{})};
    const sid=await streamAdd(groupStreamKey(gid),fields);
    if(sid){setCursor("group:"+gid,sid);seenIds.add(sid);if(optEl)optEl.dataset.streamId=sid;}else{if(optEl)optEl.remove();seenIds.delete(cid);if(type==="text"&&inputEl)inputEl.value=text;toast("Send failed");}
  }catch(error){if(optEl)optEl.remove();seenIds.delete(cid);if(type==="text"&&inputEl)inputEl.value=text;showSendError(error);}
  finally{sendLock=false;}
}

// ── Friend management ─────────────────────────────────────────────────────────
async function sendFriendRequest(targetUser){
  const acct=getAccount();if(!acct)return{ok:false,msg:"Not signed in"};
  const me=acct.username.toLowerCase(),target=targetUser.toLowerCase().trim();
  if(!target)return{ok:false,msg:"Enter a username"};
  if(target===me)return{ok:false,msg:"Cannot add yourself"};
  try{await NovaAPI.friendRequest(target);return{ok:true,msg:"Request sent!"};}
  catch(error){return{ok:false,msg:error.message};}
}

async function acceptRequest(from){
  const acct=getAccount();if(!acct)return;
  const other=from.toLowerCase();
  try{await NovaAPI.respondFriendRequest(other,"accept");}catch(error){return toast(error.message);}
  requests=requests.filter(r=>r.toLowerCase()!==other);
  toast("You and "+from+" are now friends!");
  await loadSocial();
}

async function declineRequest(from){
  const acct=getAccount();if(!acct)return;
  const other=from.toLowerCase();
  try{await NovaAPI.respondFriendRequest(other,"decline");}catch(error){return toast(error.message);}
  requests=requests.filter(r=>r.toLowerCase()!==other);
  toast("Request declined");renderFriendsList();
}

async function removeFriend(peer){
  const acct=getAccount();if(!acct)return;
  const other=peer.toLowerCase();
  try{await NovaAPI.removeFriend(other);}catch(error){return toast(error.message);}
  activePane="everyone";toast("Removed "+peer);await loadSocial();
}

function closeSocialSafetyModal(){document.querySelector(".social-safety-overlay")?.remove();}

function openBlockUserModal(peer){
  if(!peer)return;
  closeSocialSafetyModal();
  const overlay=document.createElement("div");overlay.className="social-safety-overlay";
  overlay.innerHTML='<div class="social-safety-dialog" role="dialog" aria-modal="true"><header><div><span>Social safety</span><h2>Block '+esc(peer)+'</h2></div><button type="button" data-safety-close aria-label="Close">&times;</button></header><p>They will be removed from your friends, cannot send you a request or direct message, and their posts will be hidden from your chats.</p><label for="social-block-reason">Private note <small>optional</small></label><input id="social-block-reason" maxlength="160" placeholder="Why you blocked this account"><footer><button type="button" data-safety-close>Cancel</button><button type="button" class="is-danger" id="social-block-confirm">Block user</button></footer></div>';
  document.body.appendChild(overlay);overlay.querySelectorAll("[data-safety-close]").forEach(button=>button.onclick=closeSocialSafetyModal);overlay.addEventListener("click",event=>{if(event.target===overlay)closeSocialSafetyModal();});
  document.getElementById("social-block-reason")?.focus();
  document.getElementById("social-block-confirm").onclick=async function(){
    const button=this;button.disabled=true;button.textContent="Blocking…";
    try{await NovaAPI.blockUser(peer,document.getElementById("social-block-reason").value.trim());closeSocialSafetyModal();activePane="everyone";toast(peer+" blocked");await loadSocial();}
    catch(error){button.disabled=false;button.textContent="Block user";toast(error.message);}
  };
}

async function openBlockedUsersModal(){
  closeSocialSafetyModal();
  const overlay=document.createElement("div");overlay.className="social-safety-overlay";
  overlay.innerHTML='<div class="social-safety-dialog social-blocked-dialog" role="dialog" aria-modal="true"><header><div><span>Social safety</span><h2>Blocked users</h2></div><button type="button" data-safety-close aria-label="Close">&times;</button></header><div class="social-blocked-list"><div class="social-blocked-loading">Loading…</div></div></div>';
  document.body.appendChild(overlay);overlay.querySelectorAll("[data-safety-close]").forEach(button=>button.onclick=closeSocialSafetyModal);overlay.addEventListener("click",event=>{if(event.target===overlay)closeSocialSafetyModal();});
  const list=overlay.querySelector(".social-blocked-list");
  try{
    const data=await NovaAPI.socialBlocks();blockedUsers=data.blocked||[];
    list.innerHTML=blockedUsers.length?blockedUsers.map(user=>'<article><span class="social-blocked-avatar">'+(user.avatarUrl?'<img src="'+esc(user.avatarUrl)+'" alt="">':esc((user.displayName||user.username||"?").charAt(0).toUpperCase()))+'</span><span><strong>'+esc(user.displayName||user.username)+'</strong><small>@'+esc(user.username)+'</small></span><button type="button" data-unblock-user="'+esc(user.username)+'">Unblock</button></article>').join(""):'<div class="social-blocked-empty">You have not blocked anyone.</div>';
    list.querySelectorAll("[data-unblock-user]").forEach(button=>button.onclick=async function(){const username=button.dataset.unblockUser;button.disabled=true;button.textContent="Unblocking…";try{await NovaAPI.unblockUser(username);blockedUsers=blockedUsers.filter(user=>user.username!==username);button.closest("article").remove();if(!list.querySelector("article"))list.innerHTML='<div class="social-blocked-empty">You have not blocked anyone.</div>';toast(username+" unblocked");}catch(error){button.disabled=false;button.textContent="Unblock";toast(error.message);}});
  }catch(error){list.innerHTML='<div class="social-blocked-empty">'+esc(error.message||"Could not load blocked users")+'</div>';}
}

// Hard refresh polling lives in nova-update.js (all pages, not only Social).

// ── Login overlay ─────────────────────────────────────────────────────────────
function showLoginOverlay(){
  if(document.getElementById("nova-social-login-ov"))return;
  const ov=document.createElement("div");ov.id="nova-social-login-ov";
  ov.style.cssText="position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:var(--bg,#04040a)";
  ov.innerHTML='<div class="social-must-login"><div class="social-must-login-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="social-must-login-text">Sign in to use Social</div><button class="social-must-login-btn" id="nova-social-sign-in-btn">Sign In / Sign Up</button></div>';
  const pg=document.getElementById("page-social");if(pg){pg.style.position="relative";pg.appendChild(ov);}
  document.getElementById("nova-social-sign-in-btn")?.addEventListener("click",()=>document.getElementById("account-btn")?.click());
}
function removeLoginOverlay(){document.getElementById("nova-social-login-ov")?.remove();}

// ── Init / teardown ───────────────────────────────────────────────────────────
function initSocial(){
  removeLoginOverlay();
  if(getAccount()){
    const me=getAccount();
    if(me&&me.avatar&&!me.avatar.startsWith("__builtin__"))_avatarCache[me.username.toLowerCase()]=me.avatar;
    refreshAdminList();loadSocial();startSocialPolling();startFriendsPolling();
  }else showLoginOverlay();
}
function teardownSocial(){clearMyTyping();stopTypingPolling();stopSocialPolling();stopFriendsPolling();stopChatPolling();}

window._novaSocialActivePane=function(){return activePane;};

window._novaOpenSocialPane=async function(which){
  wireDom();
  removeLoginOverlay();
  const acct=getAccount();
  if(!acct){showLoginOverlay();return false;}
  if(acct.avatar&&!acct.avatar.startsWith("__builtin__"))_avatarCache[acct.username.toLowerCase()]=acct.avatar;
  await refreshAdminList();
  await loadSocial();
  startSocialPolling();
  startFriendsPolling();
  if(!which||which==="everyone")await openEveryone();
  else if(String(which).startsWith("group:"))await openGroup(String(which).slice(6));
  else await openDM(String(which).toLowerCase());
  return true;
};

// ── Nicknames ─────────────────────────────────────────────────────────────────
function getNicknames(){try{return JSON.parse(localStorage.getItem("nova_nicknames")||"{}")}catch{return{}}}
function saveNicknames(obj){localStorage.setItem("nova_nicknames",JSON.stringify(obj))}
function getNickname(username){return getNicknames()[username.toLowerCase()]||null}
function displayName(username){return getNickname(username)||username}

function openNicknameModal(peer){
  const existing=getNickname(peer)||"";
  const overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML='<div style="background:#0c0c1c;border:1px solid rgba(139,143,255,.25);border-radius:14px;padding:1.2rem 1.4rem;width:min(340px,90vw);font-family:Space Mono,monospace;"><div style="font-size:.52rem;color:#eeeef6;margin-bottom:.3rem;">Nickname for <strong style="color:#8b8fff;">'+esc(peer)+'</strong></div><div style="font-size:.42rem;color:rgba(238,238,246,.4);margin-bottom:.8rem;">Shown everywhere instead of their username</div><input id="nn-input" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.5rem .7rem;color:#eeeef6;font-family:Space Mono,monospace;font-size:.48rem;outline:none;margin-bottom:.7rem;" placeholder="Nickname (leave blank to clear)" maxlength="30" value="'+esc(existing)+'" autocomplete="off" spellcheck="false"/><div style="display:flex;gap:.5rem;justify-content:flex-end;"><button id="nn-cancel" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.4rem .9rem;color:rgba(238,238,246,.6);font-family:Space Mono,monospace;font-size:.44rem;cursor:pointer;">Cancel</button><button id="nn-save" style="background:rgba(139,143,255,.2);border:1px solid rgba(139,143,255,.35);border-radius:8px;padding:.4rem .9rem;color:#8b8fff;font-family:Space Mono,monospace;font-size:.44rem;cursor:pointer;font-weight:700;">Save</button></div></div>';
  document.body.appendChild(overlay);
  const input=overlay.querySelector("#nn-input");input.focus();input.select();
  overlay.querySelector("#nn-cancel").addEventListener("click",()=>overlay.remove());
  overlay.querySelector("#nn-save").addEventListener("click",()=>{
    const val=input.value.trim();const nns=getNicknames();
    if(val)nns[peer.toLowerCase()]=val;else delete nns[peer.toLowerCase()];
    saveNicknames(nns);overlay.remove();
    const nameEl=document.getElementById("social-chat-peer-name");if(nameEl)nameEl.innerHTML=displayNameWithAdmin(peer);
    renderFriendsList();toast(val?"Nickname set: "+val:"Nickname cleared");
  });
  input.addEventListener("keydown",e=>{if(e.key==="Enter")overlay.querySelector("#nn-save").click();if(e.key==="Escape")overlay.remove();});
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
}

// ── Reports ───────────────────────────────────────────────────────────────────
async function submitReport(type,data){
  const acct=getAccount();
  if(!acct)return false;
  try{await NovaAPI.report({reportType:type,targetUsername:data.target||data.username||data.peer||"",reason:data.reason||"No reason provided"});return true;}
  catch{return false;}
}

function openReportUserModal(peer){
  const overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML='<div style="background:#0c0c1c;border:1px solid rgba(255,107,107,.25);border-radius:14px;padding:1.2rem 1.4rem;width:min(360px,90vw);font-family:Space Mono,monospace;"><div style="font-size:.52rem;color:#eeeef6;margin-bottom:.3rem;">Report <strong style="color:#ff9090;">'+esc(peer)+'</strong></div><div style="font-size:.42rem;color:rgba(238,238,246,.4);margin-bottom:.8rem;">This will be reviewed by Nova admins</div><textarea id="rp-reason" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.5rem .7rem;color:#eeeef6;font-family:Space Mono,monospace;font-size:.44rem;outline:none;margin-bottom:.7rem;resize:vertical;min-height:60px;" placeholder="Reason for reporting…" maxlength="500"></textarea><div style="display:flex;gap:.5rem;justify-content:flex-end;"><button id="rp-cancel" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.4rem .9rem;color:rgba(238,238,246,.6);font-family:Space Mono,monospace;font-size:.44rem;cursor:pointer;">Cancel</button><button id="rp-submit" style="background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.35);border-radius:8px;padding:.4rem .9rem;color:#ff9090;font-family:Space Mono,monospace;font-size:.44rem;cursor:pointer;font-weight:700;">Submit Report</button></div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector("#rp-cancel").addEventListener("click",()=>overlay.remove());
  overlay.querySelector("#rp-submit").addEventListener("click",async()=>{
    const reason=overlay.querySelector("#rp-reason").value.trim();if(!reason)return toast("Please enter a reason");
    const btn=overlay.querySelector("#rp-submit");btn.textContent="Submitting…";btn.disabled=true;
    const ok=await submitReport("user",{target:peer.toLowerCase(),reason});overlay.remove();
    toast(ok?"✓ Report submitted — thanks":"Failed to submit report");
  });
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
}

function openReportBugModal(){
  const overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML='<div style="background:#0c0c1c;border:1px solid rgba(245,158,11,.25);border-radius:14px;padding:1.2rem 1.4rem;width:min(380px,90vw);font-family:Space Mono,monospace;"><div style="font-size:.55rem;color:#f59e0b;margin-bottom:.3rem;font-weight:700;">🐛 Report a Bug</div><div style="font-size:.42rem;color:rgba(238,238,246,.4);margin-bottom:.8rem;">Tell us what went wrong — we\'ll look into it</div><input id="bug-title" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.45rem .7rem;color:#eeeef6;font-family:Space Mono,monospace;font-size:.44rem;outline:none;margin-bottom:.5rem;" placeholder="Short title (e.g. \'Chat not loading\')" maxlength="80" autocomplete="off" spellcheck="false"/><textarea id="bug-desc" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.5rem .7rem;color:#eeeef6;font-family:Space Mono,monospace;font-size:.44rem;outline:none;margin-bottom:.7rem;resize:vertical;min-height:70px;" placeholder="Describe what happened and what you expected…" maxlength="1000"></textarea><div style="display:flex;gap:.5rem;justify-content:flex-end;"><button id="bug-cancel" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.4rem .9rem;color:rgba(238,238,246,.6);font-family:Space Mono,monospace;font-size:.44rem;cursor:pointer;">Cancel</button><button id="bug-submit" style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.35);border-radius:8px;padding:.4rem .9rem;color:#f59e0b;font-family:Space Mono,monospace;font-size:.44rem;cursor:pointer;font-weight:700;">Send Report</button></div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector("#bug-cancel").addEventListener("click",()=>overlay.remove());
  overlay.querySelector("#bug-submit").addEventListener("click",async()=>{
    const title=overlay.querySelector("#bug-title").value.trim();const desc=overlay.querySelector("#bug-desc").value.trim();
    if(!title)return toast("Please enter a title");
    const btn=overlay.querySelector("#bug-submit");btn.textContent="Sending…";btn.disabled=true;
    const ok=await submitReport("bug",{reason:title+(desc?"\n\n"+desc:"")});overlay.remove();
    toast(ok?"✓ Bug report sent — thanks!":"Failed to send report");
  });
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
}
window._novaOpenReportBug=openReportBugModal;

function openFeatureRequestModal(){
  const overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML='<div style="background:#0c0c1c;border:1px solid rgba(74,222,128,.25);border-radius:14px;padding:1.2rem 1.4rem;width:min(380px,90vw);font-family:Space Mono,monospace;"><div style="font-size:.58rem;color:#4ade80;margin-bottom:.3rem;font-weight:700;">✨ Request a Feature</div><div style="font-size:.44rem;color:rgba(238,238,246,.4);margin-bottom:.8rem;">Have an idea for Nova? Share it with us!</div><input id="feat-title" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.45rem .7rem;color:#eeeef6;font-family:Space Mono,monospace;font-size:.44rem;outline:none;margin-bottom:.5rem;" placeholder="Feature idea" maxlength="80" autocomplete="off" spellcheck="false"/><textarea id="feat-desc" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.5rem .7rem;color:#eeeef6;font-family:Space Mono,monospace;font-size:.44rem;outline:none;margin-bottom:.7rem;resize:vertical;min-height:70px;" placeholder="Describe your idea in more detail…" maxlength="1000"></textarea><div style="display:flex;gap:.5rem;justify-content:flex-end;"><button id="feat-cancel" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.4rem .9rem;color:rgba(238,238,246,.6);font-family:Space Mono,monospace;font-size:.44rem;cursor:pointer;">Cancel</button><button id="feat-submit" style="background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.35);border-radius:8px;padding:.4rem .9rem;color:#4ade80;font-family:Space Mono,monospace;font-size:.44rem;cursor:pointer;font-weight:700;">Send Request</button></div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector("#feat-cancel").addEventListener("click",()=>overlay.remove());
  overlay.querySelector("#feat-submit").addEventListener("click",async()=>{
    const title=overlay.querySelector("#feat-title").value.trim();const desc=overlay.querySelector("#feat-desc").value.trim();
    if(!title)return toast("Please enter a feature title");
    const btn=overlay.querySelector("#feat-submit");btn.textContent="Sending…";btn.disabled=true;
    const ok=await submitReport("feature",{reason:title+(desc?"\n\n"+desc:"")});overlay.remove();
    toast(ok?"✓ Feature request sent — thanks!":"Failed to send request");
  });
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
}
window._novaOpenFeatureRequest=openFeatureRequestModal;

// ── Wire DOM ──────────────────────────────────────────────────────────────────
function wireDom(){
  if(domWired)return;domWired=true;
  ["social-add-modal","social-group-modal","social-add-member-modal"].forEach(id=>{
    const modal=document.getElementById(id);
    if(modal&&modal.parentElement!==document.body)document.body.appendChild(modal);
  });
  function injectReplyBar(inputWrapId){
    const wrap=document.getElementById(inputWrapId);if(!wrap||wrap.querySelector(".nova-reply-bar"))return;
    const bar=document.createElement("div");bar.id="nova-reply-bar";bar.className="nova-reply-bar";bar.style.display="none";
    wrap.insertBefore(bar,wrap.firstChild);
  }
  injectReplyBar("social-everyone-input-wrap");injectReplyBar("social-input-wrap");injectReplyBar("social-group-input-wrap");
  if(!document.getElementById("nova-reply-bar")){const bar=document.createElement("div");bar.id="nova-reply-bar";bar.className="nova-reply-bar";bar.style.display="none";document.getElementById("page-social")?.appendChild(bar);}

  const sendEveryoneImage=dataUrl=>{toast("Sending photo…");return sendEveryone(dataUrl,"image");};
  const sendDMImage=dataUrl=>{toast("Sending photo…");return sendDMPhoto(dataUrl);};
  const sendGroupImage=dataUrl=>{toast("Sending photo…");return sendGroupMsg(dataUrl,"image");};
  _evPhotoInput=makeFileInput(sendEveryoneImage,false);_evCameraInput=makeFileInput(sendEveryoneImage,true);
  _dmPhotoInput=makeFileInput(sendDMImage,false);_dmCameraInput=makeFileInput(sendDMImage,true);
  _grpPhotoInput=makeFileInput(sendGroupImage,false);_grpCameraInput=makeFileInput(sendGroupImage,true);
  wireAttachmentButton("social-everyone-photo-btn","social-everyone-input-wrap",_evPhotoInput,_evCameraInput,sendEveryoneImage,()=>!!getAccount()&&activePane==="everyone");
  wireAttachmentButton("social-photo-btn","social-input-wrap",_dmPhotoInput,_dmCameraInput,sendDMImage,()=>!!getAccount()&&activePane!=="everyone"&&activePane!=="none"&&!activePane.startsWith("group:"));
  wireAttachmentButton("social-group-photo-btn","social-group-input-wrap",_grpPhotoInput,_grpCameraInput,sendGroupImage,()=>!!getAccount()&&!!activeGroupId);

  document.getElementById("social-everyone-tab")?.addEventListener("click",()=>{if(!getAccount())return toast("Sign in to chat");openEveryone();});
  document.getElementById("social-edit-profile-btn")?.addEventListener("click",()=>{
    if(!getAccount())return toast("Sign in to edit your profile");
    if(window._novaOpenProfileSettings)window._novaOpenProfileSettings();
  });
  document.getElementById("social-blocked-users-btn")?.addEventListener("click",()=>{if(!getAccount())return toast("Sign in first");openBlockedUsersModal();});

  const evSendBtn=document.getElementById("social-everyone-send-btn");
  evSendBtn?.addEventListener("click",async()=>{if(!getAccount())return toast("Sign in to chat");const inp=document.getElementById("social-everyone-input");const t=inp?.value?.trim();if(t){inp.value="";await sendEveryone(t);}});
  document.getElementById("social-everyone-input")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();evSendBtn?.click();}});

  let searchDebounce;
  document.getElementById("social-friend-search")?.addEventListener("input",()=>{clearTimeout(searchDebounce);searchDebounce=setTimeout(renderFriendsList,120);});

  const addModal=document.getElementById("social-add-modal");
  document.getElementById("social-add-friend-btn")?.addEventListener("click",()=>{if(!getAccount())return toast("Sign in first");addModal?.classList.remove("hidden");document.getElementById("social-add-input")?.focus();});
  document.getElementById("social-add-modal-close")?.addEventListener("click",()=>addModal?.classList.add("hidden"));
  addModal?.addEventListener("click",e=>{if(e.target===addModal)addModal.classList.add("hidden");});
  document.getElementById("social-add-submit-btn")?.addEventListener("click",async()=>{
    const inp=document.getElementById("social-add-input");const msgEl=document.getElementById("social-add-msg");
    const target=inp?.value?.trim();if(!target)return void(msgEl&&(msgEl.textContent="Enter a username",msgEl.className="social-modal-msg err"));
    if(msgEl){msgEl.textContent="Sending…";msgEl.className="social-modal-msg";}
    const res=await sendFriendRequest(target);
    if(msgEl){msgEl.textContent=res.msg;msgEl.className="social-modal-msg "+(res.ok?"ok":"err");}
    if(res.ok){if(inp)inp.value="";setTimeout(()=>{addModal?.classList.add("hidden");if(msgEl)msgEl.textContent="";},1400);}
  });
  document.getElementById("social-add-input")?.addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("social-add-submit-btn")?.click();});

  document.getElementById("social-send-btn")?.addEventListener("click",sendDM);
  document.getElementById("social-msg-input")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendDM();}});
  document.getElementById("social-msg-input")?.addEventListener("input",signalTyping);
  document.getElementById("social-msg-input")?.addEventListener("blur",clearMyTyping);

  document.getElementById("social-chat-remove-btn")?.addEventListener("click",()=>{
    if(activePane&&activePane!=="everyone"&&activePane!=="none"&&!activePane.startsWith("group:")){if(confirm("Remove "+activePane+" as a friend?"))removeFriend(activePane);}
  });
  document.getElementById("social-chat-nickname-btn")?.addEventListener("click",()=>{if(activePane&&activePane!=="everyone"&&activePane!=="none"&&!activePane.startsWith("group:"))openNicknameModal(activePane);});
  document.getElementById("social-chat-report-btn")?.addEventListener("click",()=>{if(activePane&&activePane!=="everyone"&&activePane!=="none"&&!activePane.startsWith("group:"))openReportUserModal(activePane);});
  document.getElementById("social-chat-block-btn")?.addEventListener("click",()=>{if(activePane&&activePane!=="everyone"&&activePane!=="none"&&!activePane.startsWith("group:"))openBlockUserModal(activePane);});
  document.getElementById("social-dm-uno-btn")?.addEventListener("click",e=>startUnoFromSocial(e.currentTarget));
  document.getElementById("social-dm-checkers-btn")?.addEventListener("click",e=>startCheckersFromSocial(e.currentTarget));
  document.getElementById("social-group-uno-btn")?.addEventListener("click",e=>startUnoFromSocial(e.currentTarget));
  document.getElementById("social-games-tab")?.addEventListener("click",openSocialGamePicker);
  document.getElementById("social-pick-uno")?.addEventListener("click",()=>openSocialUno(""));
  document.getElementById("social-pick-checkers")?.addEventListener("click",()=>openSocialCheckers(""));
  document.getElementById("social-game-close")?.addEventListener("click",closeSocialUno);

  const groupModal=document.getElementById("social-group-modal");
  document.getElementById("social-new-group-btn")?.addEventListener("click",()=>{
    if(!getAccount())return toast("Sign in first");
    const listEl=document.getElementById("social-group-friends-list");
    if(listEl){listEl.innerHTML="";if(!friends.length){listEl.innerHTML='<div style="font-family:Space Mono,monospace;font-size:.5rem;color:var(--muted);padding:.5rem;text-align:center;">Add friends first to create a group</div>';}else{friends.forEach(f=>{const row=document.createElement("label");row.className="social-group-friend-pick";row.innerHTML='<input type="checkbox" value="'+esc(f)+'"><span class="social-group-friend-pick-name">'+esc(f)+"</span>";listEl.appendChild(row);});}}
    document.getElementById("social-group-name-input").value="";document.getElementById("social-group-msg").textContent="";
    groupModal?.classList.remove("hidden");document.getElementById("social-group-name-input")?.focus();
  });
  document.getElementById("social-group-modal-close")?.addEventListener("click",()=>groupModal?.classList.add("hidden"));
  groupModal?.addEventListener("click",e=>{if(e.target===groupModal)groupModal.classList.add("hidden");});
  document.getElementById("social-group-create-btn")?.addEventListener("click",async()=>{
    const nameInp=document.getElementById("social-group-name-input");const msgEl=document.getElementById("social-group-msg");
    const name=nameInp?.value?.trim();
    if(!name){if(msgEl){msgEl.textContent="Enter a group name";msgEl.className="social-modal-msg err";}return;}
    const selected=[...document.querySelectorAll("#social-group-friends-list input:checked")].map(el=>el.value);
    if(!selected.length){if(msgEl){msgEl.textContent="Select at least 1 friend";msgEl.className="social-modal-msg err";}return;}
    if(msgEl){msgEl.textContent="Creating…";msgEl.className="social-modal-msg";}
    const res=await createGroup(name,selected);
    if(res.ok){if(msgEl){msgEl.textContent="Group created!";msgEl.className="social-modal-msg ok";}setTimeout(()=>{groupModal?.classList.add("hidden");openGroup(res.gid);},800);}
    else{if(msgEl){msgEl.textContent=res.msg||"Failed";msgEl.className="social-modal-msg err";}}
  });

  document.getElementById("social-group-send-btn")?.addEventListener("click",()=>{const inp=document.getElementById("social-group-msg-input");const t=inp?.value?.trim();if(t)sendGroupMsg(t,"text");});
  document.getElementById("social-group-msg-input")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();document.getElementById("social-group-send-btn")?.click();}});
  document.getElementById("social-group-msg-input")?.addEventListener("input",signalTyping);
  document.getElementById("social-group-msg-input")?.addEventListener("blur",clearMyTyping);

  const addMemberModal=document.getElementById("social-add-member-modal");
  document.getElementById("social-group-add-member-btn")?.addEventListener("click",()=>{
    if(!activeGroupId)return;
    const grp=groups.find(g=>g.id===activeGroupId);
    const currentMembers=(grp?.members||[]).map(m=>m.toLowerCase());
    const eligible=friends.filter(f=>!currentMembers.includes(f.toLowerCase()));
    const listEl=document.getElementById("social-add-member-list");
    if(listEl){listEl.innerHTML="";if(!eligible.length){listEl.innerHTML='<div style="font-family:Space Mono,monospace;font-size:.5rem;color:var(--muted);padding:.5rem;text-align:center;">All friends are already in this group</div>';}else{eligible.forEach(f=>{const row=document.createElement("div");row.className="social-group-friend-pick";row.style.cursor="pointer";row.innerHTML='<div class="social-friend-avatar" style="width:26px;height:26px;min-width:26px;font-size:.6rem;">'+f.charAt(0).toUpperCase()+'</div><span class="social-group-friend-pick-name">'+esc(f)+"</span>";row.addEventListener("click",async()=>{const msgEl=document.getElementById("social-add-member-msg");if(msgEl){msgEl.textContent="Sending invite…";msgEl.className="social-modal-msg";}const res=await addMemberToGroup(activeGroupId,f);if(res.ok){if(msgEl){msgEl.textContent=res.invited?"Invite sent to "+f+"!":f+" added!";msgEl.className="social-modal-msg ok";}setTimeout(()=>{addMemberModal?.classList.add("hidden");if(msgEl)msgEl.textContent="";},1200);}else{if(msgEl){msgEl.textContent=res.msg||"Failed";msgEl.className="social-modal-msg err";}}});listEl.appendChild(row);});}}
    document.getElementById("social-add-member-msg").textContent="";addMemberModal?.classList.remove("hidden");
  });
  document.getElementById("social-add-member-modal-close")?.addEventListener("click",()=>addMemberModal?.classList.add("hidden"));
  addMemberModal?.addEventListener("click",e=>{if(e.target===addMemberModal)addMemberModal.classList.add("hidden");});

  document.getElementById("social-group-leave-btn")?.addEventListener("click",()=>{if(!activeGroupId)return;const g=groups.find(x=>x.id===activeGroupId);if(confirm("Leave \""+(g?.name||"group")+"\"?"))leaveGroup(activeGroupId);});
}

function wireNtShortcuts(){
  document.querySelectorAll(".nt-shortcut[data-url]").forEach(btn=>{if(btn.dataset.wired)return;btn.dataset.wired="1";btn.addEventListener("click",()=>{const url=btn.dataset.url;if(url&&typeof window.goTo==="function")window.goTo(url);});});
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded",()=>{wireDom();wireNtShortcuts();if(document.querySelector("#page-social.active"))initSocial();});
document.addEventListener("nova:social-open",()=>{wireDom();initSocial();});
document.addEventListener("nova:social-open-everyone",()=>{wireDom();initSocial();setTimeout(()=>{document.getElementById("social-everyone-tab")?.click();},300);});
document.addEventListener("nova:page-change",e=>{if(e.detail?.page==="social"){wireDom();initSocial();}else if(e.detail?.page==="browser"){wireNtShortcuts();}else if(!document.body.classList.contains("ni-social-sidebar-open")){teardownSocial();}});
document.addEventListener("nova:social-dock-closed",()=>{if(!document.getElementById("page-social")?.classList.contains("active"))teardownSocial();});
document.addEventListener("nova:login",()=>{if(document.getElementById("page-social")?.classList.contains("active"))initSocial();});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden)return;if(!getAccount())return;
  if(typeof window.__novaCheckHardRefresh==="function")window.__novaCheckHardRefresh();
  // FIX: Immediately re-poll on tab focus instead of reloading the full history.
  // When the tab was hidden, the 1-second poll was skipped (document.hidden guard),
  // so we fire one incremental poll right now to pick up any missed messages.
  // This eliminates the "must hard-refresh to see new messages" bug without
  // clearing and re-rendering the whole chat on every tab switch.
  if(activePane==="everyone")_pollEveryone();
  else if(activePane.startsWith("group:")&&activeGroupId)_pollGroup();
  else if(activePane!=="none")_pollDM();
});

document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("report-bug-btn")?.addEventListener("click",openReportBugModal);
  document.getElementById("support-feature-btn")?.addEventListener("click",openFeatureRequestModal);
});
}();
