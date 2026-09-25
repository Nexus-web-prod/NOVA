/* Nova Eaglercraft native browser mods.
 * Fabric JARs are not loaded in the browser. This layer provides the
 * equivalent lightweight HUD/fullbright behavior for the 26.2 client.
 */
(function NovaEaglerMods(){
  "use strict";
  const state={food:null,saturation:null,health:null};

  function setFood(food,sat,health){
    if(Number.isFinite(food)) state.food=Math.max(0,Math.min(20,food));
    if(Number.isFinite(sat)) state.saturation=Math.max(0,Math.min(20,sat));
    if(Number.isFinite(health)) state.health=health;
    render();
  }

  function render(){
    if(state.food===null || state.saturation===null) return;
    let box=document.getElementById("nova-appleskin");
    if(!box){
      box=document.createElement("div");
      box.id="nova-appleskin";
      box.innerHTML='<div class="nova-as-title">AppleSkin</div><div class="nova-as-row"><span class="nova-as-food"></span><span class="nova-as-sat"></span></div><div class="nova-as-bar"><i></i></div>';
      document.body.appendChild(box);
    }
    box.querySelector(".nova-as-food").textContent="Food "+state.food+"/20";
    box.querySelector(".nova-as-sat").textContent="Saturation "+state.saturation.toFixed(1);
    box.querySelector(".nova-as-bar i").style.width=Math.min(100,(state.saturation/20)*100)+"%";
  }

  function installStyle(){
    if(document.getElementById("nova-native-mod-style")) return;
    const s=document.createElement("style");
    s.id="nova-native-mod-style";
    s.textContent=
      "#nova-appleskin{position:fixed;right:14px;bottom:56px;z-index:2147483646;padding:7px 9px;border-radius:7px;background:rgba(0,0,0,.68);color:#fff;font:12px system-ui,sans-serif;line-height:1.25;pointer-events:none;text-shadow:0 1px 2px #000;min-width:132px;box-sizing:border-box}"+
      "#nova-appleskin .nova-as-title{font-weight:700;margin-bottom:3px}"+
      "#nova-appleskin .nova-as-row{display:flex;gap:8px;justify-content:space-between}"+
      "#nova-appleskin .nova-as-bar{height:3px;margin-top:5px;background:#444;border-radius:3px;overflow:hidden}"+
      "#nova-appleskin .nova-as-bar i{display:block;height:100%;background:#f2c94c;width:0}"+
      "@media(max-width:700px){#nova-appleskin{right:8px;bottom:48px;font-size:11px}}";
    document.head.appendChild(s);
  }

  function readModAPI(){
    try{
      if(!window.ModAPI || !ModAPI.mcinstance || !ModAPI.mcinstance.player) return false;
      const p=ModAPI.mcinstance.player;
      const f=typeof p.getFoodData==="function"?p.getFoodData():p.foodData;
      if(!f) return false;
      const food=typeof f.getFoodLevel==="function"?f.getFoodLevel():f.foodLevel;
      const sat=typeof f.getSaturationLevel==="function"?f.getSaturationLevel():f.saturationLevel;
      if(Number.isFinite(Number(food)) && Number.isFinite(Number(sat))){
        setFood(Number(food),Number(sat));
        return true;
      }
    }catch(_){}
    return false;
  }

  function readVarInt(a,o){
    let v=0,s=0;
    for(let i=0;i<5 && o+i<a.length;i++){
      const b=a[o+i];
      v|=(b&127)<<s;
      if(!(b&128)) return {value:v>>>0,next:o+i+1};
      s+=7;
    }
    return null;
  }

  // Java 26.2 protocol 776 Set Health payload:
  // float health, VarInt food, float saturation.
  function scanPacket(data){
    if(!(data instanceof ArrayBuffer) && !(ArrayBuffer.isView(data))) return;
    const a=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    for(let start=0;start<a.length;start++){
      const id=readVarInt(a,start);
      if(!id || id.value!==0x5D) continue;
      const o=id.next;
      if(o+9>a.length) continue;
      const view=new DataView(a.buffer,a.byteOffset,a.byteLength);
      const health=view.getFloat32(o,false);
      const food=readVarInt(a,o+4);
      if(!food || food.value>20) continue;
      const sat=view.getFloat32(food.next,false);
      if(Number.isFinite(health)&&health>=-1&&health<=2048&&Number.isFinite(sat)&&sat>=-0.01&&sat<=20.01){
        setFood(food.value,sat,health);
        return;
      }
    }
  }

  function hookNetwork(){
    try{
      const WS=window.WebSocket;
      if(!WS || WS.__novaAppleSkinHooked) return;
      WS.__novaAppleSkinHooked=true;
      const oldDispatch=WS.prototype.dispatchEvent;
      WS.prototype.dispatchEvent=function(ev){
        try{if(ev && ev.type==="message") scanPacket(ev.data)}catch(_){}
        return oldDispatch.call(this,ev);
      };
      const oldAdd=WS.prototype.addEventListener;
      WS.prototype.addEventListener=function(type,listener,options){
        if(type==="message" && typeof listener==="function"){
          const wrapped=function(ev){
            try{scanPacket(ev.data)}catch(_){}
            return listener.call(this,ev);
          };
          return oldAdd.call(this,type,wrapped,options);
        }
        return oldAdd.call(this,type,listener,options);
      };
    }catch(_){}
  }

  function fullbright(){
    let enabled=localStorage.getItem("nova.fullbright")!=="off";
    const apply=()=>document.documentElement.classList.toggle("nova-fullbright",enabled);
    addEventListener("keydown",e=>{
      if(e.code==="F7"&&!e.repeat){enabled=!enabled;localStorage.setItem("nova.fullbright",enabled?"on":"off");apply()}
    });
    apply();
  }

  function boot(){
    installStyle();
    fullbright();
    hookNetwork();
    readModAPI();
    setInterval(()=>{readModAPI();hookNetwork()},1000);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();