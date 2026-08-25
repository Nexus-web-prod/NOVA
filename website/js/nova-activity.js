(function(){
"use strict";

var KEY="nova_activity_feed";
var MAX=200;
var MIGRATION="nova_activity_feed_migrated_v1";

function read(){
  try{
    var v=JSON.parse(localStorage.getItem(KEY)||"[]");
    return Array.isArray(v)?v:[];
  }catch(e){return[]}
}
function write(list){
  try{
    localStorage.setItem(KEY,JSON.stringify(list.slice(0,MAX)));
    window.dispatchEvent(new CustomEvent("nova:activity-changed",{detail:{count:list.length}}));
  }catch(e){}
}
function disabled(){
  return document.documentElement.getAttribute("data-disable-activity")==="on" ||
         localStorage.getItem("nova_disable_activity")==="1";
}
function clean(v,max){
  return String(v==null?"":v).replace(/\s+/g," ").trim().slice(0,max||160);
}
function titleCase(v){
  return clean(v,80).replace(/[-_]+/g," ").replace(/\b\w/g,function(c){return c.toUpperCase()});
}
function add(entry){
  if(disabled()||!entry)return;
  var now=Date.now();
  var e={
    id:"act_"+now+"_"+Math.random().toString(36).slice(2,8),
    type:clean(entry.type||"activity",32),
    label:clean(entry.label||"Nova activity",100),
    detail:clean(entry.detail||"",180),
    page:clean(entry.page||"",40),
    url:clean(entry.url||"",500),
    image:clean(entry.image||"",6000),
    time:now,
    meta:entry.meta&&typeof entry.meta==="object"?entry.meta:{}
  };
  var list=read();
  // Prevent one interaction from being logged twice by overlapping handlers.
  if(list[0] && list[0].type===e.type && list[0].label===e.label && now-Number(list[0].time||0)<1800){
    list[0]=Object.assign({},list[0],e,{id:list[0].id,time:now});
  }else{
    list.unshift(e);
  }
  write(list);
}
function clear(){
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("nova:activity-changed",{detail:{count:0}}));
}
function migrate(){
  if(localStorage.getItem(MIGRATION)==="1")return;
  localStorage.setItem(MIGRATION,"1");
  var old=[];
  try{old=JSON.parse(localStorage.getItem("nova_recents")||"[]")}catch(e){}
  if(!old.length)try{old=JSON.parse(localStorage.getItem("nova_recents_v2")||"[]")}catch(e){}
  if(!old.length)return;
  var list=read(), base=Date.now()-old.length*60000;
  old.slice(0,30).reverse().forEach(function(r,i){
    list.unshift({
      id:"legacy_"+i+"_"+base,
      type:(r.url&&/^https?:/i.test(r.url))?"web":"game",
      label:clean(r.name||r.title||"Recent item",100),
      detail:(r.url&&/^https?:/i.test(r.url))?"Opened in Nova Browser":"Played in Nova",
      page:(r.url&&/^https?:/i.test(r.url))?"browser":"games",
      url:clean(r.url||r.src||"",500),
      image:clean(r.image||r.img||r.thumb||"",6000),
      time:base+(i*60000),
      meta:{migrated:true}
    });
  });
  write(list);
}
function pageName(page){
  var map={home:"Home",browser:"Browser",games:"Games",apps:"Apps",movies:"Movies",rewards:"Rewards",plans:"Plans",support:"Support",settings:"Settings",supernova:"Supernova",dev:"Admin Panel"};
  return map[page]||titleCase(page);
}
function settingLabel(el){
  var row=el.closest(".settings-control-row,.settings-range-row,.settings-panel,.settings-block,.setting-row");
  var label=row&&row.querySelector("strong,.setting-label,.settings-card-title strong");
  return clean(label&&label.textContent || el.dataset.control || "Setting",90);
}
function valueLabel(el){
  if(el.type==="checkbox")return el.checked?"On":"Off";
  if(el.type==="color")return String(el.value||"");
  if(el.tagName==="SELECT"){
    var o=el.options&&el.options[el.selectedIndex];
    return clean(o?o.textContent:el.value,80);
  }
  if(el.type==="range")return clean(el.value,30);
  return clean(el.value,80);
}
function iconTypeForCard(card){
  if(card.matches(".game-card,[data-game-id]"))return"game";
  if(card.matches(".app-card,[data-app-id]"))return"app";
  if(card.matches(".movie-card"))return"movie";
  return"activity";
}
function cardName(card){
  var n=card.querySelector(".game-name,.app-name,.movie-card-title,.card-title,.game-title");
  return clean(n&&n.textContent || card.dataset.name || card.dataset.title || "Item",100);
}
function cardImage(card){
  var img=card.querySelector("img");
  return img?clean(img.currentSrc||img.src||"",6000):"";
}

document.addEventListener("click",function(e){
  var nav=e.target.closest(".nav-tab[data-page],.ni-page-item[data-page]");
  if(nav){
    var p=nav.dataset.page;
    add({type:"page",label:"Opened "+pageName(p),detail:"Visited a Nova page",page:p});
    return;
  }

  var card=e.target.closest(".game-card,.app-card");
  if(card && !e.target.closest("button.fav-btn,.game-star")){
    var type=iconTypeForCard(card);
    add({
      type:type,
      label:(type==="game"?"Played ":"Opened ")+cardName(card),
      detail:type==="game"?"Started a game":"Opened an app",
      page:type==="game"?"games":"apps",
      image:cardImage(card),
      url:card.dataset.url||""
    });
    return;
  }

  var social=e.target.closest(".social-friend-item,.social-group-item,.social-everyone-tab,.social-games-tab");
  if(social){
    var name=clean(social.querySelector(".social-friend-name,.social-group-name")?.textContent || social.textContent,70);
    add({type:"social",label:"Opened "+name,detail:"Nova Social",page:"social"});
  }
},true);

document.addEventListener("keydown",function(e){
  if(e.key!=="Enter")return;
  var el=e.target;
  if(!el||!(el instanceof HTMLInputElement))return;
  if(el.id==="search-input"||el.id==="nt-search"||el.id==="browser-url-input"||el.id==="url-input"){
    var q=clean(el.value,140);
    if(!q)return;
    var looksUrl=/^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/i.test(q);
    add({
      type:"search",
      label:looksUrl?"Opened "+q:"Searched for "+q,
      detail:looksUrl?"Nova Browser navigation":"Nova search",
      page:"browser",
      url:looksUrl?(q.startsWith("http")?q:"https://"+q):""
    });
  }
},true);

document.addEventListener("change",function(e){
  var el=e.target;
  if(!el||!el.matches("[data-control],.nova-control"))return;
  if(el.dataset.control==="disableActivity")return;
  add({
    type:"settings",
    label:"Changed "+settingLabel(el),
    detail:"Set to "+valueLabel(el),
    page:"settings"
  });
},true);

document.addEventListener("nova:profile-updated",function(){
  add({type:"profile",label:"Updated profile",detail:"Saved your Nova profile",page:"settings"});
});
document.addEventListener("nova:session-changed",function(e){
  add({type:"account",label:e.detail&&e.detail.user?"Signed in":"Signed out",detail:"Nova account",page:"settings"});
});

migrate();
window.NovaActivity={add:add,read:read,clear:clear};
})();