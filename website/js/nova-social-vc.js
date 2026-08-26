(function(){
"use strict";

var S={
  rooms:[],canCreate:false,room:null,me:null,stream:null,mesh:null,
  poll:0,signalAfter:0,chatAfter:0,chatTimer:0,signalTimer:0,
  muted:false,deafened:false,audio:new Map(),peerState:new Map(),leaving:false,
  memberMarkup:"",audioUnlockNeeded:false
};
function $(id){return document.getElementById(id)}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]})}
function api(path,options){return NovaAPI.request(path,options||{})}
function toastMsg(m,t){if(typeof window.toast==="function")window.toast(m,t);else console.log("[Voice]",m)}
function initials(name){return String(name||"?").trim().slice(0,1).toUpperCase()||"?"}
function avatar(member,cls){
  return '<div class="'+(cls||"nova-v2-avatar")+'">'+(member.avatarUrl?'<img src="'+esc(member.avatarUrl)+'" alt="">':esc(initials(member.displayName||member.username)))+'</div>';
}
function icon(name){
  var paths={
    voice:'<path d="M12 3a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Z"/><path d="M5 11v1a7 7 0 0 0 14 0v-1"/><path d="M12 19v3"/>',
    mic:'<path d="M12 3a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Z"/><path d="M5 11v1a7 7 0 0 0 14 0v-1"/><path d="M12 19v2"/>',
    headphones:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5ZM20 14h-3v6h2a1 1 0 0 0 1-1v-5Z"/>',
    leave:'<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-2.6"/>',
    close:'<path d="M6 6l12 12M18 6 6 18"/>',
    send:'<path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/>'
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.voice)+'</svg>';
}

function ensureUI(){
  if(!$("nova-v2-sidebar")){
    var everyone=$("social-everyone-tab");
    if(everyone){
      var sec=document.createElement("section");
      sec.id="nova-v2-sidebar";sec.className="nova-v2-sidebar";
      sec.innerHTML='<header><span>Voice rooms</span><button id="nova-v2-create" type="button" title="Create voice room">+</button></header><div id="nova-v2-room-list"></div>';
      everyone.insertAdjacentElement("afterend",sec);
    }
  }
  if(!$("nova-v2-stage")){
    var stage=document.createElement("div");stage.id="nova-v2-stage";stage.className="nova-v2-stage hidden";
    stage.innerHTML=
      '<div class="nova-v2-shell">'+
        '<header class="nova-v2-top"><div class="nova-v2-roommark">'+icon("voice")+'</div><div class="nova-v2-roomcopy"><small>Nova Voice</small><strong id="nova-v2-title">Voice room</strong><span id="nova-v2-state">Connecting…</span></div>'+
        '<div class="nova-v2-top-actions"><button id="nova-v2-lock" type="button" title="Lock room">'+icon("lock")+'<span>Lock</span></button><button id="nova-v2-close" type="button" aria-label="Back to Social">'+icon("close")+'</button></div></header>'+
        '<div id="nova-v2-lobby" class="nova-v2-lobby hidden"><div class="nova-v2-orbit">◉</div><h2>Waiting for admission</h2><p>The host can let you into this room.</p><button id="nova-v2-lobby-leave" type="button">Leave room</button></div>'+
        '<main id="nova-v2-active" class="nova-v2-active hidden">'+
          '<section class="nova-v2-main"><div class="nova-v2-section-head"><div><small>In the room</small><strong id="nova-v2-count">0 connected</strong></div><span id="nova-v2-connection">Starting audio…</span></div><div id="nova-v2-members" class="nova-v2-members"></div>'+
          '<div class="nova-v2-controls"><button id="nova-v2-mute" type="button">'+icon("mic")+'<span>Mute</span></button><button id="nova-v2-deafen" type="button">'+icon("headphones")+'<span>Deafen</span></button><button id="nova-v2-leave" class="danger" type="button">'+icon("leave")+'<span>Leave</span></button></div></section>'+
          '<aside class="nova-v2-chat"><header><div><small>Room chat</small><strong>Messages & reactions</strong></div></header><div id="nova-v2-chat-log" class="nova-v2-chat-log"></div>'+
          '<form id="nova-v2-chat-form" class="nova-v2-chat-form"><input id="nova-v2-chat-input" maxlength="500" placeholder="Message the room…"><button type="submit" aria-label="Send message">'+icon("send")+'<span>Send</span></button></form></aside>'+
        '</main>'+
      '</div>';
    var dock=$("ni-social-dock")||document.body;dock.appendChild(stage);
  }
  bindUI();
}

