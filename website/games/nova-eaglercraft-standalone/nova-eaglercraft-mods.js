/* Nova Eaglercraft native mod layer.
 * Intended for EaglerForge/ModAPI-enabled 26.2 builds.
 * No Fabric Loader/API is required.
 */
(function NovaEaglerMods(){
  "use strict";

  const state={fullbright:true, lastFood:null, lastSat:null, lastExhaustion:null};

  function number(v, fallback){
    const n=Number(v);
    return Number.isFinite(n)?n:fallback;
  }

  function player(){
    try{
      if(window.ModAPI && ModAPI.mcinstance && ModAPI.mcinstance.player) return ModAPI.mcinstance.player;
    }catch(_){}
    return null;
  }

  function foodData(p){
    try{
      if(p && typeof p.getFoodData==="function") return p.getFoodData();
      if(p && p.foodData) return p.foodData;
    }catch(_){}
    return null;
  }

  function foodLevel(){
    const p=player(), f=foodData(p);
    try{
      if(f && typeof f.getFoodLevel==="function") return number(f.getFoodLevel(),20);
    }catch(_){}
    try{
      if(window.ModAPI && ModAPI.player){
        return number(ModAPI.player.foodLevel ?? ModAPI.player.food,20);
      }
    }catch(_){}
    return null;
  }

  function saturation(){
    const p=player(), f=foodData(p);
    try{
      if(f && typeof f.getSaturationLevel==="function") return number(f.getSaturationLevel(),0);
    }catch(_){}
    try{
      if(window.ModAPI && ModAPI.player){
        return number(ModAPI.player.saturationLevel ?? ModAPI.player.saturation,0);
      }
    }catch(_){}
    return null;
  }

  function exhaustion(){
    const p=player(), f=foodData(p);
    try{
      if(f && typeof f.getExhaustionLevel==="function") return number(f.getExhaustionLevel(),0);
    }catch(_){}
    return null;
  }

  function draw(){
    if(!window.ModAPI) return;
    const food=foodLevel(), sat=saturation();
    if(food===null || sat===null) return;

    state.lastFood=food;
    state.lastSat=sat;
    state.lastExhaustion=exhaustion();

    const w=typeof ModAPI.getdisplayWidth==="function"?ModAPI.getdisplayWidth():854;
    const h=typeof ModAPI.getdisplayHeight==="function"?ModAPI.getdisplayHeight():480;
    const text="Food "+food+"/20  •  Saturation "+sat.toFixed(1);
    const x=Math.max(4,w-220);
    const y=Math.max(4,h-58);

    if(typeof ModAPI.drawRect==="function")
      ModAPI.drawRect({left:x-5,top:y-4,right:Math.min(w-4,x+216),bottom:y+15,color:"#00000088"});
    if(typeof ModAPI.drawStringWithShadow==="function")
      ModAPI.drawStringWithShadow({msg:text,x,y,color:"#FFFFFF"});
  }

  function install(){
    if(!window.ModAPI || typeof ModAPI.addEventListener!=="function"){
      setTimeout(install,500);
      return;
    }

    ModAPI.addEventListener("drawhud",draw);

    ModAPI.addEventListener("key",e=>{
      if(!e || e.key!==65) return; // F7 in the legacy LWJGL key table
      state.fullbright=!state.fullbright;
      document.querySelectorAll("canvas").forEach(c=>{
        c.style.filter=state.fullbright?"brightness(1.35) contrast(1.04)":"";
      });
    });

    if(typeof ModAPI.displayToChat==="function"){
      ModAPI.displayToChat({msg:"Nova native mods loaded: Fullbright + AppleSkin HUD"});
    }
  }

  install();
})();