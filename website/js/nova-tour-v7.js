(function(){
  'use strict';
  var COMPLETE_KEY='nova_tour_v7_complete';
  var VERSION='7.0-launch-tour-1';
  var SETUP_KEY='nova_setup_v7_complete';
  var SETUP_VERSION='7.0-launch';
  var state={running:false,index:0,target:null,steps:[],loggedIn:false,gameCount:89,firstMessageSeen:false};
  var blocker,card,title,copy,nextBtn,progress,welcome,toast;
  var waitTimer=0;
  function $(s){return document.querySelector(s)}
  function isPreview(){return window.__NOVA_ADS_PREVIEW===true||window.top!==window||location.protocol==='about:'}
  function user(){return window.__novaV7User||function(){try{return JSON.parse(localStorage.getItem('nova_account')||'null')}catch(_){return null}}()}
  function displayName(){var u=user();if(u)return u.displayName||u.username||'there';return localStorage.getItem('nova_guest_display_name')||'Guest'}
  function completed(){return localStorage.getItem(COMPLETE_KEY)===VERSION}
  function setupDone(){return localStorage.getItem(SETUP_KEY)===SETUP_VERSION}
  function setupStillActive(){
    if(document.documentElement.classList.contains('nova-setup-active')||document.documentElement.classList.contains('nova-setup-pending'))return true;
    var setup=$('#nova-setup');
    if(!setup)return false;
    if(setup.hidden)return false;
    var styles=window.getComputedStyle?getComputedStyle(setup):null;
    if(styles&&(styles.display==='none'||styles.visibility==='hidden'))return false;
    return setup.getClientRects().length>0;
  }
  function icon(){return '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'}
  function buildUI(){
    if($('#nova-tour-blocker')) return;
    blocker=document.createElement('div');blocker.id='nova-tour-blocker';blocker.hidden=true;
    card=document.createElement('section');card.id='nova-tour-card';card.hidden=true;card.setAttribute('role','dialog');card.setAttribute('aria-live','polite');
    card.innerHTML='<div class="nova-tour-card-top"><div class="nova-tour-brand"><span class="nova-tour-brand-dot"></span>Nova 7 Tour</div><button id="nova-tour-skip" type="button">Skip tour</button></div><h2 id="nova-tour-title"></h2><p id="nova-tour-copy"></p><div class="nova-tour-hint" id="nova-tour-hint">'+icon()+'<span></span></div><div class="nova-tour-footer"><div class="nova-tour-progress" id="nova-tour-progress"></div><button id="nova-tour-next" type="button">Continue</button></div>';
    welcome=document.createElement('div');welcome.id='nova-tour-welcome';welcome.innerHTML='<div class="nova-tour-welcome-card"><div class="nova-tour-welcome-mark">✦</div><h1>Welcome to Nova v7, <span id="nova-tour-user"></span>!</h1><p>Nova has changed. This short interactive tour will show you the parts that matter by letting you use them for real.</p><div class="nova-tour-welcome-actions"><button class="nova-tour-start" type="button">Show me around</button><button class="nova-tour-skip-welcome" type="button">Skip tour</button></div></div>';
    toast=document.createElement('div');toast.className='nova-tour-toast';toast.textContent='Nice — your first Everyone message is sent.';
    document.body.append(blocker,card,welcome,toast);
    title=$('#nova-tour-title');copy=$('#nova-tour-copy');nextBtn=$('#nova-tour-next');progress=$('#nova-tour-progress');
    $('#nova-tour-skip').onclick=finish;$('.nova-tour-skip-welcome').onclick=finish;$('.nova-tour-start').onclick=function(){welcome.classList.remove('show');setTimeout(function(){welcome.hidden=true;startSteps()},180)};
    nextBtn.onclick=function(){advance()};
    window.addEventListener('resize',positionCard,{passive:true});window.addEventListener('scroll',positionCard,true);
  }
  function markComplete(){try{localStorage.setItem(COMPLETE_KEY,VERSION)}catch(_){}}
  function cleanupTarget(){if(state.target){state.target.classList.remove('nova-tour-target');state.target.style.removeProperty('--nova-tour-radius');state.target=null}}
  function finish(){clearTimeout(waitTimer);cleanupTarget();state.running=false;markComplete();document.documentElement.classList.remove('nova-tour-active','nova-tour-visible');if(blocker)blocker.hidden=true;if(card)card.hidden=true;if(welcome){welcome.classList.remove('show');welcome.hidden=true}returnHome()}
  function returnHome(){var h=$('.ni-page-item[data-page="home"]')||$('.nav-tab[data-page="home"]');if(h)h.click()}
  function page(name){return $('#page-'+name)?.classList.contains('active')}
  function clickPage(name){var b=$('.ni-page-item[data-page="'+name+'"]')||$('.nav-tab[data-page="'+name+'"]');if(b)b.click()}
  function openIsland(){var island=$('#nova-island');if(island&&!island.classList.contains('open')){$('#nova-island-star')?.click();if(!island.classList.contains('open'))island.click()}}
  function closeIsland(){var island=$('#nova-island');if(island?.classList.contains('open'))$('#nova-island-close')?.click()}
  function isLogged(){return !!(user()&&user().username)}
  async function loadCount(){try{var r=await fetch('/website/data/games.json',{cache:'force-cache'});var d=await r.json();if(Array.isArray(d))state.gameCount=d.filter(Boolean).length}catch(_){}}
  function step(o){return o}
  function makeSteps(){
    state.loggedIn=isLogged();
    var common=[
      step({id:'island',target:'#nova-island',title:'This is Nova Island',copy:'Nova Island is the <strong>control center of Nova</strong>. Pages, Social, recent activity, your account, and quick controls all live here.',hint:'Next, open Games.',before:function(){clickPage('home');openIsland()},action:true,event:function(t,done){var g=t.querySelector('.ni-page-item[data-page="games"]');if(g)g.addEventListener('click',done,{once:true})},fallback:'.ni-page-item[data-page="games"]'}),
      step({id:'games',target:'#page-games .content-page',title:'Games',copy:function(){return 'This is the Games page. Nova currently has <strong>'+state.gameCount+' games</strong> ready to explore.'},hint:'Next, pick a game to see its overview.',before:function(){closeIsland()},waitFor:'#page-games.active'}),
      step({id:'first-game',target:'#game-grid .game-card',title:'Pick a game',copy:'Every game opens through the same simple flow. Start with this one so you can see how it works.',hint:'Click the highlighted game to continue.',action:true,event:function(t,done){t.addEventListener('click',function(){setTimeout(done,220)},{once:true})}}),
      step({id:'game-overview',target:'#game-detail-hero',title:'Game overview',copy:'Every game gets its own overview with its description, artwork, community information, and launch controls.',hint:'A few useful things are right below.',waitFor:'#page-game-detail.active #game-detail-hero'}),
      step({id:'rate',target:'.game-detail-rate',title:'Rate what you play',copy:'Use the rating section to tell the Nova community what you think. Ratings help better games stand out.',hint:'You can rate now or just continue.'}),
      step({id:'stats',target:'.game-detail-info',title:'See the game stats',copy:'This area shows community rating, Nova play count, and how the game launches.',hint:'Then you can jump straight into the game.'}),
      step({id:'play',target:'#game-detail-play',title:'Play now',copy:'When you are ready, <strong>Play now</strong> launches the game inside Nova Browser.',hint:'Click Play now to continue the tour.',action:true,event:function(t,done){t.addEventListener('click',function(){setTimeout(done,500)},{once:true})}}),
      step({id:'browser',target:'#page-browser',title:'This is Nova Browser',copy:'Notice Nova Island closed. Nova automatically gets it out of the way on pages that need more room. You can change Island behavior later in Settings.',hint:'Nova Browser routes web content through Nova’s proxy for compatibility.',before:function(){closeIsland()},waitFor:'#page-browser.active'}),
      step({id:'tabs',target:'#browser-tab-bar',title:'Your tabs live up here',copy:'Open multiple tabs, switch between them, create a new one, and keep everything inside Nova.',hint:'Nova works like a normal tabbed browser.'}),
      step({id:'search',target:'#browser-empty-state .nt-search-wrap, #url-bar',title:'Search or enter a URL',copy:'Use the search bar for anything you want to find, or type a full web address. Quick Links are available on new tabs too.',hint:'Now let’s reopen Nova Island.'}),
      step({id:'island-button',target:'#nova-island-star',title:'Nova Island is always close',copy:'When Nova Island closes, this dot brings it back instantly.',hint:'Click the Nova Island button.',action:true,event:function(t,done){t.addEventListener('click',function(){setTimeout(done,250)},{once:true})}}),
      step({id:'recent',target:'.ni-tab[data-ni-tab="recent"]',title:'Recent activity',copy:'Recent keeps a simple trail of what you have done around Nova so it is easy to jump back in.',hint:'Click Recent to take a look.',before:openIsland,action:true,event:function(t,done){t.addEventListener('click',done,{once:true})}})
    ];
    if(!state.loggedIn){
      common.push(step({id:'guest-social',target:'.ni-tab[data-ni-tab="friends"]',title:'There is more to Nova',copy:'Sign in to unlock <strong>Nova Social</strong>: Everyone Chat, friends, direct messages, groups, voice rooms, profiles, game invites, and more.',hint:'You can sign in anytime. Your guest tour ends here.',before:openIsland,next:'Finish'}));
    }else{
      common.push(
        step({id:'social',target:'.ni-tab[data-ni-tab="friends"]',title:'Nova Social',copy:'This is where Nova connects. Chat, friends, groups, profiles, voice, and multiplayer activity all come together here.',hint:'Click Social to continue.',before:openIsland,action:true,event:function(t,done){t.addEventListener('click',function(){setTimeout(done,350)},{once:true})}}),
        step({id:'everyone',target:'#social-everyone-panel',title:'Everyone Chat',copy:'Everyone Chat is Nova’s public community space. Say hi and let everyone know you are here.',hint:'Send a message to continue. You can skip the whole tour at any time.',before:function(){openIsland();$('.ni-tab[data-ni-tab="friends"]')?.click();setTimeout(function(){$('#social-everyone-tab')?.click()},180)},waitFor:'#social-everyone-panel',action:true,event:function(t,done){var inp=$('#social-everyone-input'),send=$('#social-everyone-send-btn');function sent(){if(state.firstMessageSeen)return;state.firstMessageSeen=true;showToast();done()}if(send)send.addEventListener('click',sent,{once:true});if(inp)inp.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey)setTimeout(sent,50)},{once:true})}}),
        step({id:'add-friend',target:'#social-add-friend-btn',title:'Add a friend',copy:'The plus button sends friend requests so you can chat, invite people to games, and see when friends are around.',hint:'You do not need to add anyone right now.'}),
        step({id:'group',target:'#social-new-group-btn',title:'Create a group',copy:'Use this button to make a group chat with multiple friends.',hint:'Groups stay together inside Nova Social.'}),
        step({id:'profile',target:'#social-edit-profile-btn',title:'Your profile',copy:'Edit your display name, avatar, bio, status, and other profile details from here.',hint:'Your profile follows you across Social.'}),
        step({id:'blocked',target:'#social-blocked-users-btn',title:'Blocked users',copy:'This button shows the people you have blocked and lets you manage that list.',hint:'That is the last Social control you need to know.'})
      );
    }
    common.push(step({id:'done',target:'#nova-island',title:'You’re set',copy:'Nova is all yours. <strong>Browse, play, connect, and make it your own.</strong> You can always discover the rest naturally as you use it.',hint:'Have fun exploring Nova 7.',before:function(){clickPage('home');openIsland()},next:'Finish'}));
    return common;
  }
  function showToast(){toast?.classList.add('show');setTimeout(function(){toast?.classList.remove('show')},2200)}
  function startSteps(){state.running=true;state.index=0;state.steps=makeSteps();blocker.hidden=false;card.hidden=false;document.documentElement.classList.add('nova-tour-active');requestAnimationFrame(function(){document.documentElement.classList.add('nova-tour-visible');showCurrent()})}
  function advance(){if(state.index>=state.steps.length-1){finish();return}state.index++;showCurrent()}
  function showCurrent(){clearTimeout(waitTimer);cleanupTarget();var s=state.steps[state.index];if(!s)return finish();if(s.before)try{s.before()}catch(_){};resolveTarget(s,0)}
  function resolveTarget(s,tries){var target=$(s.target);var valid=target&&target.getClientRects().length;if((!valid||s.waitFor&&!$(s.waitFor))&&tries<35){waitTimer=setTimeout(function(){resolveTarget(s,tries+1)},120);return}if(!target&&s.fallback)target=$(s.fallback);if(!target){if(tries>=35)advance();return}activate(s,target)}
  function activate(s,target){state.target=target;target.classList.add('nova-tour-target');target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});title.textContent=typeof s.title==='function'?s.title():s.title;copy.innerHTML=typeof s.copy==='function'?s.copy():s.copy;$('#nova-tour-hint span').textContent=s.hint||'Continue when you are ready.';nextBtn.textContent=s.next||'Continue';nextBtn.hidden=!!s.action;renderProgress();setTimeout(positionCard,80);if(s.action&&s.event){var doneOnce=false;var done=function(){if(doneOnce||!state.running)return;doneOnce=true;advance()};try{s.event(target,done)}catch(_){nextBtn.hidden=false}}}
  function renderProgress(){progress.innerHTML='';var total=state.steps.length;var compact=Math.min(total,8);for(var i=0;i<compact;i++){var dot=document.createElement('span');var mapped=Math.floor(state.index/(Math.max(1,total-1))*(compact-1));if(i<mapped)dot.className='done';if(i===mapped)dot.className='active';progress.appendChild(dot)}}
  function positionCard(){if(!state.running||!state.target||card.hidden)return;var r=state.target.getBoundingClientRect();var cw=card.offsetWidth||390,ch=card.offsetHeight||190,gap=16,vw=innerWidth,vh=innerHeight;var left=Math.min(Math.max(10,r.left+r.width/2-cw/2),vw-cw-10);var below=r.bottom+gap;var above=r.top-ch-gap;var top=below+ch<vh-10?below:(above>10?above:Math.max(10,vh-ch-10));if(r.width>vw*.72&&r.height>vh*.55){top=Math.max(12,vh-ch-18);left=Math.max(10,(vw-cw)/2)}card.style.left=Math.round(left)+'px';card.style.top=Math.round(top)+'px'}
  function offer(){if(completed()||isPreview()||!setupDone()||setupStillActive())return;buildUI();welcome.hidden=false;$('#nova-tour-user').textContent=displayName();blocker.hidden=false;document.documentElement.classList.add('nova-tour-active','nova-tour-visible');welcome.classList.add('show')}
  function boot(){if(isPreview()||completed())return;buildUI();loadCount();var tries=0;(function waitSetup(){if(setupDone()&&!setupStillActive()){setTimeout(function(){if(!completed()&&!setupStillActive())offer()},850);return}if(tries++<160)setTimeout(waitSetup,250)})()}
  window.NovaTour={start:function(){buildUI();localStorage.removeItem(COMPLETE_KEY);welcome.hidden=true;startSteps()},reset:function(){localStorage.removeItem(COMPLETE_KEY)},finish:finish};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();