var bound=false;
function bindUI(){
  if(bound)return;bound=true;
  $("nova-v2-create")?.addEventListener("click",createRoom);
  $("nova-v2-close")?.addEventListener("click",function(){hideStage(false)});
  $("nova-v2-lobby-leave")?.addEventListener("click",leaveRoom);
  $("nova-v2-leave")?.addEventListener("click",leaveRoom);
  $("nova-v2-mute")?.addEventListener("click",function(){setMuted(!S.muted)});
  $("nova-v2-deafen")?.addEventListener("click",function(){setDeafened(!S.deafened)});
  $("nova-v2-lock")?.addEventListener("click",toggleLock);
  $("nova-v2-chat-form")?.addEventListener("submit",sendChat);
}

async function refreshRooms(){
  ensureUI();
  if(!window.__novaV7User){
    S.rooms=[];S.canCreate=false;
    var create=$("nova-v2-create");if(create)create.hidden=true;
    renderRooms();
    return;
  }
  try{
    var data=await api("/api/voice/v2/rooms");
    S.rooms=data.rooms||[];S.canCreate=!!data.canCreate;
    var create=$("nova-v2-create");if(create){create.hidden=!S.canCreate;create.title=S.canCreate?"Create voice room":"Supernova is required to host";}
    renderRooms();
  }catch(e){var list=$("nova-v2-room-list");if(list)list.innerHTML='<div class="nova-v2-room-empty">Voice rooms unavailable</div>'}
}
function renderRooms(){
  var list=$("nova-v2-room-list");if(!list)return;
  if(!S.rooms.length){list.innerHTML='<div class="nova-v2-room-empty">No active rooms</div>';return}
  var role=(window.__novaV7User&&window.__novaV7User.role)||"user";
  var staffJoin=["developer","owner"].includes(role);
  list.innerHTML=S.rooms.map(function(r){
    var actions='<button class="nova-v2-room-action primary" type="button" data-room-join="'+esc(r.id)+'">Join</button>';
    if(staffJoin) actions+='<button class="nova-v2-room-action vanish" type="button" data-room-vanish="'+esc(r.id)+'" title="Join hidden from the visible member list">Vanish</button>';
    return '<div class="nova-v2-room-row"><i></i><span><strong>'+esc(r.name)+'</strong><small>'+esc(r.hostDisplayName||r.hostUsername)+' · '+Number(r.connectedCount||r.memberCount||0)+' connected</small></span><div class="nova-v2-room-actions">'+actions+'</div></div>';
  }).join("");
  list.querySelectorAll("[data-room-join]").forEach(function(btn){btn.onclick=function(){joinRoom(btn.dataset.roomJoin,false)}});
  list.querySelectorAll("[data-room-vanish]").forEach(function(btn){btn.onclick=function(){joinRoom(btn.dataset.roomVanish,true)}});
}

