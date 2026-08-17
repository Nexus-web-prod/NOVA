/**
 * Nova 7 — Supernova Voice Rooms
 * Server-authoritative room admission + Durable Object signaling + WebRTC mesh.
 * Live dictation is ephemeral and can only originate from SpeechRecognition.
 */
(function () {
  "use strict";

  var MAX_TRANSCRIPT_LINES = 80;
  var ROOM_POLL_MS = 8000;
  var state = {
    rooms: [], room: null, roomId: "", me: null, canCreate: false,
    ws: null, wsLobby: false, reconnects: 0, leaving: false,
    localStream: null, peers: new Map(), peerRetries: new Map(), remoteAudio: new Map(), iceServers: [], relayAvailable: false, relayConfigured: false,
    muted: false, hostMuted: false, deafened: false, pushToTalk: localStorage.getItem("nova_voice_ptt") === "1",
    dictationEnabled: true, recognition: null, transcript: [], interim: "",
    currentPane: "everyone", pollTimer: 0, speaking: false, pttPressed: false, audioContext: null, analyserTimer: 0,
    roomStartedAt: 0, durationTimer: 0, pendingIce: new Map(), lastRoomHash: "", documentBound: false, networkWarningShown: false
  };

  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]; }); }
  function toast(message, tone) {
    if (typeof window.toast === "function") return window.toast(message, tone);
    console.log("[Nova Voice]", message);
  }
  function account() {
    try { return JSON.parse(localStorage.getItem("nova_account") || "null"); } catch (error) { return null; }
  }
  function svg(name) {
    var icons = {
      voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>',
      mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 5.2 2M17 10v2a7 7 0 0 1-.5 2.6M5 10v2a7 7 0 0 0 10.5 6.1M12 19v3M8 22h8M3 3l18 18"/></svg>',
      headphones: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-2v-7h4M4 14h4v7H6a2 2 0 0 1-2-2Z"/></svg>',
      leave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c3.6-2.4 7.2-2.4 10.8 0l2-2a1.4 1.4 0 0 1 2 0l1.3 1.3a1.4 1.4 0 0 1 0 2c-5.9 5.9-15.5 5.9-21.4 0a1.4 1.4 0 0 1 0-2l1.3-1.3a1.4 1.4 0 0 1 2 0Z"/></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
      lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
    };
    return icons[name] || "";
  }

  function ensureUI() {
    if (!$('nova-vc-sidebar-section')) {
      var everyone = $('social-everyone-tab');
      if (everyone) {
        var section = document.createElement('section');
        section.id = 'nova-vc-sidebar-section';
        section.className = 'nova-vc-sidebar-section';
        section.innerHTML = '<header><span>' + svg('voice') + ' Voice rooms</span><button type="button" id="nova-vc-create" aria-label="Create voice room" title="Supernova members can start a room">+</button></header><div id="nova-vc-network-note" class="nova-vc-network-note checking"><i></i><span>Checking school-network relay…</span></div><div id="nova-vc-room-list"><div class="nova-vc-list-empty">No active rooms</div></div>';
        everyone.insertAdjacentElement('afterend', section);
      }
    }
    if (!$('nova-vc-stage')) {
      var stage = document.createElement('div');
      stage.id = 'nova-vc-stage';
      stage.className = 'nova-vc-stage hidden';
      stage.setAttribute('role', 'dialog');
      stage.setAttribute('aria-modal', 'true');
      stage.setAttribute('aria-label', 'Nova voice room');
      stage.innerHTML =
        '<div class="nova-vc-shell">' +
          '<header class="nova-vc-topbar"><div class="nova-vc-room-mark">' + svg('voice') + '</div><div class="nova-vc-room-copy"><span id="nova-vc-room-eyebrow">SUPERNOVA VOICE</span><h2 id="nova-vc-room-title">Voice room</h2><p id="nova-vc-room-meta">Connecting…</p></div><div class="nova-vc-top-actions"><span id="nova-vc-relay" class="nova-vc-relay">Checking network…</span><button type="button" id="nova-vc-transcript-button" title="Show live dictation" aria-label="Show live dictation" aria-expanded="false">CC</button><button type="button" id="nova-vc-minimize" title="Minimize" aria-label="Minimize">—</button><button type="button" id="nova-vc-close" title="Leave room" aria-label="Leave room">' + svg('close') + '</button></div></header>' +
          '<div id="nova-vc-lobby" class="nova-vc-lobby hidden"><div class="nova-vc-lobby-orbit"><i></i><span>' + svg('voice') + '</span></div><h3>Waiting for admission</h3><p>A host or connected Supernova member can let you in.</p><button type="button" id="nova-vc-cancel-request">Cancel request</button></div>' +
          '<div id="nova-vc-active" class="nova-vc-active hidden"><main class="nova-vc-main"><section id="nova-vc-grace" class="nova-vc-grace hidden"></section><section id="nova-vc-requests" class="nova-vc-requests hidden"></section><div class="nova-vc-section-head"><div><span>Participants</span><strong id="nova-vc-count">0 / 6</strong></div><div id="nova-vc-host-tools"></div></div><div id="nova-vc-participants" class="nova-vc-participants"></div><footer class="nova-vc-controls"><button type="button" id="nova-vc-mute" class="nova-vc-control">' + svg('mute') + '<span>Mute</span></button><button type="button" id="nova-vc-deafen" class="nova-vc-control">' + svg('headphones') + '<span>Deafen</span></button><label class="nova-vc-device"><span>Microphone</span><select id="nova-vc-device-select" aria-label="Microphone device"></select></label><button type="button" id="nova-vc-ptt" class="nova-vc-control"><kbd>Space</kbd><span>Push to talk</span></button><button type="button" id="nova-vc-leave" class="nova-vc-control is-danger">' + svg('leave') + '<span>Leave</span></button></footer></main>' +
          '<aside class="nova-vc-dictation mobile-hidden"><header><div><span>LIVE DICTATION</span><strong>Spoken transcript</strong></div><label><input type="checkbox" id="nova-vc-dictation-toggle" checked><i></i></label></header><div id="nova-vc-dictation-notice" class="nova-vc-dictation-notice">Generated from participants’ microphones. Text may contain mistakes and disappears when the room ends.</div><div id="nova-vc-transcript" class="nova-vc-transcript"><div class="nova-vc-transcript-empty">Spoken words will appear here. There is no text input.</div></div><div id="nova-vc-interim" class="nova-vc-interim hidden"></div></aside></div>' +
        '</div>';
      ($('ni-social-dock') || document.body).appendChild(stage);
    }
    if (!$('nova-vc-create-modal')) {
      var modal = document.createElement('div');
      modal.id = 'nova-vc-create-modal';
      modal.className = 'nova-vc-modal hidden';
      modal.innerHTML = '<div class="nova-vc-modal-card" role="dialog" aria-modal="true"><span>SUPERNOVA VOICE</span><h2>Start a voice room</h2><label>Room name<input id="nova-vc-name" maxlength="48" autocomplete="off" placeholder="After school hangout"></label><label>Who can request access<select id="nova-vc-scope"><option value="everyone">Everyone on Nova</option><option value="friends">Friends</option><option value="invite">Invited people only</option></select></label><label id="nova-vc-invites-field" class="hidden">Invite friends <input id="nova-vc-invites" maxlength="160" autocomplete="off" placeholder="@alex, @sam"><small>Up to three accepted friends, separated by commas.</small></label><div class="nova-vc-consent">Live dictation is enabled by default. Nova does not record audio, and the transcript is deleted when the room ends.</div><footer><button type="button" id="nova-vc-create-cancel">Cancel</button><button type="button" id="nova-vc-create-confirm">Start room</button></footer></div>';
      ($('ni-social-dock') || document.body).appendChild(modal);
    }
    if (!$('ni-voice-live')) {
      var socialPanel = document.querySelector('[data-ni-panel="friends"]');
      if (socialPanel) {
        var live = document.createElement('button');
        live.id = 'ni-voice-live';
        live.className = 'ni-voice-live hidden';
        live.type = 'button';
        live.innerHTML = '<span class="ni-voice-pulse"></span><span><small>VOICE CONNECTED</small><strong id="ni-voice-title">Room</strong></span><em id="ni-voice-count">1</em>';
        socialPanel.prepend(live);
      }
    }
    bindUI();
  }

  function bindUI() {
    var create = $('nova-vc-create');
    if (create && !create.dataset.bound) { create.dataset.bound = '1'; create.onclick = openCreateModal; }
    var cancel = $('nova-vc-create-cancel');
    if (cancel && !cancel.dataset.bound) { cancel.dataset.bound = '1'; cancel.onclick = closeCreateModal; }
    var confirm = $('nova-vc-create-confirm');
    if (confirm && !confirm.dataset.bound) { confirm.dataset.bound = '1'; confirm.onclick = createRoom; }
    var scope = $('nova-vc-scope');
    if (scope && !scope.dataset.bound) { scope.dataset.bound = '1'; scope.onchange = syncInviteField; }
    var minimize = $('nova-vc-minimize');
    if (minimize && !minimize.dataset.bound) { minimize.dataset.bound = '1'; minimize.onclick = minimizeStage; }
    var transcriptButton = $('nova-vc-transcript-button');
    if (transcriptButton && !transcriptButton.dataset.bound) { transcriptButton.dataset.bound = '1'; transcriptButton.onclick = toggleMobileTranscript; }
    ['nova-vc-close', 'nova-vc-leave', 'nova-vc-cancel-request'].forEach(function (id) { var button = $(id); if (button && !button.dataset.bound) { button.dataset.bound = '1'; button.onclick = leaveRoom; } });
    var mute = $('nova-vc-mute');
    if (mute && !mute.dataset.bound) { mute.dataset.bound = '1'; mute.onclick = function () { setMuted(!state.muted); }; }
    var deafen = $('nova-vc-deafen');
    if (deafen && !deafen.dataset.bound) { deafen.dataset.bound = '1'; deafen.onclick = function () { setDeafened(!state.deafened); }; }
    var ptt = $('nova-vc-ptt');
    if (ptt && !ptt.dataset.bound) { ptt.dataset.bound = '1'; ptt.onclick = togglePushToTalk; }
    var dictation = $('nova-vc-dictation-toggle');
    if (dictation && !dictation.dataset.bound) { dictation.dataset.bound = '1'; dictation.onchange = function () { setDictation(dictation.checked); }; }
    var devices = $('nova-vc-device-select');
    if (devices && !devices.dataset.bound) { devices.dataset.bound = '1'; devices.onchange = function () { switchMicrophone(devices.value); }; }
    var island = $('ni-voice-live');
    if (island && !island.dataset.bound) { island.dataset.bound = '1'; island.onclick = showStage; }
    var list = $('nova-vc-room-list');
    if (list && !list.dataset.bound) { list.dataset.bound = '1'; list.onclick = function (event) { var room = event.target.closest('[data-vc-room]'); if (room) previewRoom(room.dataset.vcRoom); }; }
    var participants = $('nova-vc-participants');
    if (participants && !participants.dataset.bound) { participants.dataset.bound = '1'; participants.onclick = participantAction; }
    var requests = $('nova-vc-requests');
    if (requests && !requests.dataset.bound) { requests.dataset.bound = '1'; requests.onclick = admissionAction; }
    var tools = $('nova-vc-host-tools');
    if (tools && !tools.dataset.bound) { tools.dataset.bound = '1'; tools.onclick = hostToolAction; }
    if (!state.documentBound) {
      state.documentBound = true;
      document.addEventListener('keydown', pushToTalkDown);
      document.addEventListener('keyup', pushToTalkUp);
    }
  }

  async function refreshRooms() {
    if (!account() || !window.NovaAPI) return renderRooms([]);
    try {
      var payload = await NovaAPI.voiceRooms();
      state.rooms = payload.rooms || [];
      state.canCreate = !!payload.canCreate;
      state.relayConfigured = !!payload.relayConfigured;
      renderNetworkStatus();
      renderRooms(state.rooms);
    } catch (error) {
      if (error.code !== 'AUTH_REQUIRED') console.warn('[Nova Voice] room refresh failed', error);
    }
  }

  function renderRooms(rooms) {
    ensureUI();
    var list = $('nova-vc-room-list');
    if (!list) return;
    var create = $('nova-vc-create');
    if (create) { create.disabled = !state.canCreate; create.classList.toggle('is-locked', !state.canCreate); }
    if (!rooms.length) { list.innerHTML = '<div class="nova-vc-list-empty">No active rooms</div>'; return; }
    list.innerHTML = rooms.map(function (room) {
      var mine = state.roomId === room.id;
      var publicRoom = room.scopeType === 'friends' && room.scopeId === 'everyone';
      return '<button type="button" class="nova-vc-room-row' + (mine ? ' active' : '') + '" data-vc-room="' + esc(room.id) + '"><span class="nova-vc-room-dot"></span><span><strong>' + esc(room.name) + '</strong><small>' + (publicRoom ? 'Everyone · ' : '') + esc(room.hostDisplayName || room.hostUsername) + ' · ' + room.connectedCount + '/' + room.maxMembers + (room.locked ? ' · locked' : '') + '</small></span>' + (room.sponsorDeadlineAt ? '<em>ENDING</em>' : '<em>' + (mine ? 'OPEN' : 'JOIN') + '</em>') + '</button>';
    }).join('');
  }

  function renderNetworkStatus(connectionText) {
    var note = $('nova-vc-network-note');
    if (note) {
      note.classList.remove('checking', 'ready', 'blocked');
      if (state.relayConfigured || state.relayAvailable) {
        note.classList.add('ready');
        note.querySelector('span').textContent = 'School-network relay ready';
      } else {
        note.classList.add('blocked');
        note.querySelector('span').textContent = 'Direct audio only · restricted Wi-Fi may block calls';
      }
    }
    if (connectionText) setConnectionLabel(connectionText);
  }

  function openIslandSocial() {
    var island = $('nova-island');
    var star = $('nova-island-star');
    if (island && !island.classList.contains('open') && star) star.click();
    var socialTab = document.querySelector('.ni-tab[data-ni-tab="friends"]');
    if (socialTab && !socialTab.classList.contains('active')) socialTab.click();
  }

  function openCreateModal() {
    if (!state.canCreate) return toast('Supernova is required to start a voice room');
    openIslandSocial();
    var scope = $('nova-vc-scope');
    var groupId = state.currentPane.indexOf('group:') === 0 ? state.currentPane.slice(6) : '';
    if (scope) {
      scope.innerHTML = '<option value="everyone">Everyone on Nova</option><option value="friends">Friends</option><option value="invite">Invited people only</option>' + (groupId ? '<option value="group:' + esc(groupId) + '">Current Social group</option>' : '');
      // Make public discovery the default even when the modal opens from a
      // group pane. Restricted audiences require an intentional selection.
      scope.value = 'everyone';
    }
    syncInviteField();
    var acct = account();
    $('nova-vc-name').value = (acct && (acct.displayName || acct.username) || 'Nova') + "'s room";
    $('nova-vc-create-modal').classList.remove('hidden');
    setTimeout(function () { $('nova-vc-name').focus(); $('nova-vc-name').select(); }, 30);
  }
  function syncInviteField() {
    var field = $('nova-vc-invites-field');
    if (field) field.classList.toggle('hidden', $('nova-vc-scope')?.value !== 'invite');
  }
  function toggleMobileTranscript() {
    var panel = document.querySelector('.nova-vc-dictation');
    var button = $('nova-vc-transcript-button');
    if (!panel || !button) return;
    var opening = panel.classList.contains('mobile-hidden');
    panel.classList.toggle('mobile-hidden', !opening);
    button.classList.toggle('active', opening);
    button.setAttribute('aria-expanded', opening ? 'true' : 'false');
  }
  function closeCreateModal() { $('nova-vc-create-modal')?.classList.add('hidden'); }
  async function createRoom() {
    var button = $('nova-vc-create-confirm');
    var name = $('nova-vc-name').value.trim();
    if (name.length < 2) return toast('Enter a room name');
    button.disabled = true; button.textContent = 'Starting…';
    try {
      var scope = $('nova-vc-scope').value;
      var invites = ($('nova-vc-invites')?.value || '').split(',').map(function (value) { return value.trim().replace(/^@/, ''); }).filter(Boolean);
      if (scope === 'invite' && !invites.length) throw new Error('Add at least one friend to an invite-only room');
      var payload = await NovaAPI.createVoiceRoom({ name: name, scope: scope, invites: invites });
      closeCreateModal();
      state.room = payload.room; state.roomId = payload.room.id;
      await connectToRoom(payload.room, false);
      await refreshRooms();
    } catch (error) { toast(error.message || 'Could not start voice room'); }
    finally { button.disabled = false; button.textContent = 'Start room'; }
  }

  async function previewRoom(roomId) {
    if (state.roomId && state.roomId !== roomId) return toast('Leave your current room first');
    showStage();
    try {
      var payload = await NovaAPI.voiceRoom(roomId);
      state.room = payload.room; state.roomId = roomId;
      renderRoom(payload.room);
      if (['admitted', 'connected'].includes(payload.room.yourStatus)) return connectToRoom(payload.room, false);
      if (payload.room.yourStatus === 'pending') return connectToRoom(payload.room, true);
      var result = await NovaAPI.requestVoiceJoin(roomId);
      await connectToRoom(payload.room, !result.admitted);
    } catch (error) { closeStage(); toast(error.message || 'Could not open voice room'); }
  }

  async function connectToRoom(room, lobby) {
    state.room = room; state.roomId = room.id; state.wsLobby = !!lobby; state.leaving = false;
    state.hostMuted = !!room.mutedByHost;
    if (state.hostMuted) state.muted = true;
    showStage(); renderRoom(room);
    $('nova-vc-lobby').classList.toggle('hidden', !lobby);
    $('nova-vc-active').classList.toggle('hidden', lobby);
    if (!lobby) {
      try { await ensureMicrophone(); } catch (error) { toast('Microphone access was blocked. You can still listen and read dictation.'); state.muted = true; }
      await loadIceServers();
      populateDevices();
      startDictation();
      startLevelMeter();
    }
    openSocket(lobby);
    updateIsland();
  }

  function openSocket(lobby) {
    closeSocket();
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var ws = new WebSocket(protocol + '//' + location.host + '/api/voice/ws?room=' + encodeURIComponent(state.roomId));
    state.ws = ws; state.wsLobby = !!lobby;
    ws.onopen = function () { state.reconnects = 0; sendPresence(); };
    ws.onmessage = function (event) { handleSocketMessage(event.data); };
    ws.onerror = function () { setConnectionLabel('Connection problem'); };
    ws.onclose = function (event) {
      if (state.ws !== ws) return;
      state.ws = null;
      if (state.leaving || !state.roomId || event.code === 4000 || event.code === 4004) return;
      if (event.code === 4003) return setLobbyView(true);
      if (state.reconnects < 4) {
        state.reconnects += 1;
        setConnectionLabel('Reconnecting…');
        setTimeout(function () { if (state.roomId && !state.leaving) openSocket(state.wsLobby); }, Math.min(5000, 700 * state.reconnects));
      } else toast('Voice connection was lost');
    };
  }
  function closeSocket() { if (state.ws) { var old = state.ws; state.ws = null; try { old.close(1000, 'Client reconnect'); } catch (error) {} } }
  function sendSocket(message) { if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(message)); }

  async function handleSocketMessage(raw) {
    var message;
    try { message = JSON.parse(raw); } catch (error) { return; }
    if (message.type === 'welcome') {
      state.me = message.you;
      if (message.room) updateLiveRoom(message.room);
      if (!state.wsLobby) setConnectionLabel(state.relayAvailable ? 'Relay ready' : 'Direct connection');
      return;
    }
    if (message.type === 'room-state') { if (message.room) updateLiveRoom(message.room); return; }
    if (message.type === 'join-request') { await refreshCurrentRoom(); toast((message.user?.displayName || message.user?.username || 'Someone') + ' wants to join'); return; }
    if (message.type === 'admission-approved' && message.targetUserId === state.me?.userId) {
      await promoteFromLobby(); return;
    }
    if (message.type === 'admission-denied' && message.targetUserId === state.me?.userId) { toast('Your join request was denied'); return leaveRoom(); }
    if (message.type === 'offer') return receiveOffer(message.from, message.payload);
    if (message.type === 'answer') return receiveAnswer(message.from, message.payload);
    if (message.type === 'ice') return receiveIce(message.from, message.payload);
    if (message.type === 'presence') { patchMemberPresence(message); return; }
    if (message.type === 'transcript') { addTranscript(message.line); return; }
    if (message.type === 'force-mute' && message.targetUserId === state.me?.userId) {
      state.hostMuted = !!message.muted;
      if (state.room) state.room.mutedByHost = state.hostMuted;
      if (state.hostMuted) { setMuted(true, true); toast('The host muted your microphone'); }
      else { updateControls(); toast('The host allowed you to unmute'); }
      return;
    }
    if (message.type === 'host-transfer') { if (state.room) state.room.hostId = message.hostUserId; await refreshCurrentRoom(); return; }
    if (message.type === 'sponsor-grace') { showSponsorGrace(message.deadline); return; }
    if (message.type === 'removed') { toast(message.reason || 'You were removed from the room'); return leaveRoom(true); }
    if (message.type === 'room-ended') { toast(message.reason || 'Voice room ended'); return leaveRoom(true); }
  }

  async function promoteFromLobby() {
    closeSocket();
    var payload = await NovaAPI.voiceRoom(state.roomId);
    state.room = payload.room;
    await connectToRoom(payload.room, false);
    toast('You were admitted to the voice room');
  }
  function setLobbyView(lobby) { state.wsLobby = lobby; $('nova-vc-lobby')?.classList.toggle('hidden', !lobby); $('nova-vc-active')?.classList.toggle('hidden', lobby); }

  async function refreshCurrentRoom() {
    if (!state.roomId) return;
    try { var payload = await NovaAPI.voiceRoom(state.roomId); state.room = Object.assign({}, state.room || {}, payload.room); renderRoom(state.room); }
    catch (error) { if (error.code === 'VOICE_ROOM_NOT_FOUND') leaveRoom(true); }
  }

  function updateLiveRoom(room) {
    var pending = state.room?.canAdmit ? (state.room.members || []).filter(function (member) { return member.status === 'pending'; }) : [];
    var dictationWasEnabled = state.room?.dictationEnabled !== false;
    state.room = Object.assign({}, state.room || {}, room);
    if (pending.length && room.members) state.room.members = room.members.concat(pending.filter(function (candidate) { return !room.members.some(function (member) { return member.userId === candidate.userId; }); }));
    state.roomStartedAt = Number(room.createdAt || state.roomStartedAt || Date.now());
    if (state.room.dictationEnabled === false) stopDictation();
    else if (!dictationWasEnabled && state.dictationEnabled) startDictation();
    renderRoom(state.room);
    syncPeers(room.members || []);
  }

  function renderRoom(room) {
    if (!room) return;
    $('nova-vc-room-title').textContent = room.name || 'Voice room';
    $('nova-vc-room-meta').textContent = 'Hosted by ' + (room.hostDisplayName || room.hostUsername || 'Supernova') + ' · transcript is ephemeral';
    var members = (room.members || []).filter(function (member) { return member.status !== 'pending'; });
    $('nova-vc-count').textContent = members.filter(function (member) { return member.connected !== false && member.status === 'connected'; }).length + ' / ' + (room.maxMembers || 4);
    $('nova-vc-participants').innerHTML = members.length ? members.map(renderParticipant).join('') : '<div class="nova-vc-participant-empty">Connecting participants…</div>';
    renderRequests(room);
    renderHostTools(room);
    showSponsorGrace(room.sponsorDeadlineAt);
    updateControls(); updateIsland();
  }

  function renderParticipant(member) {
    var self = member.userId === state.me?.userId;
    var host = member.userId === state.room?.hostId || member.role === 'host';
    var pro = member.isSupernova || member.role === 'supernova' || host;
    var avatar = member.avatarUrl ? '<img src="' + esc(member.avatarUrl) + '" alt="">' : esc((member.displayName || member.username || '?').charAt(0).toUpperCase());
    var actions = '';
    if (state.room?.canManage && !self) actions = '<div class="nova-vc-member-actions"><button data-vc-member-action="mute" data-muted="' + (member.mutedByHost ? '1' : '0') + '" data-user="' + esc(member.username) + '">' + (member.mutedByHost ? 'Allow unmute' : 'Mute') + '</button>' + (pro && member.status === 'connected' ? '<button data-vc-member-action="transfer" data-user="' + esc(member.username) + '">Make host</button>' : '') + '<button class="danger" data-vc-member-action="kick" data-user="' + esc(member.username) + '">Remove</button></div>';
    else if (!self) actions = '<div class="nova-vc-member-actions"><button data-vc-member-action="report" data-user="' + esc(member.username) + '">Report</button></div>';
    return '<article class="nova-vc-participant' + (member.speaking ? ' speaking' : '') + (member.connected === false || member.status !== 'connected' ? ' reconnecting' : '') + '" data-user-id="' + esc(member.userId) + '"><div class="nova-vc-avatar">' + avatar + '<i></i></div><div class="nova-vc-member-copy"><strong>' + esc(member.displayName || member.username) + (self ? ' <small>(you)</small>' : '') + '</strong><span>' + (host ? 'Host' : pro ? 'Supernova' : 'Participant') + (member.muted || member.mutedByHost ? ' · muted' : member.speaking ? ' · speaking' : '') + '</span></div>' + actions + '</article>';
  }

  function renderRequests(room) {
    var wrap = $('nova-vc-requests');
    var pending = room.canAdmit ? (room.members || []).filter(function (member) { return member.status === 'pending'; }) : [];
    wrap.classList.toggle('hidden', !pending.length);
    wrap.innerHTML = pending.length ? '<header><span>Waiting room</span><strong>' + pending.length + '</strong></header>' + pending.map(function (member) { return '<div><span><strong>' + esc(member.displayName || member.username) + '</strong><small>@' + esc(member.username) + '</small></span><button data-admit="approve" data-user="' + esc(member.username) + '">Admit</button><button class="deny" data-admit="deny" data-user="' + esc(member.username) + '">Deny</button></div>'; }).join('') : '';
  }

  function renderHostTools(room) {
    var tools = $('nova-vc-host-tools');
    if (!room.canManage) { tools.innerHTML = ''; return; }
    tools.innerHTML = '<button data-host-action="lock" class="' + (room.locked ? 'active' : '') + '">' + svg('lock') + (room.locked ? ' Unlock' : ' Lock') + '</button><button data-host-action="dictation" class="' + (room.dictationEnabled ? 'active' : '') + '">Dictation</button><button data-host-action="end" class="danger">End room</button>';
  }

  async function admissionAction(event) {
    var button = event.target.closest('[data-admit]'); if (!button) return;
    button.disabled = true;
    try { await NovaAPI.admitVoiceMember(state.roomId, button.dataset.user, button.dataset.admit); await refreshCurrentRoom(); }
    catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }
  async function participantAction(event) {
    var button = event.target.closest('[data-vc-member-action]'); if (!button) return;
    var action = button.dataset.vcMemberAction, username = button.dataset.user;
    if (action === 'report') return openReportPrompt(username);
    if ((action === 'kick' || action === 'transfer') && !confirm((action === 'kick' ? 'Remove ' : 'Transfer host to ') + username + '?')) return;
    button.disabled = true;
    try {
      var body = { roomId: state.roomId, action: action, username: username };
      if (action === 'mute') body.muted = button.dataset.muted !== '1';
      await NovaAPI.voiceAction(body); await refreshCurrentRoom();
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }
  async function hostToolAction(event) {
    var button = event.target.closest('[data-host-action]'); if (!button) return;
    var action = button.dataset.hostAction;
    if (action === 'end' && !confirm('End this voice room for everyone?')) return;
    var body = { roomId: state.roomId, action: action };
    if (action === 'lock') body.enabled = !state.room.locked;
    if (action === 'dictation') body.enabled = !state.room.dictationEnabled;
    button.disabled = true;
    try { await NovaAPI.voiceAction(body); if (action !== 'end') await refreshCurrentRoom(); }
    catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }

  function openReportPrompt(username) {
    var reason = prompt('Why are you reporting ' + username + '?');
    if (!reason) return;
    var excerpt = state.transcript.filter(function (line) { return line.username === username; }).slice(-3).map(function (line) { return line.text; }).join(' / ').slice(0, 500);
    NovaAPI.reportVoice({ roomId: state.roomId, username: username, reason: reason, transcriptExcerpt: excerpt }).then(function () { toast('Voice report submitted'); }).catch(function (error) { toast(error.message); });
  }

  async function ensureMicrophone(deviceId) {
    var constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
    if (deviceId) constraints.audio.deviceId = { exact: deviceId };
    var stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (state.localStream) state.localStream.getTracks().forEach(function (track) { track.stop(); });
    state.localStream = stream;
    stream.getAudioTracks().forEach(function (track) { track.enabled = !state.muted && !state.pushToTalk; });
    state.peers.forEach(function (entry) {
      var sender = entry.pc.getSenders().find(function (item) { return item.track && item.track.kind === 'audio'; });
      if (sender && stream.getAudioTracks()[0]) sender.replaceTrack(stream.getAudioTracks()[0]);
    });
    return stream;
  }
  async function switchMicrophone(deviceId) { try { await ensureMicrophone(deviceId); startLevelMeter(); toast('Microphone changed'); } catch (error) { toast('Could not use that microphone'); } }
  async function populateDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      var devices = (await navigator.mediaDevices.enumerateDevices()).filter(function (device) { return device.kind === 'audioinput'; });
      var select = $('nova-vc-device-select');
      select.innerHTML = devices.map(function (device, index) { return '<option value="' + esc(device.deviceId) + '">' + esc(device.label || 'Microphone ' + (index + 1)) + '</option>'; }).join('');
    } catch (error) {}
  }
  async function loadIceServers() {
    try { var payload = await NovaAPI.voiceIce(state.roomId); state.iceServers = payload.iceServers || []; state.relayAvailable = !!payload.relayAvailable; state.relayConfigured = state.relayConfigured || state.relayAvailable; }
    catch (error) { state.iceServers = [{ urls: ['stun:stun.cloudflare.com:3478'] }]; state.relayAvailable = false; }
    renderNetworkStatus(state.relayAvailable ? 'School-network relay ready' : 'Direct only · Wi-Fi may block audio');
  }
  function setConnectionLabel(text) { var label = $('nova-vc-relay'); if (label) { label.textContent = text; label.classList.toggle('ready', state.relayAvailable); } }

  function ensurePeer(userId) {
    if (!userId || userId === state.me?.userId) return null;
    if (state.peers.has(userId)) return state.peers.get(userId);
    var pc = new RTCPeerConnection({ iceServers: state.iceServers });
    var entry = { pc: pc, makingOffer: false, pendingIce: [], connectionTimer: 0 };
    state.peers.set(userId, entry);
    if (state.localStream) state.localStream.getTracks().forEach(function (track) { pc.addTrack(track, state.localStream); });
    pc.onicecandidate = function (event) { if (event.candidate) sendSocket({ type: 'ice', to: userId, payload: { candidate: event.candidate.toJSON() } }); };
    pc.ontrack = function (event) { attachRemoteAudio(userId, event.streams[0]); };
    entry.connectionTimer = setTimeout(function () {
      if (!['connected', 'closed'].includes(pc.connectionState)) {
        renderNetworkStatus(state.relayAvailable ? 'Relay negotiation is taking longer than expected' : 'Wi-Fi blocked the direct audio path');
        if (!state.relayAvailable && !state.networkWarningShown) {
          state.networkWarningShown = true;
          toast('This Wi-Fi blocks direct voice. Nova needs its school-network relay enabled.');
        }
      }
    }, 12000);
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'connected') {
        clearTimeout(entry.connectionTimer);
        state.peerRetries.delete(userId);
        renderNetworkStatus(state.relayAvailable ? 'Relay connected' : 'Direct audio connected');
        return;
      }
      if (pc.connectionState === 'failed') retryPeer(userId);
      if (pc.connectionState === 'closed') clearTimeout(entry.connectionTimer);
    };
    pc.onicecandidateerror = function () {
      if (!state.relayAvailable) renderNetworkStatus('Direct audio blocked · relay required on this Wi-Fi');
    };
    return entry;
  }

  function retryPeer(userId) {
    var retries = Number(state.peerRetries.get(userId) || 0);
    closePeer(userId);
    if (retries >= 2) {
      renderNetworkStatus(state.relayAvailable ? 'Audio connection failed · try leaving and rejoining' : 'Wi-Fi blocked voice · relay setup required');
      return;
    }
    state.peerRetries.set(userId, retries + 1);
    setTimeout(function () {
      if (!state.roomId || state.wsLobby || !state.me) return;
      ensurePeer(userId);
      if (state.me.userId < userId) makeOffer(userId);
    }, 800 + retries * 900);
  }
  async function makeOffer(userId) {
    var entry = ensurePeer(userId); if (!entry || entry.makingOffer || entry.pc.signalingState !== 'stable') return;
    entry.makingOffer = true;
    try { var offer = await entry.pc.createOffer(); await entry.pc.setLocalDescription(offer); sendSocket({ type: 'offer', to: userId, payload: { sdp: entry.pc.localDescription } }); }
    catch (error) { console.warn('[Nova Voice] offer failed', error); }
    finally { entry.makingOffer = false; }
  }
  async function receiveOffer(userId, payload) {
    var current = state.peers.get(userId);
    if (current && ['failed', 'closed'].includes(current.pc.connectionState)) closePeer(userId);
    var entry = ensurePeer(userId); if (!entry || !payload?.sdp) return;
    try { await entry.pc.setRemoteDescription(payload.sdp); await flushIce(entry); var answer = await entry.pc.createAnswer(); await entry.pc.setLocalDescription(answer); sendSocket({ type: 'answer', to: userId, payload: { sdp: entry.pc.localDescription } }); }
    catch (error) { console.warn('[Nova Voice] answer failed', error); }
  }
  async function receiveAnswer(userId, payload) { var entry = state.peers.get(userId); if (!entry || !payload?.sdp) return; try { await entry.pc.setRemoteDescription(payload.sdp); await flushIce(entry); } catch (error) {} }
  async function receiveIce(userId, payload) {
    var entry = ensurePeer(userId); if (!entry || !payload?.candidate) return;
    if (!entry.pc.remoteDescription) return entry.pendingIce.push(payload.candidate);
    try { await entry.pc.addIceCandidate(payload.candidate); } catch (error) {}
  }
  async function flushIce(entry) { var items = entry.pendingIce.splice(0); for (var i = 0; i < items.length; i++) try { await entry.pc.addIceCandidate(items[i]); } catch (error) {} }
  function syncPeers(members) {
    if (state.wsLobby || !state.me) return;
    var connected = members.filter(function (member) { return member.connected && member.userId !== state.me.userId; }).map(function (member) { return member.userId; });
    Array.from(state.peers.keys()).forEach(function (userId) { if (connected.indexOf(userId) < 0) closePeer(userId); });
    connected.forEach(function (userId) { ensurePeer(userId); if (state.me.userId < userId) makeOffer(userId); });
  }
  function attachRemoteAudio(userId, stream) {
    var audio = state.remoteAudio.get(userId);
    if (!audio) { audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; audio.dataset.voiceUser = userId; document.body.appendChild(audio); state.remoteAudio.set(userId, audio); }
    audio.srcObject = stream; audio.muted = state.deafened;
  }
  function closePeer(userId) { var entry = state.peers.get(userId); if (entry) { clearTimeout(entry.connectionTimer); try { entry.pc.close(); } catch (error) {} state.peers.delete(userId); } var audio = state.remoteAudio.get(userId); if (audio) { audio.remove(); state.remoteAudio.delete(userId); } }
  function closeAllPeers() { Array.from(state.peers.keys()).forEach(closePeer); }

  function setMuted(muted, forced) {
    if (state.hostMuted && !muted && !forced) return toast('The host muted your microphone');
    state.muted = !!muted;
    if (state.localStream) state.localStream.getAudioTracks().forEach(function (track) { track.enabled = !state.muted && !state.pushToTalk; });
    sendPresence(); updateControls();
  }
  function setDeafened(deafened) { state.deafened = !!deafened; state.remoteAudio.forEach(function (audio) { audio.muted = state.deafened; }); sendPresence(); updateControls(); }
  function togglePushToTalk() { state.pushToTalk = !state.pushToTalk; localStorage.setItem('nova_voice_ptt', state.pushToTalk ? '1' : '0'); if (state.pushToTalk && state.localStream) state.localStream.getAudioTracks().forEach(function (track) { track.enabled = false; }); else if (!state.muted && state.localStream) state.localStream.getAudioTracks().forEach(function (track) { track.enabled = true; }); updateControls(); }
  function pushToTalkDown(event) { if (!state.pushToTalk || event.code !== 'Space' || event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return; event.preventDefault(); state.pttPressed = true; if (!state.muted && state.localStream) state.localStream.getAudioTracks().forEach(function (track) { track.enabled = true; }); }
  function pushToTalkUp(event) { if (!state.pushToTalk || event.code !== 'Space') return; event.preventDefault(); state.pttPressed = false; if (state.localStream) state.localStream.getAudioTracks().forEach(function (track) { track.enabled = false; }); }
  function sendPresence() { sendSocket({ type: 'presence', muted: state.muted, deafened: state.deafened, speaking: state.speaking }); }
  function updateControls() {
    $('nova-vc-mute')?.classList.toggle('active', state.muted); if ($('nova-vc-mute')) { $('nova-vc-mute').disabled = state.hostMuted; $('nova-vc-mute').querySelector('span').textContent = state.hostMuted ? 'Host muted' : (state.muted ? 'Unmute' : 'Mute'); }
    $('nova-vc-deafen')?.classList.toggle('active', state.deafened); if ($('nova-vc-deafen')) $('nova-vc-deafen').querySelector('span').textContent = state.deafened ? 'Undeafen' : 'Deafen';
    $('nova-vc-ptt')?.classList.toggle('active', state.pushToTalk);
    if ($('nova-vc-dictation-toggle')) $('nova-vc-dictation-toggle').checked = state.dictationEnabled;
  }

  function startLevelMeter() {
    stopLevelMeter(); if (!state.localStream || !window.AudioContext) return;
    try {
      state.audioContext = new AudioContext(); var source = state.audioContext.createMediaStreamSource(state.localStream); var analyser = state.audioContext.createAnalyser(); analyser.fftSize = 256; source.connect(analyser); var values = new Uint8Array(analyser.frequencyBinCount);
      state.analyserTimer = setInterval(function () { analyser.getByteFrequencyData(values); var average = values.reduce(function (sum, value) { return sum + value; }, 0) / values.length; var speaking = average > 16 && !state.muted && (!state.pushToTalk || state.localStream.getAudioTracks().some(function (track) { return track.enabled; })); if (speaking !== state.speaking) { state.speaking = speaking; sendPresence(); } }, 240);
    } catch (error) {}
  }
  function stopLevelMeter() { clearInterval(state.analyserTimer); state.analyserTimer = 0; if (state.audioContext) { state.audioContext.close().catch(function () {}); state.audioContext = null; } state.speaking = false; }

  function startDictation() {
    stopDictation(); if (!state.dictationEnabled || !state.room?.dictationEnabled) return;
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { $('nova-vc-dictation-notice')?.classList.add('unsupported'); return; }
    try {
      var recognition = new Recognition(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = navigator.language || 'en-US';
      recognition.onresult = function (event) { var interim = ''; for (var i = event.resultIndex; i < event.results.length; i++) { var text = event.results[i][0].transcript.trim(); if (!text) continue; if (event.results[i].isFinal) publishDictation(text); else interim += text + ' '; } state.interim = interim.trim(); renderInterim(); };
      recognition.onerror = function (event) { if (!['no-speech', 'aborted'].includes(event.error)) console.warn('[Nova Voice] dictation', event.error); };
      recognition.onend = function () { if (state.recognition === recognition && state.roomId && state.dictationEnabled) setTimeout(function () { try { recognition.start(); } catch (error) {} }, 300); };
      recognition.start(); state.recognition = recognition;
    } catch (error) {}
  }
  function stopDictation() { var recognition = state.recognition; state.recognition = null; if (recognition) try { recognition.stop(); } catch (error) {} state.interim = ''; renderInterim(); }
  async function setDictation(enabled) { state.dictationEnabled = !!enabled; try { if (state.roomId) await NovaAPI.voiceAction({ roomId: state.roomId, action: 'member-dictation', enabled: state.dictationEnabled }); } catch (error) { state.dictationEnabled = !enabled; toast(error.message); } if (state.dictationEnabled) startDictation(); else stopDictation(); updateControls(); }
  async function publishDictation(text) { if (!state.roomId || state.muted || !state.dictationEnabled || (state.pushToTalk && !state.pttPressed)) return; try { await NovaAPI.voiceTranscript(state.roomId, text); } catch (error) { if (error.code === 'DICTATION_FILTERED') toast('A dictated segment was hidden by Nova safety'); } }
  function addTranscript(line) { if (!line || !line.text) return; state.transcript.push(line); if (state.transcript.length > MAX_TRANSCRIPT_LINES) state.transcript.splice(0, state.transcript.length - MAX_TRANSCRIPT_LINES); renderTranscript(); }
  function renderTranscript() { var wrap = $('nova-vc-transcript'); if (!wrap) return; wrap.innerHTML = state.transcript.length ? state.transcript.map(function (line) { var mine = line.userId === state.me?.userId; return '<article class="nova-vc-line' + (mine ? ' mine' : '') + '"><div>' + (line.avatarUrl ? '<img src="' + esc(line.avatarUrl) + '" alt="">' : esc((line.displayName || line.username || '?').charAt(0).toUpperCase())) + '</div><p><strong>' + esc(line.displayName || line.username) + '<time>' + new Date(line.createdAt || Date.now()).toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit', hour12: true }) + '</time></strong><span>' + esc(line.text) + '</span></p></article>'; }).join('') : '<div class="nova-vc-transcript-empty">Spoken words will appear here. There is no text input.</div>'; wrap.scrollTop = wrap.scrollHeight; }
  function renderInterim() { var interim = $('nova-vc-interim'); if (!interim) return; interim.classList.toggle('hidden', !state.interim); interim.textContent = state.interim ? 'Listening: ' + state.interim : ''; }

  function patchMemberPresence(message) { if (!state.room?.members) return; var member = state.room.members.find(function (item) { return item.userId === message.userId; }); if (member) { member.muted = !!message.muted; member.deafened = !!message.deafened; member.speaking = !!message.speaking; renderRoom(state.room); } }
  function showSponsorGrace(deadline) { var grace = $('nova-vc-grace'); if (!grace) return; var remaining = Number(deadline || 0) - Date.now(); grace.classList.toggle('hidden', remaining <= 0); if (remaining > 0) grace.innerHTML = '<strong>Supernova reconnecting</strong><span>This room ends in <b>' + Math.max(1, Math.ceil(remaining / 1000)) + '</b>s unless a Supernova member returns.</span>'; }

  async function leaveRoom(localOnly) {
    if (!state.roomId) return closeStage();
    var roomId = state.roomId; state.leaving = true;
    if (!localOnly) try { await NovaAPI.leaveVoiceRoom(roomId); } catch (error) {}
    cleanupRoom(); closeStage(); refreshRooms();
  }
  function cleanupRoom() {
    closeSocket(); closeAllPeers(); stopDictation(); stopLevelMeter(); clearInterval(state.durationTimer);
    if (state.localStream) state.localStream.getTracks().forEach(function (track) { track.stop(); });
    state.localStream = null; state.room = null; state.roomId = ''; state.me = null; state.transcript = []; state.interim = ''; state.wsLobby = false; state.leaving = false; state.muted = false; state.hostMuted = false; state.deafened = false; state.peerRetries.clear(); state.networkWarningShown = false; updateIsland();
    document.querySelector('.nova-vc-dictation')?.classList.add('mobile-hidden');
    var transcriptButton = $('nova-vc-transcript-button');
    if (transcriptButton) { transcriptButton.classList.remove('active'); transcriptButton.setAttribute('aria-expanded', 'false'); }
  }
  function showStage() { ensureUI(); openIslandSocial(); $('nova-vc-stage').classList.remove('hidden', 'minimized'); document.body.classList.add('nova-vc-open'); }
  function minimizeStage() { $('nova-vc-stage')?.classList.add('minimized'); document.body.classList.remove('nova-vc-open'); updateIsland(); }
  function closeStage() { $('nova-vc-stage')?.classList.add('hidden'); document.body.classList.remove('nova-vc-open'); }
  function updateIsland() { var live = $('ni-voice-live'); if (!live) return; live.classList.toggle('hidden', !state.roomId); if (state.roomId) { $('ni-voice-title').textContent = state.room?.name || 'Voice room'; $('ni-voice-count').textContent = (state.room?.members || []).filter(function (member) { return member.status === 'connected' && member.connected !== false; }).length || 1; } }

  function startPolling() { clearInterval(state.pollTimer); refreshRooms(); state.pollTimer = setInterval(function () { if (!document.hidden) { refreshRooms(); if (state.roomId && (!state.ws || state.ws.readyState > 1)) refreshCurrentRoom(); } }, ROOM_POLL_MS); }
  function initialize() { ensureUI(); if (account()) startPolling(); else renderRooms([]); }

  document.addEventListener('DOMContentLoaded', initialize);
  document.addEventListener('nova:account-changed', initialize);
  document.addEventListener('nova:logout', function () { clearInterval(state.pollTimer); if (state.roomId) leaveRoom(); renderRooms([]); });
  document.addEventListener('nova:social-pane-opened', function (event) { state.currentPane = event.detail?.pane || 'everyone'; ensureUI(); refreshRooms(); });
  document.addEventListener('nova:page-change', function (event) { if (event.detail?.page === 'social') { ensureUI(); refreshRooms(); } });
  window.addEventListener('beforeunload', function () { if (state.ws) try { state.ws.close(1000, 'Page closed'); } catch (error) {} });

  window.NovaSocialVC = { refresh: refreshRooms, openRoom: previewRoom, leaveRoom: leaveRoom, inCall: function () { return !!state.roomId; }, show: showStage };
})();
