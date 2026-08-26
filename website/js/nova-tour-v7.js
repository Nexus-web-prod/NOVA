(function(){
  'use strict';
  var COMPLETE_KEY='nova_tour_v7_complete';
  var VERSION='7.0-launch-tour-3';
  var SETUP_KEY='nova_setup_v7_complete';
  var SETUP_VERSION='7.0-launch';
  var state={running:false,index:0,target:null,steps:[],loggedIn:false,gameCount:89,firstMessageSeen:false,waitCleanup:null};
  var shades=[],focus,card,title,copy,nextBtn,progress,welcome,toast,waitTimer=0;
  function $(s){return document.querySelector(s)}
  function isPreview(){return window.__NOVA_ADS_PREVIEW===true||window.top!==window||location.protocol==='about:'}
  function user(){return window.__novaV7User||function(){try{return JSON.parse(localStorage.getItem('nova_account')||'null')}catch(_){return null}}()}
  function displayName(){var u=user();if(u)return u.displayName||u.username||'there';return localStorage.getItem('nova_guest_display_name')||'Guest'}
  function completed(){return localStorage.getItem(COMPLETE_KEY)===VERSION}
  function setupDone(){return localStorage.getItem(SETUP_KEY)===SETUP_VERSION}
  function setupStillActive(){
    if(window.__novaSetupV7Active===true)return true;
    if(document.documentElement.classList.contains('nova-setup-active')||document.documentElement.classList.contains('nova-setup-pending'))return true;
    var setup=$('#nova-setup');
    if(!setup||setup.hidden)return false;
    var st=window.getComputedStyle?getComputedStyle(setup):null;
    if(st&&(st.display==='none'||st.visibility==='hidden'))return false;
    if(setup.getClientRects().length>0)return true;
    var visibleChild=setup.querySelector('.nova-setup-stage,.nova-setup-page.active');
    return !!(visibleChild&&visibleChild.getClientRects().length>0);
  }
  function setupReady(){return setupDone()&&!setupStillActive()}
  function icon(){return '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'}
  function buildUI(){
    if($('#nova-tour-card'))return;
    ['top','left','right','bottom'].forEach(function(name){var d=document.createElement('div');d.className='nova-tour-shade';d.dataset.side=name;d.hidden=true;document.body.appendChild(d);shades.push(d)});
    focus=document.createElement('div');focus.id='nova-tour-focus';focus.hidden=true;document.body.appendChild(focus);
    card=document.createElement('section');card.id='nova-tour-card';card.hidden=true;card.setAttribute('role','dialog');card.setAttribute('aria-live','polite');
    card.innerHTML='<div class="nova-tour-card-top"><div class="nova-tour-brand"><span class="nova-tour-brand-dot"></span>Nova 7 Tour</div><button id="nova-tour-skip" type="button">Skip tour</button></div><h2 id="nova-tour-title"></h2><p id="nova-tour-copy"></p><div class="nova-tour-hint" id="nova-tour-hint">'+icon()+'<span></span></div><div class="nova-tour-footer"><div class="nova-tour-progress" id="nova-tour-progress"></div><button id="nova-tour-next" type="button">Continue</button></div>';
    document.body.appendChild(card);
    welcome=document.createElement('div');welcome.id='nova-tour-welcome';welcome.hidden=true;welcome.innerHTML='<div class="nova-tour-welcome-card"><div class="nova-tour-welcome-mark">✦</div><h1>Welcome to Nova v7, <span id="nova-tour-user"></span>!</h1><p>A quick interactive tour of the parts that matter. You can skip it at any time.</p><div class="nova-tour-welcome-actions"><button class="nova-tour-start" type="button">Show me around</button><button class="nova-tour-skip-welcome" type="button">Skip tour</button></div></div>';document.body.appendChild(welcome);
    toast=document.createElement('div');toast.className='nova-tour-toast';toast.textContent='Nice — your first Everyone message is sent.';document.body.appendChild(toast);
    title=$('#nova-tour-title');copy=$('#nova-tour-copy');nextBtn=$('#nova-tour-next');progress=$('#nova-tour-progress');
    $('#nova-tour-skip').onclick=finish;$('.nova-tour-skip-welcome').onclick=finish;$('.nova-tour-start').onclick=function(){welcome.classList.remove('show');setTimeout(function(){welcome.hidden=true;startSteps()},140)};nextBtn.onclick=advance;
    window.addEventListener('resize',positionTour,{passive:true});window.addEventListener('scroll',positionTour,true);
  }
  function markComplete(){try{localStorage.setItem(COMPLETE_KEY,VERSION)}catch(_){}}
  function clearWait(){clearTimeout(waitTimer);if(state.waitCleanup){try{state.waitCleanup()}catch(_){}state.waitCleanup=null}}
  function cleanupTarget(){clearWait();state.target=null;if(focus)focus.hidden=true}
  function finish(){cleanupTarget();state.running=false;markComplete();document.documentElement.classList.remove('nova-tour-active','nova-tour-visible');shades.forEach(function(s){s.hidden=true});if(card)card.hidden=true;if(welcome){welcome.classList.remove('show');welcome.hidden=true}returnHome()}
  function returnHome(){var h=$('.ni-page-item[data-page="home"]')||$('.nav-tab[data-page="home"]');if(h)h.click()}
  function clickPage(name){var b=$('.ni-page-item[data-page="'+name+'"]')||$('.nav-tab[data-page="'+name+'"]');if(b)b.click()}
  function openIsland(){var island=$('#nova-island');if(island&&!island.classList.contains('open')){$('#nova-island-star')?.click();if(!island.classList.contains('open'))island.click()}}
  function closeIsland(){var island=$('#nova-island');if(island?.classList.contains('open'))$('#nova-island-close')?.click()}
  function isLogged(){return !!(user()&&user().username)}
  async function loadCount(){try{var r=await fetch('/website/data/games.json',{cache:'force-cache'});var d=await r.json();if(Array.isArray(d))state.gameCount=d.filter(Boolean).length}catch(_){}}
  function step(o){return o}
  function waitForCondition(test,done,timeout){var start=Date.now(),stopped=false;function tick(){if(stopped)return;try{if(test()){done();return}}catch(_){}if(Date.now()-start>(timeout||5000)){done();return}waitTimer=setTimeout(tick,80)}tick();return function(){stopped=true;clearTimeout(waitTimer)}}
  function waitForPage(name,done){var finished=false;function complete(){if(finished)return;finished=true;document.removeEventListener('nova:page-change',onPage);done()}function onPage(e){if(e.detail&&e.detail.page===name)complete()}document.addEventListener('nova:page-change',onPage);var stop=waitForCondition(function(){return !!$('#page-'+name+'.active')},complete,4500);return function(){document.removeEventListener('nova:page-change',onPage);stop()}}
  function waitForVisible(selector,done){return waitForCondition(function(){var el=$(selector);return !!(el&&el.getClientRects().length)},done,4500)}
  function makeSteps(){
    state.loggedIn=isLogged();
    var s=[
      step({id:'island',target:'#nova-island',title:'This is Nova Island',copy:'Nova Island is the <strong>control center of Nova</strong>. Pages, Social, recent activity, your account, and quick controls live here.',hint:'Next, we’ll open Games.',before:function(){clickPage('home');openIsland()}}),
      step({id:'games-nav',target:'.ni-page-item[data-page="games"]',title:'Games',copy:'This takes you to Nova Games.',hint:'Click Games to open the Games page.',before:openIsland,action:true,event:function(t,done){var cleanup=waitForPage('games',done);return cleanup}}),
      step({id:'games',target:'#page-games .content-page',title:'Nova Games',copy:function(){return 'Nova currently has <strong>'+state.gameCount+' games</strong>. Search, sort, favorite, or just pick something and play.'},hint:'Now choose a game.',before:closeIsland,waitFor:'#page-games.active'}),
      step({id:'first-game',target:'#game-grid .game-card',title:'Pick a game',copy:'Click a game to open its overview page before launching it.',hint:'Click the highlighted game.',action:true,event:function(t,done){var cleanup=waitForPage('game-detail',done);return cleanup}}),
      step({id:'overview',target:'#game-detail-hero',title:'Game overview',copy:'This page gives you the description, artwork, launch controls, and community information before you play.',hint:'Here are the important parts.',waitFor:'#page-game-detail.active'}),
      step({id:'rate',target:'.game-detail-rate',title:'Rate the game',copy:'Use the rating section to tell the Nova community what you think.',hint:'You can rate now or continue.'}),
      step({id:'stats',target:'.game-detail-info',title:'Game stats',copy:'See the community rating, Nova play count, and how the game launches.',hint:'When you’re ready, launch it.'}),
      step({id:'play',target:'#game-detail-play',title:'Play now',copy:'Play now launches the game inside Nova Browser.',hint:'Click Play now to continue.',action:true,event:function(t,done){return waitForPage('browser',done)}}),
      step({id:'browser',target:'#page-browser',title:'Nova Browser',copy:'Nova Island closes on pages that need the extra room. You can change that behavior later in Settings.',hint:'Your browser controls are all still here.',before:closeIsland,waitFor:'#page-browser.active'}),
      step({id:'tabs',target:'#browser-tab-bar',title:'Tabs',copy:'Create tabs, switch between them, and keep multiple sites open inside Nova.',hint:'New tabs also give you Quick Links.'}),
      step({id:'search',target:'#browser-empty-state .nt-search-wrap, #url-bar',title:'Search or enter a URL',copy:'Search normally or enter a full web address. Nova routes browsing through its proxy for compatibility.',hint:'Now reopen Nova Island.'}),
      step({id:'island-button',target:'#nova-island-star',title:'Open Nova Island',copy:'This dot brings Nova Island back whenever it is closed.',hint:'Click it to reopen Nova Island.',action:true,event:function(t,done){return waitForCondition(function(){return $('#nova-island')?.classList.contains('open')},done,3000)}}),
      step({id:'recent',target:'.ni-tab[data-ni-tab="recent"]',title:'Recent',copy:'Recent shows what you have been doing around Nova so you can jump back in quickly.',hint:'Click Recent.',before:openIsland,action:true,event:function(t,done){var f=function(){done()};t.addEventListener('click',f,{once:true});return function(){t.removeEventListener('click',f)}}})
    ];
    if(!state.loggedIn){
      s.push(step({id:'guest-social',target:'.ni-tab[data-ni-tab="friends"]',title:'There’s more to Nova',copy:'Sign in to unlock <strong>Nova Social</strong>: Everyone Chat, friends, direct messages, groups, voice rooms, profiles, game invites, and more.',hint:'You can sign in whenever you’re ready.',before:openIsland,next:'Finish'}));
    }else{
      s.push(
        step({id:'social',target:'.ni-tab[data-ni-tab="friends"]',title:'Nova Social',copy:'Chat, friends, groups, profiles, voice, and multiplayer activity all live here.',hint:'Click Social.',before:openIsland,action:true,event:function(t,done){var f=function(){setTimeout(done,120)};t.addEventListener('click',f,{once:true});return function(){t.removeEventListener('click',f)}}}),
        step({id:'everyone',target:'#social-everyone-panel',title:'Everyone Chat',copy:'Everyone Chat is Nova’s public community chat. Say hi and let everyone know you’re here.',hint:'Send a message to continue, or skip the tour.',before:function(){openIsland();$('.ni-tab[data-ni-tab="friends"]')?.click();setTimeout(function(){$('#social-everyone-tab')?.click()},120)},waitFor:'#social-everyone-panel',action:true,event:function(t,done){var inp=$('#social-everyone-input'),send=$('#social-everyone-send-btn'),finished=false;function sent(){if(finished)return;finished=true;state.firstMessageSeen=true;showToast();done()}if(send)send.addEventListener('click',sent,{once:true});if(inp)inp.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey)setTimeout(sent,40)},{once:true});return function(){finished=true}}}),
        step({id:'add-friend',target:'#social-add-friend-btn',title:'Add a friend',copy:'Use the plus button to send a friend request.',hint:'You don’t need to add anyone right now.'}),
        step({id:'group',target:'#social-new-group-btn',title:'Create a group',copy:'Create a group chat for multiple friends from here.',hint:'Groups stay together in Nova Social.'}),
        step({id:'profile',target:'#social-edit-profile-btn',title:'Your profile',copy:'Change your avatar, display name, bio, status, and profile details.',hint:'Your profile follows you across Social.'}),
        step({id:'blocked',target:'#social-blocked-users-btn',title:'Blocked users',copy:'View and manage people you have blocked.',hint:'That’s the last Social control you need to know.'})
      );
    }
    s.push(step({id:'done',target:'#nova-island',title:'You’re all set',copy:'Nova is yours. <strong>Browse, play, connect, and make it your own.</strong>',hint:'Have fun exploring Nova 7.',before:function(){clickPage('home');openIsland()},next:'Finish'}));
    return s;
  }
  function showToast(){toast?.classList.add('show');setTimeout(function(){toast?.classList.remove('show')},1800)}
  function startSteps(){if(!setupReady()){suspendForSetup();return}state.running=true;state.index=0;state.steps=makeSteps();card.hidden=false;focus.hidden=false;shades.forEach(function(x){x.hidden=false});document.documentElement.classList.add('nova-tour-active');requestAnimationFrame(function(){document.documentElement.classList.add('nova-tour-visible');showCurrent()})}
  function advance(){if(!state.running)return;if(state.index>=state.steps.length-1){finish();return}state.index++;showCurrent()}
  function showCurrent(){cleanupTarget();var s=state.steps[state.index];if(!s)return finish();if(s.before)try{s.before()}catch(_){};resolveTarget(s,0)}
  function resolveTarget(s,tries){var target=$(s.target),valid=target&&target.getClientRects().length,waitOK=!s.waitFor||!!$(s.waitFor);if((!valid||!waitOK)&&tries<50){waitTimer=setTimeout(function(){resolveTarget(s,tries+1)},80);return}if(!target||!target.getClientRects().length){title.textContent=s.title||'Keep going';copy.textContent='This part of Nova is still loading. You can continue or skip the tour.';nextBtn.hidden=false;nextBtn.textContent='Continue';renderProgress();return}activate(s,target)}
  function activate(s,target){state.target=target;target.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'});title.textContent=typeof s.title==='function'?s.title():s.title;copy.innerHTML=typeof s.copy==='function'?s.copy():s.copy;$('#nova-tour-hint span').textContent=s.hint||'Continue when you are ready.';nextBtn.textContent=s.next||'Continue';nextBtn.hidden=!!s.action;renderProgress();focus.hidden=false;requestAnimationFrame(positionTour);if(s.action&&s.event){var doneOnce=false;var done=function(){if(doneOnce||!state.running)return;doneOnce=true;advance()};try{state.waitCleanup=s.event(target,done)||null}catch(_){nextBtn.hidden=false}}}
  function renderProgress(){progress.innerHTML='';var total=state.steps.length,compact=Math.min(total,8),mapped=Math.floor(state.index/Math.max(1,total-1)*(compact-1));for(var i=0;i<compact;i++){var d=document.createElement('span');if(i<mapped)d.className='done';if(i===mapped)d.className='active';progress.appendChild(d)}}
  function positionTour(){if(!state.running||!state.target||focus.hidden)return;var r=state.target.getBoundingClientRect(),pad=9,vw=innerWidth,vh=innerHeight,l=Math.max(6,r.left-pad),t=Math.max(6,r.top-pad),rr=Math.min(vw-6,r.right+pad),bb=Math.min(vh-6,r.bottom+pad),w=Math.max(8,rr-l),h=Math.max(8,bb-t);focus.style.left=l+'px';focus.style.top=t+'px';focus.style.width=w+'px';focus.style.height=h+'px';focus.style.borderRadius=getComputedStyle(state.target).borderRadius||'14px';
    var topShade=shades[0],leftShade=shades[1],rightShade=shades[2],bottomShade=shades[3];
    topShade.style.left='0px';topShade.style.top='0px';topShade.style.width=vw+'px';topShade.style.height=t+'px';
    bottomShade.style.left='0px';bottomShade.style.top=bb+'px';bottomShade.style.width=vw+'px';bottomShade.style.height=Math.max(0,vh-bb)+'px';
    leftShade.style.left='0px';leftShade.style.top=t+'px';leftShade.style.width=l+'px';leftShade.style.height=h+'px';
    rightShade.style.left=rr+'px';rightShade.style.top=t+'px';rightShade.style.width=Math.max(0,vw-rr)+'px';rightShade.style.height=h+'px';positionCard(r)}
  function positionCard(r){if(card.hidden)return;var cw=card.offsetWidth||356,ch=card.offsetHeight||178,g=16,m=12,vw=innerWidth,vh=innerHeight,left,top;if(vw-r.right>=cw+g){left=r.right+g;top=r.top+r.height/2-ch/2}else if(r.left>=cw+g){left=r.left-cw-g;top=r.top+r.height/2-ch/2}else if(vh-r.bottom>=ch+g){left=r.left+r.width/2-cw/2;top=r.bottom+g}else{left=r.left+r.width/2-cw/2;top=r.top-ch-g}left=Math.max(m,Math.min(left,vw-cw-m));top=Math.max(m,Math.min(top,vh-ch-m));card.style.left=Math.round(left)+'px';card.style.top=Math.round(top)+'px'}
  function hideTourUi(){
    cleanupTarget();
    state.running=false;
    document.documentElement.classList.remove('nova-tour-active','nova-tour-visible');
    shades.forEach(function(x){x.hidden=true});
    if(focus)focus.hidden=true;
    if(card)card.hidden=true;
    if(welcome){welcome.classList.remove('show');welcome.hidden=true}
  }
  function suspendForSetup(){hideTourUi();waitForSetupStable()}
  function offer(){
    if(completed()||isPreview()||!setupReady())return;
    buildUI();
    welcome.hidden=false;
    $('#nova-tour-user').textContent=displayName();
    document.documentElement.classList.add('nova-tour-active','nova-tour-visible');
    welcome.classList.add('show');
  }
  function waitForSetupStable(){
    clearTimeout(waitTimer);
    var stableSince=0;
    (function tick(){
      if(completed()||isPreview())return;
      if(setupReady()){
        if(!stableSince)stableSince=Date.now();
        if(Date.now()-stableSince>=1100){offer();return}
      }else stableSince=0;
      waitTimer=setTimeout(tick,120);
    })();
  }
  function boot(){
    if(isPreview()||completed())return;
    buildUI();
    loadCount();
    window.addEventListener('nova:setup-started',function(){if(!completed())hideTourUi()});
    window.addEventListener('nova:setup-complete',function(){if(!completed())waitForSetupStable()});
    waitForSetupStable();
  }
  window.NovaTour={start:function(){buildUI();localStorage.removeItem(COMPLETE_KEY);if(welcome){welcome.classList.remove('show');welcome.hidden=true}startSteps()},reset:function(){localStorage.removeItem(COMPLETE_KEY)},finish:finish};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();