async function createRoom(){
  var name=prompt("Voice room name","Hangout");
  if(name===null)return;
  try{
    var data=await api("/api/voice/v2/rooms",{method:"POST",body:{name:name||"Hangout"}});
    await enterRoom(data.room,true);
  }catch(e){toastMsg(e.message||"Could not create voice room","error")}
}
async function joinRoom(roomId,vanish){
  // Stop any previous room pollers before attempting a new join so stale
  // ICE/chat/signal requests cannot spam 404s while the join is in flight.
  stopTimers(false);
  try{
    var result=await api("/api/voice/v2/join",{method:"POST",body:{roomId:roomId,vanish:!!vanish}});
    S.room={id:roomId,yourStatus:result.status,vanished:!!result.vanished};
    S.signalAfter=0;
    S.chatAfter=0;
    showStage();

    // IMPORTANT: guests in the admission lobby must keep polling.
    // Previously only hosts started the room timers, so a guest would
    // remain on "Waiting for admission" forever even after the backend
    // had already changed them to connected.
    await startTimers();
    await pollState(true);
  }catch(e){
    stopTimers(false);
    toastMsg(e.message||"Could not join voice room","error");
  }
}

function showStage(){
  ensureUI();$("nova-v2-stage")?.classList.remove("hidden");
  document.body.classList.add("nova-v2-open");
}
function hideStage(leave){
  $("nova-v2-stage")?.classList.add("hidden");document.body.classList.remove("nova-v2-open");
  if(leave)leaveRoom();
}
async function enterRoom(room,host){
  S.room=room;S.me=room.me||S.me;S.signalAfter=0;S.chatAfter=0;showStage();
  await startTimers();
  renderState(room);
  if(room.yourStatus==="connected"||room.yourStatus==="admitted")await startAudio();
}
async function startTimers(){
  stopTimers(false);
  S.poll=setInterval(function(){if(!document.hidden)pollState(false)},5000);
  S.signalTimer=setInterval(function(){if(!document.hidden)pollSignals()},2500);
  S.chatTimer=setInterval(function(){if(!document.hidden)pollChat()},5000);
}
function stopTimers(closeAudio){
  clearInterval(S.poll);clearInterval(S.signalTimer);clearInterval(S.chatTimer);
  S.poll=S.signalTimer=S.chatTimer=0;
  if(closeAudio){
    if(S.mesh)S.mesh.close();S.mesh=null;
    S.audio.forEach(function(a){a.remove()});S.audio.clear();
    if(S.stream)S.stream.getTracks().forEach(function(t){t.stop()});S.stream=null;
  }
}

async function pollState(first){
  if(!S.room||!S.room.id)return;
  try{
    var data=await api("/api/voice/v2/state?room="+encodeURIComponent(S.room.id));
    S.room=data.room;S.me=data.room.me||S.me;
    if(["denied","removed","left"].includes(S.room.yourStatus)){
      toastMsg(S.room.yourStatus==="denied"?"The host denied your admission.":"You are no longer in this voice room.","info");
      resetRoom();refreshRooms();return;
    }
    renderState(S.room);
    if(["connected","admitted"].includes(S.room.yourStatus)){
      if(!S.stream&&!S.mesh)await startAudio();
      if(S.mesh)await S.mesh.ensurePeers(S.room.peers||S.room.members||[]);
      updateAudioStatus();
      pollSignals();pollChat();
    }
  }catch(e){
    if(["VOICE_ROOM_NOT_FOUND","VOICE_NOT_JOINED","VOICE_NOT_ADMITTED"].includes(e.code)){toastMsg("Voice room ended","info");resetRoom()}
    else if(first)toastMsg(e.message||"Voice connection failed","error");
  }
}

