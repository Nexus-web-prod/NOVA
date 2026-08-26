(function(){
  "use strict";

  function esc(value){
    var el=document.createElement("div");
    el.textContent=value==null?"":String(value);
    return el.innerHTML;
  }
  function toastSafe(message){
    if(typeof window.toast==="function"){ try{ window.toast(message); return; }catch(_){} }
    var host=document.getElementById("toast-container");
    if(!host)return;
    var el=document.createElement("div");el.className="toast";el.textContent=message;host.appendChild(el);
    setTimeout(function(){el.remove();},3000);
  }

  // Keep the compatibility cache downstream-only. The server session remains
  // the sole authentication authority; legacy consumers can never unlock Nova.
  function syncLegacyAccountCache(user){
    if(!window.NovaAPI||typeof NovaAPI.cacheUser!=="function")return;
    // cacheUser is already the canonical bridge and emits the session events.
    // Do not call it from session-changed (that would recurse); simply sanitize
    // obviously stale local state when the authoritative session is logged out.
    if(!user){ try{localStorage.removeItem("nova_account");}catch(_){} }
  }
  window.addEventListener("nova:session-changed",function(e){syncLegacyAccountCache(e.detail&&e.detail.user);});

  // Replace the old local-storage Report User picker with a server-backed,
  // authenticated lookup and the real /api/reports endpoint.
  var searchTimer=0, selected="";
  function setupSupportReporter(){
    var input=document.getElementById("support-report-user-search");
    var list=document.getElementById("support-report-user-list");
    var hidden=document.getElementById("support-report-user-select");
    var button=document.getElementById("support-report-user-btn");
    if(!input||!list||!button||!window.NovaAPI)return;
    selected="";
    if(hidden)hidden.value="";
    list.replaceChildren();
    function render(profiles){
      list.replaceChildren();
      if(!profiles.length){
        var none=document.createElement("div");
        none.style.cssText="padding:.35rem .5rem;font-family:Space Mono,monospace;font-size:.41rem;color:var(--muted);";
        none.textContent=input.value.trim().length<2?"Type at least 2 characters":"No matching Nova users";
        list.appendChild(none); return;
      }
      profiles.forEach(function(profile){
        var row=document.createElement("button");
        row.type="button";row.className="rpu-item";row.dataset.user=profile.username;
        row.style.cssText="display:block;width:100%;text-align:left;padding:.38rem .5rem;border:0;border-bottom:1px solid var(--glass-b);background:transparent;color:var(--text);font-family:Space Mono,monospace;font-size:.41rem;cursor:pointer;";
        row.textContent=(profile.displayName&&profile.displayName!==profile.username?profile.displayName+" · @":"@")+profile.username;
        row.onclick=function(){selected=profile.username;if(hidden)hidden.value=selected;input.value=selected;Array.from(list.children).forEach(function(x){x.style.background="";});row.style.background="rgba(139,143,255,.15)";};
        list.appendChild(row);
      });
    }
    input.oninput=function(){
      selected="";if(hidden)hidden.value="";clearTimeout(searchTimer);
      var q=input.value.trim();
      if(q.length<2){render([]);return;}
      searchTimer=setTimeout(async function(){
        try{var data=await NovaAPI.searchProfiles(q);render(data.profiles||[]);}catch(error){render([]);}
      },250);
    };
    button.onclick=async function(){
      var target=selected||(hidden&&hidden.value)||"";
      if(!window.__novaV7User)return toastSafe("Please sign in before reporting a user");
      if(!target)return toastSafe("Please select a Nova user");
      var reason=prompt('Reason for reporting "'+target+'":');
      if(!reason||reason.trim().length<5)return toastSafe("Please add a brief reason");
      button.disabled=true;
      try{await NovaAPI.report({reportType:"user",targetUsername:target,reason:reason.trim()});toastSafe("Report submitted — thank you");input.value="";selected="";if(hidden)hidden.value="";render([]);}catch(error){toastSafe(error&&error.message||"Failed to submit report");}
      finally{button.disabled=false;}
    };
    render([]);
  }
  document.addEventListener("nova:page-change",function(e){if(e.detail&&e.detail.page==="support")setTimeout(setupSupportReporter,0);});

  // Central cleanup for page transitions. This is deliberately defensive: if a
  // CSS animation is interrupted or a lazy page remains mounted, Nova cannot
  // leave transition classes blocking interaction indefinitely.
  function cleanupTransitions(){
    document.querySelectorAll(".pg-enter-left,.pg-enter-right,.pg-exit-left,.pg-exit-right").forEach(function(el){el.classList.remove("pg-enter-left","pg-enter-right","pg-exit-left","pg-exit-right");});
    var wrap=document.getElementById("page-load-bar-wrap");if(wrap)wrap.style.display="none";
  }
  document.addEventListener("nova:page-change",function(){setTimeout(cleanupTransitions,900);});
  window.addEventListener("pageshow",cleanupTransitions);
})();
