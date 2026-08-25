(function(){
"use strict";

function NovaVoiceMesh(options){
  this.roomId=options.roomId;
  this.me=options.me;
  this.stream=options.stream||null;
  this.iceServers=options.iceServers||[{urls:["stun:stun.cloudflare.com:3478"]}];
  this.onTrack=options.onTrack||function(){};
  this.onPeerState=options.onPeerState||function(){};
  this.sendSignal=options.sendSignal;
  this.peers=new Map();
  this.pendingIce=new Map();
  this.retryTimers=new Map();
  this.watchdogs=new Map();
  this.closed=false;
}
NovaVoiceMesh.prototype._emit=function(id,state){
  try{this.onPeerState(id,state)}catch(e){}
};
NovaVoiceMesh.prototype._closePeer=function(id){
  var pc=this.peers.get(id);
  if(pc){try{pc.close()}catch(e){}}
  this.peers.delete(id);
  var timer=this.retryTimers.get(id);
  if(timer)clearTimeout(timer);
  this.retryTimers.delete(id);
  var watchdog=this.watchdogs.get(id);
  if(watchdog)clearTimeout(watchdog);
  this.watchdogs.delete(id);
};
NovaVoiceMesh.prototype._watch=function(userId){
  var self=this;
  var old=this.watchdogs.get(userId);
  if(old)clearTimeout(old);
  var timer=setTimeout(function(){
    self.watchdogs.delete(userId);
    var pc=self.peers.get(userId);
    if(!pc||self.closed)return;
    var state=pc.connectionState||pc.iceConnectionState||"new";
    if(state!=="connected"){
      self._emit(userId,"retrying");
      self._closePeer(userId);
      if(String(self.me.id)<String(userId))self._offer(userId,true);
    }
  },8000);
  this.watchdogs.set(userId,timer);
};
NovaVoiceMesh.prototype._pc=function(userId){
  var self=this;
  if(this.peers.has(userId))return this.peers.get(userId);
  var pc=new RTCPeerConnection({
    iceServers:this.iceServers,
    bundlePolicy:"max-bundle",
    iceCandidatePoolSize:2
  });
  if(this.stream&&this.stream.getAudioTracks().length){
    this.stream.getAudioTracks().forEach(function(track){pc.addTrack(track,self.stream)});
  }else{
    // A user who denied mic permission should still be able to receive audio.
    try{pc.addTransceiver("audio",{direction:"recvonly"})}catch(e){}
  }
  pc.onicecandidate=function(e){
    if(e.candidate)self.sendSignal(userId,"ice",{candidate:e.candidate.toJSON?e.candidate.toJSON():e.candidate}).catch(function(){});
  };
  pc.ontrack=function(e){
    var remote=e.streams&&e.streams[0]?e.streams[0]:new MediaStream([e.track]);
    console.debug("[Nova Voice] remote audio track",userId,e.track&&e.track.readyState,e.track&&e.track.muted);
    self.onTrack(userId,remote);
    if(e.track)e.track.onunmute=function(){self.onTrack(userId,remote)};
  };
  pc.onconnectionstatechange=function(){
    var state=pc.connectionState||"new";
    self._emit(userId,state);
    if(state==="connected"){
      var t=self.retryTimers.get(userId);if(t)clearTimeout(t);self.retryTimers.delete(userId);
      var wd=self.watchdogs.get(userId);if(wd)clearTimeout(wd);self.watchdogs.delete(userId);
    }else if(state==="connecting"||state==="new"){
      self._watch(userId);
    }else if(state==="failed"){
      self._scheduleRetry(userId,500);
    }else if(state==="disconnected"){
      self._scheduleRetry(userId,2200);
    }else if(state==="closed"){
      self._closePeer(userId);
    }
  };
  pc.oniceconnectionstatechange=function(){
    if(pc.iceConnectionState==="failed")self._scheduleRetry(userId,400);
  };
  this.peers.set(userId,pc);
  return pc;
};
NovaVoiceMesh.prototype._flushIce=async function(userId,pc){
  var list=this.pendingIce.get(userId)||[];
  this.pendingIce.delete(userId);
  for(var i=0;i<list.length;i++)try{await pc.addIceCandidate(list[i])}catch(e){}
};
NovaVoiceMesh.prototype._offer=async function(userId,iceRestart){
  if(this.closed)return;
  var pc=this._pc(userId);
  try{
    var offer=await pc.createOffer(iceRestart?{iceRestart:true}:undefined);
    await pc.setLocalDescription(offer);
    await this.sendSignal(userId,"offer",{description:pc.localDescription});
    this._emit(userId,"connecting");
    this._watch(userId);
  }catch(e){
    this._emit(userId,"failed");
    this._scheduleRetry(userId,1000);
  }
};
NovaVoiceMesh.prototype._scheduleRetry=function(userId,delay){
  var self=this;
  if(this.closed||this.retryTimers.has(userId))return;
  var timer=setTimeout(async function(){
    self.retryTimers.delete(userId);
    self._closePeer(userId);
    if(String(self.me.id)<String(userId))await self._offer(userId,true);
  },delay||1000);
  this.retryTimers.set(userId,timer);
};
NovaVoiceMesh.prototype.ensurePeers=async function(members){
  if(this.closed)return;
  var self=this;
  var live=new Set((members||[]).filter(function(m){return m.status==="connected"&&m.userId!==self.me.id}).map(function(m){return m.userId}));
  Array.from(this.peers.keys()).forEach(function(id){if(!live.has(id))self._closePeer(id)});
  for(const member of members||[]){
    if(member.status!=="connected"||member.userId===this.me.id)continue;
    if(this.peers.has(member.userId))continue;
    if(String(this.me.id)<String(member.userId))await this._offer(member.userId,false);
  }
};
NovaVoiceMesh.prototype.handleSignal=async function(signal){
  if(this.closed||!signal||!signal.fromUserId)return;
  var from=signal.fromUserId,pc=this._pc(from);
  try{
    if(signal.kind==="offer"){
      // If an old local offer exists, roll it back before accepting the fresh one.
      if(pc.signalingState==="have-local-offer"){
        try{await pc.setLocalDescription({type:"rollback"})}catch(e){}
      }
      await pc.setRemoteDescription(signal.payload.description);
      await this._flushIce(from,pc);
      var answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.sendSignal(from,"answer",{description:pc.localDescription});
      this._emit(from,"connecting");
    }else if(signal.kind==="answer"){
      if(pc.signalingState==="have-local-offer"){
        await pc.setRemoteDescription(signal.payload.description);
        await this._flushIce(from,pc);
      }
    }else if(signal.kind==="ice"&&signal.payload&&signal.payload.candidate){
      var candidate=new RTCIceCandidate(signal.payload.candidate);
      if(pc.remoteDescription)await pc.addIceCandidate(candidate);
      else{
        var pending=this.pendingIce.get(from)||[];
        pending.push(candidate);this.pendingIce.set(from,pending);
      }
    }
  }catch(e){
    console.warn("[Nova Voice] signaling failure",signal.kind,from,e);
    this._emit(from,"failed");
    this._scheduleRetry(from,900);
  }
};
NovaVoiceMesh.prototype.setMuted=function(value){
  if(this.stream)this.stream.getAudioTracks().forEach(function(t){t.enabled=!value});
};
NovaVoiceMesh.prototype.close=function(){
  this.closed=true;
  var self=this;
  Array.from(this.peers.keys()).forEach(function(id){self._closePeer(id)});
  this.pendingIce.clear();
  this.watchdogs.forEach(function(t){clearTimeout(t)});this.watchdogs.clear();
};
window.NovaVoiceMesh=NovaVoiceMesh;
})();