function renderState(room){
  if(!room)return;
  $("nova-v2-title").textContent=room.name||"Voice room";
  $("nova-v2-state").textContent=room.vanished?"Vanish mode · hidden":(room.locked?"Locked room":"Live room");
  var waiting=["pending","invited"].includes(room.yourStatus);
  $("nova-v2-lobby").classList.toggle("hidden",!waiting);
  $("nova-v2-active").classList.toggle("hidden",waiting);
  $("nova-v2-lock").hidden=!room.canManage;
  if(room.canManage){
    var lock=$("nova-v2-lock");
    lock.innerHTML=icon(room.locked?"unlock":"lock")+'<span>'+(room.locked?"Unlock":"Lock")+'</span>';
  }
  if(waiting)return;
  var members=(room.members||[]).filter(function(m){return ["connected","admitted","pending","invited"].includes(m.status)});
  var connected=members.filter(function(m){return m.status==="connected"});
  $("nova-v2-count").textContent=connected.length+" connected";
  // Do not rebuild the member cards on every 1.2s state poll. Replacing the
  // DOM on every heartbeat restarted novaMotionSoftUp continuously and caused
  // the visible "jumping"/pulsing in the room UI.
  var markup=members.map(function(m){return memberCard(m,room)}).join("");
  if(markup!==S.memberMarkup){
    S.memberMarkup=markup;
    $("nova-v2-members").innerHTML=markup;
    bindMemberActions();
  }
  if(room.mutedByHost)setMuted(true,true);
}
function memberCard(m,room){
  var pending=["pending","invited"].includes(m.status),host=m.role==="host",me=S.me&&m.userId===S.me.id;
  var state=S.peerState.get(m.userId)||m.status;
  var actions="";
  if(room.canManage&&pending)actions='<div class="nova-v2-member-actions"><button data-admit="'+esc(m.username)+'">Admit</button><button data-deny="'+esc(m.username)+'">Deny</button></div>';
  else if(room.canManage&&!me&&!pending)actions='<div class="nova-v2-member-actions"><button data-mute-user="'+esc(m.username)+'">'+(m.mutedByHost?"Unmute":"Mute")+'</button><button class="danger" data-remove-user="'+esc(m.username)+'">Remove</button></div>';
  return '<article class="nova-v2-member '+(pending?"pending ":"")+(host?"host ":"")+'">'+avatar(m)+'<div class="nova-v2-member-copy"><strong>'+esc(m.displayName||m.username)+(me?' <em>You</em>':'')+'</strong><span>@'+esc(m.username)+' · '+(pending?"waiting":esc(state))+'</span></div>'+(host?'<b class="nova-v2-host">HOST</b>':"")+actions+'</article>';
}
function bindMemberActions(){
  document.querySelectorAll("[data-admit]").forEach(function(b){b.onclick=function(){admit(b.dataset.admit,"approve")}});
  document.querySelectorAll("[data-deny]").forEach(function(b){b.onclick=function(){admit(b.dataset.deny,"deny")}});
  document.querySelectorAll("[data-mute-user]").forEach(function(b){b.onclick=function(){hostAction("mute-user",b.dataset.muteUser,b.textContent==="Mute")}});
  document.querySelectorAll("[data-remove-user]").forEach(function(b){b.onclick=function(){hostAction("remove-user",b.dataset.removeUser,true)}});
}
async function admit(username,action){
  try{await api("/api/voice/v2/admit",{method:"POST",body:{roomId:S.room.id,username:username,action:action}});pollState(false)}
  catch(e){toastMsg(e.message||"Could not update admission","error")}
}
async function hostAction(action,username,value){
  if(!S.room||!S.room.canManage)return;
  try{await api("/api/voice/v2/action",{method:"POST",body:{roomId:S.room.id,action:action,username:username,muted:value}});pollState(false)}
  catch(e){toastMsg(e.message||"Voice action failed","error")}
}
async function toggleLock(){
  if(!S.room||!S.room.canManage)return;
  try{await api("/api/voice/v2/action",{method:"POST",body:{roomId:S.room.id,action:"lock",enabled:!S.room.locked}});pollState(false)}
  catch(e){toastMsg(e.message||"Could not change room lock","error")}
}

