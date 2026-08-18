(function(){
  "use strict";
  var user=null,lobby=null,pollTimer=null,inviteTimer=null,pollBusy=false,registerMode=false,pendingCard=-1;
  var $=function(id){return document.getElementById(id)};
  function show(id){$(id).hidden=false} function hide(id){$(id).hidden=true}
  function toast(message){var el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(el._timer);el._timer=setTimeout(function(){el.classList.remove("show")},3200)}
  async function call(path,options){return NovaAPI.request(path,options)}
  function setConnected(ok){document.querySelector(".connection").classList.toggle("online",ok);$("connection-text").textContent=ok?"Live":"Offline"}
  function setUser(next){user=next||null;$("account-label").textContent=user?(user.displayName||user.username):"Sign in";$("account-avatar").textContent=user?(user.displayName||user.username).charAt(0).toUpperCase():"?"}
  async function boot(){try{var me=await NovaAPI.me();setUser(me.user);setConnected(true);if(user){await loadFriends();await loadInvites();inviteTimer=setInterval(function(){if(!lobby)loadInvites()},5000)}}catch(e){setConnected(false)}}
  function requireUser(){if(user)return true;show("auth-modal");setTimeout(function(){$("auth-username").focus()},30);return false}
  async function loadFriends(){try{var data=await NovaAPI.social();var picker=$("friend-picker");picker.innerHTML='<option value="">Choose a Nova friend</option>';data.friends.forEach(function(friend){var option=document.createElement("option");option.value=friend.username;option.textContent=friend.displayName||friend.username;picker.appendChild(option)})}catch(e){}}
  async function loadInvites(){try{var data=await call("/api/boardgames/uno/invites");var list=$("invite-list");list.innerHTML="";$("invite-count").textContent=data.invites.length;$("invites-panel").hidden=!data.invites.length;data.invites.forEach(function(invite){var row=document.createElement("div");row.className="invite-row";row.innerHTML="<span><b>"+escapeHtml(invite.fromUsername)+"</b><br><small>UNO · "+invite.code+"</small></span><button type='button'>Join</button>";row.querySelector("button").onclick=function(){joinLobby(invite.code)};list.appendChild(row)})}catch(e){}}
  function escapeHtml(value){var div=document.createElement("div");div.textContent=value||"";return div.innerHTML}
  async function createLobby(){if(!requireUser())return;disable($("create-lobby"),true,"Creating…");try{var data=await call("/api/boardgames/uno/lobbies",{method:"POST",body:{}});enterLobby(data.lobby)}catch(e){toast(e.message)}finally{disable($("create-lobby"),false,"Create a lobby")}}
  async function joinLobby(code){if(!requireUser())return;try{var data=await call("/api/boardgames/uno/join",{method:"POST",body:{code:code}});hide("join-modal");enterLobby(data.lobby)}catch(e){$("join-error").textContent=e.message}}
  function disable(button,on,label){button.disabled=on;button.textContent=label}
  function enterLobby(next){lobby=next;hide("landing");hide("table-view");show("lobby-view");renderLobby();startPoll()}
  function enterTable(next){lobby=next;hide("landing");hide("lobby-view");show("table-view");renderTable();startPoll()}
  function renderLobby(){if(!lobby)return;$("lobby-code").textContent=lobby.code;var list=$("player-list");list.innerHTML="";for(var i=0;i<4;i++){var member=lobby.members[i],el=document.createElement("div");el.className="player"+(member?"":" empty");el.innerHTML=member?'<span class="avatar">'+escapeHtml((member.displayName||member.username).charAt(0).toUpperCase())+'</span><b>'+escapeHtml(member.displayName||member.username)+'</b><small>'+(member.userId===lobby.ownerId?"Host":"Ready")+'</small>':'<span>＋</span><small>Open seat</small>';list.appendChild(el)}var host=user&&user.id===lobby.ownerId;$("start-game").hidden=!host;$("invite-friend").disabled=!host}
  function cardLabel(card){return card.value==="skip"?"⊘":card.value==="reverse"?"↻":card.value==="draw2"?"+2":card.value==="wild4"?"+4":card.value==="wild"?"W":card.value}
  function cardElement(card,index,clickable){var button=document.createElement("button");button.type="button";button.className="uno-card "+card.color;button.style.setProperty("--tilt",((index-(lobby.hand.length-1)/2)*1.5)+"deg");button.setAttribute("aria-label",(card.color+" "+card.value).replace("draw2","draw two").replace("wild4","wild draw four"));var label=cardLabel(card);button.innerHTML="<span>"+label+"</span><strong>"+label+"</strong><span>"+label+"</span>";if(clickable)button.onclick=function(){playCard(index,card)};else button.disabled=true;return button}
  function renderTable(){if(!lobby)return;var mine=lobby.currentUserId===user.id;$("turn-label").textContent=lobby.winnerId?(lobby.winnerId===user.id?"You won the table!":"Game over"):(mine?"Your turn — play or draw":"Waiting for "+memberName(lobby.currentUserId));$("you-name").textContent=user.displayName||user.username;$("card-count").textContent=lobby.hand.length+" card"+(lobby.hand.length===1?"":"s");var hand=$("hand");hand.innerHTML="";hand.classList.toggle("locked",!mine);lobby.hand.forEach(function(card,index){hand.appendChild(cardElement(card,index,mine))});var discard=$("discard-pile");discard.innerHTML="";if(lobby.topCard)discard.appendChild(cardElement(lobby.topCard,0,false));var opponents=$("opponents");opponents.innerHTML="";lobby.members.filter(function(m){return m.userId!==user.id}).forEach(function(member){var el=document.createElement("div");el.className="opponent"+(member.userId===lobby.currentUserId?" turn":"");el.innerHTML='<span class="avatar">'+escapeHtml((member.displayName||member.username).charAt(0).toUpperCase())+'</span><span><b>'+escapeHtml(member.displayName||member.username)+'</b><br><small>'+member.cardCount+' cards</small></span><div class="mini-cards"><i></i><i></i><i></i></div>';opponents.appendChild(el)})}
  function memberName(id){var member=lobby.members.find(function(item){return item.userId===id});return member?(member.displayName||member.username):"another player"}
  async function playCard(index,card){if(card.color==="wild"){pendingCard=index;show("color-modal");return}await action({action:"play",cardIndex:index})}
  async function action(body){if(!lobby)return;body.lobbyId=lobby.id;try{var data=await call("/api/boardgames/uno/action",{method:"POST",body:body});if(data.lobby.status==="lobby")enterLobby(data.lobby);else enterTable(data.lobby)}catch(e){toast(e.message);await poll()}}
  function startPoll(){clearTimeout(pollTimer);pollTimer=null;if(!pollBusy)poll()}
  async function poll(){
    if(!lobby){pollBusy=false;return}
    if(document.hidden){pollTimer=setTimeout(poll,850);return}
    if(pollBusy)return;
    pollBusy=true;
    try{
      var data=await call("/api/boardgames/uno/lobbies?id="+encodeURIComponent(lobby.id));
      setConnected(true);
      lobby=data.lobby;
      if(lobby.status==="lobby"){
        if($("lobby-view").hidden)enterLobby(lobby);else renderLobby();
      }else{
        if($("table-view").hidden)enterTable(lobby);else renderTable();
      }
    }catch(e){setConnected(false)}
    finally{pollBusy=false;if(lobby)pollTimer=setTimeout(poll,850)}
  }
  $("account-button").onclick=function(){if(user){toast("Signed in as "+user.username);return}show("auth-modal")};
  document.querySelectorAll(".close-modal").forEach(function(button){button.onclick=function(){button.closest(".modal").hidden=true}});
  $("auth-mode").onclick=function(){registerMode=!registerMode;$("auth-title").textContent=registerMode?"Create your Nova account":"Sign in to play";$("auth-mode").textContent=registerMode?"Already have an account? Sign in":"New to Nova? Create an account";$("auth-form").querySelector("button").textContent=registerMode?"Create account":"Sign in"};
  $("auth-form").onsubmit=async function(event){event.preventDefault();$("auth-error").textContent="";try{var method=registerMode?NovaAPI.register:NovaAPI.login;await method({username:$("auth-username").value,password:$("auth-password").value});var me=await NovaAPI.me();NovaAPI.cacheUser(me.user);setUser(me.user);hide("auth-modal");await loadFriends();await loadInvites();toast("Welcome, "+me.user.username)}catch(e){$("auth-error").textContent=e.message}};
  $("create-lobby").onclick=createLobby;$("open-join").onclick=function(){if(requireUser()){show("join-modal");$("join-code").focus()}};$("join-form").onsubmit=function(event){event.preventDefault();joinLobby($("join-code").value)};$("join-code").oninput=function(){this.value=this.value.toUpperCase().replace(/[^A-Z2-9]/g,"")};
  $("copy-code").onclick=function(){navigator.clipboard.writeText(lobby.code).then(function(){toast("Lobby code copied")})};
  $("invite-friend").onclick=async function(){var username=$("friend-picker").value;if(!username)return toast("Choose a friend first");try{await call("/api/boardgames/uno/invite",{method:"POST",body:{lobbyId:lobby.id,username:username}});toast("Invite sent to "+username)}catch(e){toast(e.message)}};
  $("start-game").onclick=function(){action({action:"start"})};$("leave-lobby").onclick=async function(){if(!lobby)return;var leaving=lobby;clearTimeout(pollTimer);try{await call("/api/boardgames/uno/leave",{method:"POST",body:{lobbyId:leaving.id}})}catch(e){toast(e.message);startPoll();return}lobby=null;hide("lobby-view");show("landing");loadInvites()};
  $("draw-pile").onclick=function(){if(lobby&&lobby.currentUserId===user.id)action({action:"draw"});else toast("Wait for your turn")};$("draw-pile").onkeydown=function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();this.click()}};
  document.querySelectorAll("[data-color]").forEach(function(button){button.onclick=function(){hide("color-modal");action({action:"play",cardIndex:pendingCard,color:button.dataset.color});pendingCard=-1}});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")document.querySelectorAll(".modal:not([hidden])").forEach(function(modal){modal.hidden=true})});
  document.addEventListener("visibilitychange",function(){if(!document.hidden&&lobby)startPoll()});
  boot();
})();