function updateAudioStatus(){
  var label=$("nova-v2-connection");if(!label||!S.room)return;
  var others=(S.room.members||[]).filter(function(m){return m.status==="connected"&&(!S.me||m.userId!==S.me.id)});
  if(!others.length){label.textContent=S.stream?"Microphone ready · waiting for others":"Listening mode · waiting for others";return}
  var states=others.map(function(m){return S.peerState.get(m.userId)||"new"});
  if(states.some(function(x){return x==="connected"})){label.textContent="Audio connected";return}
  if(states.some(function(x){return x==="retrying"||x==="failed"})){label.textContent="Retrying audio connection…";return}
  if(states.some(function(x){return x==="disconnected"})){label.textContent="Reconnecting audio…";return}
  label.textContent="Connecting to "+others.length+" member"+(others.length===1?"":"s")+"…";
}
async function startAudio(){
  if(S.mesh||!S.room||!S.me)return;
  $("nova-v2-connection").textContent="Requesting microphone…";
  try{
    S.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  }catch(e){
    S.stream=null;toastMsg("Microphone unavailable — joined in listening mode","info");
  }
  var ice=[{urls:["stun:stun.cloudflare.com:3478"]}];
  try{
    var cfg=await api("/api/voice/v2/ice?room="+encodeURIComponent(S.room.id));
    if(cfg.iceServers&&cfg.iceServers.length)ice=cfg.iceServers;
  }catch(e){}
  S.mesh=new NovaVoiceMesh({
    roomId:S.room.id,me:S.me,stream:S.stream,iceServers:ice,
    sendSignal:sendSignal,
    onTrack:attachRemote,
    onPeerState:function(id,state){
      S.peerState.set(id,state);
      updateAudioStatus();
      if(S.room)renderState(S.room);
    }
  });
  setMuted(S.muted);
  await S.mesh.ensurePeers(S.room.peers||S.room.members||[]);
  updateAudioStatus();
}
async function sendSignal(toUserId,kind,payload){
  return api("/api/voice/v2/signals",{method:"POST",body:{roomId:S.room.id,toUserId:toUserId,kind:kind,payload:payload}});
}
async function pollSignals(){
  if(!S.room||!S.mesh)return;
  try{
    var d=await api("/api/voice/v2/signals?room="+encodeURIComponent(S.room.id)+"&after="+S.signalAfter);
    for(const sig of d.signals||[]){S.signalAfter=Math.max(S.signalAfter,Number(sig.id||0));await S.mesh.handleSignal(sig)}
    if(S.room&&S.mesh)await S.mesh.ensurePeers(S.room.peers||S.room.members||[]);
  }catch(e){}
}
function markAudioUnlockNeeded(){
  if(S.audioUnlockNeeded)return;
  S.audioUnlockNeeded=true;
  var label=$("nova-v2-connection");
  if(label)label.textContent="Audio connected · click anywhere to enable sound";
}
function resumeRemoteAudio(){
  if(!S.audio.size)return;
  var pending=[];
  S.audio.forEach(function(a){
    if(!S.deafened){
      a.muted=false;
      var result=a.play();
      if(result&&typeof result.catch==="function")pending.push(result.catch(function(){return false}));
    }
  });
  Promise.all(pending).then(function(){
    S.audioUnlockNeeded=false;
    updateAudioStatus();
  }).catch(function(){});
}
function attachRemote(userId,stream){
  var audio=S.audio.get(userId);
  if(!audio){
    audio=document.createElement("audio");
    audio.autoplay=true;
    audio.playsInline=true;
    audio.preload="auto";
    audio.volume=1;
    audio.dataset.novaVoice="1";
    // Remote voice does not need to be visible, but it must remain attached to
    // the document for reliable Chromium/Safari playback.
    audio.style.position="fixed";audio.style.width="1px";audio.style.height="1px";audio.style.opacity="0";audio.style.pointerEvents="none";
    document.body.appendChild(audio);S.audio.set(userId,audio);
  }
  if(audio.srcObject!==stream)audio.srcObject=stream;
  audio.muted=S.deafened;
  var play=audio.play();
  if(play&&typeof play.catch==="function")play.catch(function(err){
    console.warn("[Nova Voice] Remote audio autoplay was blocked",err);
    markAudioUnlockNeeded();
  });
}
function setMuted(value,forced){
  S.muted=!!value;if(S.mesh)S.mesh.setMuted(S.muted);
  var b=$("nova-v2-mute");if(b){b.classList.toggle("active",S.muted);b.querySelector("span").textContent=S.muted?(forced?"Host muted":"Unmute"):"Mute"}
}
function setDeafened(value){
  S.deafened=!!value;S.audio.forEach(function(a){a.muted=S.deafened});
  var b=$("nova-v2-deafen");if(b){b.classList.toggle("active",S.deafened);b.querySelector("span").textContent=S.deafened?"Undeafen":"Deafen"}
}

async function pollChat(){
  if(!S.room||!["connected","admitted"].includes(S.room.yourStatus))return;
  try{
    var d=await api("/api/voice/v2/chat?room="+encodeURIComponent(S.room.id)+"&after="+S.chatAfter);
    if((d.messages||[]).length){
      var log=$("nova-v2-chat-log");
      for(const m of d.messages){S.chatAfter=Math.max(S.chatAfter,Number(m.id||0));appendChat(m)}
      if(log)log.scrollTop=log.scrollHeight;
    }
  }catch(e){}
}
function appendChat(m){
  var log=$("nova-v2-chat-log");if(!log)return;
  if(log.querySelector('[data-msg="'+m.id+'"]'))return;
  var div=document.createElement("div");div.className="nova-v2-chat-line";div.dataset.msg=m.id;
  div.innerHTML=avatar(m,"nova-v2-chat-avatar")+'<div><strong>'+esc(m.displayName||m.username)+'</strong><span>'+esc(m.message)+'</span></div>';
  log.appendChild(div);
  while(log.children.length>140)log.firstElementChild.remove();
}
async function sendChat(e){
  e.preventDefault();var input=$("nova-v2-chat-input"),message=(input.value||"").trim();if(!message)return;
  input.value="";
  try{await api("/api/voice/v2/chat",{method:"POST",body:{roomId:S.room.id,message:message,kind:"text"}});pollChat()}
  catch(err){toastMsg(err.message||"Could not send message","error")}
}


async function leaveRoom(){
  if(!S.room||S.leaving)return;S.leaving=true;
  var id=S.room.id;
  stopTimers(true);
  try{await api("/api/voice/v2/leave",{method:"POST",body:{roomId:id}})}catch(e){}
  resetRoom();S.leaving=false;refreshRooms();
}
function resetRoom(){
  stopTimers(true);S.room=null;S.me=null;S.signalAfter=0;S.chatAfter=0;S.peerState.clear();S.memberMarkup="";S.audioUnlockNeeded=false;
  $("nova-v2-stage")?.classList.add("hidden");document.body.classList.remove("nova-v2-open");
}
window.addEventListener("beforeunload",function(){
  if(S.room)try{navigator.sendBeacon("/api/voice/v2/leave",new Blob([JSON.stringify({roomId:S.room.id})],{type:"application/json"}))}catch(e){}
});

document.addEventListener("pointerdown",resumeRemoteAudio,{passive:true});
document.addEventListener("keydown",resumeRemoteAudio);
document.addEventListener("DOMContentLoaded",function(){ensureUI();refreshRooms();setInterval(function(){if(window.__novaV7User&&!document.hidden)refreshRooms()},20000)});
document.addEventListener("visibilitychange",function(){if(!document.hidden){refreshRooms();if(S.room){pollState(true);pollSignals();pollChat()}}});
document.addEventListener("nova:social-open",function(){ensureUI();refreshRooms()});
window.addEventListener("nova:session-changed",function(){refreshRooms()});
window.NovaVoiceRoomsV2={refresh:refreshRooms,leave:leaveRoom};
})();