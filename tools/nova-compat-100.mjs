#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const runtimeModules = process.env.CODEX_RUNTIME_NODE_MODULES ||
  path.resolve(path.dirname(process.execPath), '..', 'node_modules');
const OUT = path.resolve(ROOT, 'reports');
const SHOTS = path.join(OUT, 'screenshots');
const REPORT_JSON = path.join(OUT, 'report.json');
const REPORT_HTML = path.join(OUT, 'report.html');
const CHECKPOINT = path.join(OUT, 'checkpoint.json');
const BASE_URL = process.env.NOVA_TEST_URL || 'http://127.0.0.1:8788/';
const PER_SITE_TIMEOUT = Number(process.env.NOVA_SITE_TIMEOUT_MS || 30000);
const GLOBAL_TIMEOUT = Number(process.env.NOVA_GLOBAL_TIMEOUT_MS || 45 * 60 * 1000);
const RESUME = process.argv.includes('--resume');

const SITES = [
  ['Example','https://example.com/'],['Google','https://www.google.com/'],['Wikipedia','https://en.wikipedia.org/'],['YouTube','https://www.youtube.com/'],['Discord root','https://discord.com/'],['Discord app','https://discord.com/app'],['TikTok','https://www.tiktok.com/'],['Twitch','https://www.twitch.tv/'],['Spotify','https://open.spotify.com/'],['GitHub','https://github.com/'],['Gemini','https://gemini.google.com/'],['ChatGPT','https://chatgpt.com/'],['Epic Games','https://www.epicgames.com/'],['GeForce NOW','https://play.geforcenow.com/'],['Steam','https://store.steampowered.com/'],['Roblox','https://www.roblox.com/'],['Reddit','https://www.reddit.com/'],['Amazon','https://www.amazon.com/'],['Walmart','https://www.walmart.com/'],['Target','https://www.target.com/'],['Best Buy','https://www.bestbuy.com/'],['eBay','https://www.ebay.com/'],['Etsy','https://www.etsy.com/'],['AliExpress','https://www.aliexpress.us/'],['CNN','https://www.cnn.com/'],['BBC','https://www.bbc.com/'],['Reuters','https://www.reuters.com/'],['AP News','https://apnews.com/'],['NYTimes','https://www.nytimes.com/'],['Washington Post','https://www.washingtonpost.com/'],['NPR','https://www.npr.org/'],['Fox News','https://www.foxnews.com/'],['NBC News','https://www.nbcnews.com/'],['CBS News','https://www.cbsnews.com/'],['ABC News','https://abcnews.go.com/'],['The Guardian','https://www.theguardian.com/'],['Bloomberg','https://www.bloomberg.com/'],['Yahoo','https://www.yahoo.com/'],['Bing','https://www.bing.com/'],['DuckDuckGo','https://duckduckgo.com/'],['Stack Overflow','https://stackoverflow.com/'],['MDN','https://developer.mozilla.org/'],['W3Schools','https://www.w3schools.com/'],['npm','https://www.npmjs.com/'],['Cloudflare','https://www.cloudflare.com/'],['Microsoft','https://www.microsoft.com/'],['Apple','https://www.apple.com/'],['Adobe','https://www.adobe.com/'],['Canva','https://www.canva.com/'],['Figma','https://www.figma.com/'],['Notion','https://www.notion.so/'],['Trello','https://trello.com/'],['Slack','https://slack.com/'],['Zoom','https://zoom.us/'],['Dropbox','https://www.dropbox.com/'],['Box','https://www.box.com/'],['GitLab','https://gitlab.com/'],['Bitbucket','https://bitbucket.org/'],['LinkedIn','https://www.linkedin.com/'],['Pinterest','https://www.pinterest.com/'],['Tumblr','https://www.tumblr.com/'],['Quora','https://www.quora.com/'],['Medium','https://medium.com/'],['Vimeo','https://vimeo.com/'],['Dailymotion','https://www.dailymotion.com/'],['SoundCloud','https://soundcloud.com/'],['Bandcamp','https://bandcamp.com/'],['Hulu','https://www.hulu.com/'],['Disney+','https://www.disneyplus.com/'],['Max','https://www.max.com/'],['Paramount+','https://www.paramountplus.com/'],['Peacock','https://www.peacocktv.com/'],['ESPN','https://www.espn.com/'],['NFL','https://www.nfl.com/'],['NBA','https://www.nba.com/'],['MLB','https://www.mlb.com/'],['NHL','https://www.nhl.com/'],['IGN','https://www.ign.com/'],['GameSpot','https://www.gamespot.com/'],['Minecraft','https://www.minecraft.net/'],['Xbox','https://www.xbox.com/'],['PlayStation','https://www.playstation.com/'],['Nintendo','https://www.nintendo.com/'],['EA','https://www.ea.com/'],['Ubisoft','https://www.ubisoft.com/'],['Battle.net','https://www.battle.net/'],['Khan Academy','https://www.khanacademy.org/'],['Coursera','https://www.coursera.org/'],['edX','https://www.edx.org/'],['Quizlet','https://quizlet.com/'],['Duolingo','https://www.duolingo.com/'],['Britannica','https://www.britannica.com/'],['Booking','https://www.booking.com/'],['Expedia','https://www.expedia.com/'],['Tripadvisor','https://www.tripadvisor.com/'],['Airbnb','https://www.airbnb.com/'],['Kayak','https://www.kayak.com/'],['Weather.com','https://weather.com/'],['AccuWeather','https://www.accuweather.com/'],['Speedtest','https://www.speedtest.net/']
];
if (SITES.length !== 100) throw new Error(`Expected 100 sites, got ${SITES.length}`);

fs.mkdirSync(SHOTS, { recursive: true });
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f,'utf8')); } catch { return fallback; } };
let report = RESUME ? readJson(REPORT_JSON, null) : null;
if (!report) report = { generatedAt:new Date().toISOString(), baseUrl:BASE_URL, version:'20260829-sj2067-r8.24', results:[] };
const done = new Set(report.results.map(r => r.requestedUrl));
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

function renderHtml(data){
  const json = JSON.stringify(data).replace(/</g,'\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Nova R8.24 Compatibility Report</title><style>
  body{font-family:system-ui,sans-serif;margin:24px;background:#0c0d12;color:#eee}input,select{background:#171923;color:#eee;border:1px solid #343847;border-radius:8px;padding:8px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:9px;border-bottom:1px solid #262a36;text-align:left;vertical-align:top}tr.FAIL{background:#2a1216}tr.PARTIAL{background:#2b2513}.shot{max-width:180px;border-radius:6px}.muted{color:#a7adbd}.summary{display:flex;gap:12px;flex-wrap:wrap}.pill{padding:8px 12px;border:1px solid #343847;border-radius:999px}</style></head><body>
  <h1>Nova Resilience R8.24 compatibility report</h1><div id="summary" class="summary"></div><p><input id="q" placeholder="Search sites"> <select id="score"><option value="">All scores</option><option>PASS</option><option>PARTIAL</option><option>FAIL</option></select> <input id="err" placeholder="Filter error text"></p><table><thead><tr><th>Site</th><th>Score</th><th>Transport</th><th>Requested vs frame</th><th>Reasons / errors</th><th>Screenshot</th></tr></thead><tbody id="rows"></tbody></table>
  <script>const data=${json};const rows=document.querySelector('#rows');const q=document.querySelector('#q'),score=document.querySelector('#score'),err=document.querySelector('#err');function draw(){rows.innerHTML='';const term=q.value.toLowerCase(),sc=score.value,et=err.value.toLowerCase();for(const r of data.results){const hay=(r.name+' '+r.requestedUrl+' '+(r.reasons||[]).join(' ')+' '+(r.consoleErrors||[]).join(' ')).toLowerCase();if(term&&!hay.includes(term))continue;if(sc&&r.score!==sc)continue;if(et&&!hay.includes(et))continue;const tr=document.createElement('tr');tr.className=r.score;tr.innerHTML='<td><b>'+r.name+'</b><br><span class=muted>'+r.requestedUrl+'</span></td><td>'+r.score+'</td><td>'+((r.transport&&r.transport.transport)||'')+'</td><td><span class=muted>'+r.addressBarUrl+'</span><br>'+r.activeFrameUrl+'</td><td>'+[...(r.reasons||[]),...(r.consoleErrors||[]).slice(0,4)].map(x=>'<div>'+String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</div>').join('')+'</td><td>'+(r.screenshot?'<a href="'+r.screenshot+'"><img class=shot src="'+r.screenshot+'"></a>':'')+'</td>';rows.appendChild(tr)}}function summary(){const c={PASS:0,PARTIAL:0,FAIL:0};for(const r of data.results)c[r.score]=(c[r.score]||0)+1;document.querySelector('#summary').innerHTML=Object.entries(c).map(([k,v])=>'<span class=pill>'+k+': '+v+'</span>').join('')+'<span class=pill>Total: '+data.results.length+'</span>'}for(const el of[q,score,err])el.addEventListener('input',draw);summary();draw();</script></body></html>`;
}
function flush(){ report.generatedAt = new Date().toISOString(); fs.writeFileSync(REPORT_JSON, JSON.stringify(report,null,2)); fs.writeFileSync(REPORT_HTML, renderHtml(report)); fs.writeFileSync(CHECKPOINT, JSON.stringify({updatedAt:new Date().toISOString(),completed:report.results.length,last:report.results.at(-1)?.requestedUrl||null},null,2)); }

function decodeFrameUrl(src){
  try {
    const u=new URL(src, BASE_URL);
    const sj=u.pathname.match(/^\/~\/sj\/[^/]+\/[^/]+\/(.*)$/);
    if(sj) return decodeURIComponent(sj[1]);
    const vortex=u.pathname.match(/^\/vortex\/(.*)$/);
    if(vortex) return decodeURIComponent(vortex[1]) + (u.hash || '');
    return src||'';
  } catch { return src||''; }
}
function scoreResult(r){
  const reasons=[];
  if(!r.frameMatched) reasons.push('active frame did not match requested target');
  if(r.staleFrame) reasons.push('STALE_FRAME');
  if(r.navigationFailed) reasons.push('NAVIGATION_FAILED');
  if(r.blank) reasons.push('blank page');
  if(r.visible404) reasons.push('visible 404');
  if(r.tiktokUndefined) reasons.push('route reconstructed as /undefined');
  if(r.tiktokCallableError) reasons.push('TikTok callable/receiver runtime failure');
  if(r.discordLoadingStall) reasons.push('Discord loading-screen stall');
  if(r.discordReconnectLoop) reasons.push('Discord WebSocket reconnect loop');
  if(r.falseFallback) reasons.push('destination failure caused false transport fallback');
  if(r.fatalPageErrors?.length) reasons.push('fatal page error');
  if(r.sriErrors?.length) reasons.push('SRI error');
  if(r.fontErrors?.length) reasons.push('font decode error');
  let score='PASS';
  if(r.staleFrame||r.navigationFailed||!r.frameMatched||r.blank||r.tiktokUndefined||r.tiktokCallableError||r.discordLoadingStall||r.discordReconnectLoop||r.falseFallback||r.fatalPageErrors?.length) score='FAIL';
  else if(r.visible404||r.sriErrors?.length||r.fontErrors?.length||r.failedRequests?.length>8||r.interactionSuccess===false) score='PARTIAL';
  if(!reasons.length) reasons.push('target rendered and core navigation checks passed');
  return {score,reasons};
}

let playwright;
try { playwright = require(path.join(runtimeModules, 'playwright')); }
catch (e) { console.error('Playwright is required to run the live tester. Install it with: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const globalDeadline = Date.now() + GLOBAL_TIMEOUT;
const profileDir = path.join(OUT, '.playwright-profile');
const context = await playwright.chromium.launchPersistentContext(profileDir, { headless:true, viewport:{width:1440,height:1000} });
const page = context.pages()[0] || await context.newPage();
page.setDefaultTimeout(5000);
await page.goto(BASE_URL, { waitUntil:'domcontentloaded', timeout:30000 });
await page.waitForFunction(() => !!window.NovaProxyManager && !!window._novaTab, null, {timeout:30000});

for (const [name, requestedUrl] of SITES) {
  if (stopping || Date.now() > globalDeadline) break;
  if (done.has(requestedUrl)) continue;
  const started=Date.now();
  const consoleErrors=[], pageErrors=[], failedRequests=[];
  const onConsole = m => { if(m.type()==='error') consoleErrors.push(m.text().slice(0,500)); };
  const onPageError = e => pageErrors.push(String(e.message||e).slice(0,500));
  const onRequestFailed = req => failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText||'failed'}`.slice(0,700));
  page.on('console',onConsole); page.on('pageerror',onPageError); page.on('requestfailed',onRequestFailed);
  let r={name,requestedUrl,addressBarUrl:'',activeFrameUrl:'',title:'',effectiveUpstreamOrigin:'',pathname:'',baseURI:'',bodyTextLength:0,htmlLength:0,imageCount:0,brokenImageCount:0,scripts:0,stylesheets:0,consoleErrors,pageErrors,failedRequests,http4xx:[],http5xx:[],sriErrors:[],fontErrors:[],workerErrors:[],wasmErrors:[],cspErrors:[],rewriteErrors:[],tlsErrors:[],websocketErrors:[],challengeErrors:[],frameMatched:false,staleFrame:false,navigationFailed:false,blank:false,visible404:false,interactionSuccess:null,searchSuccess:null,transport:null,transportBefore:null,transportAfter:null,tiktokCallableError:false,discordLoadingStall:false,discordReconnectLoop:false,falseFallback:false,tabCompatibilityFallback:false,durationMs:0};
  try {
    await Promise.race([
      (async()=>{
        // Fresh Nova tab per site while retaining one authenticated Chromium profile.
        r.transportBefore = await page.evaluate(url => window.NovaProxyDiagnostics?.captureTransportSnapshot?.(url) || window.NovaProxyManager?.captureTransportSnapshot?.(url) || window.NovaProxyManager?.getState?.() || null, requestedUrl);
        await page.evaluate(url => { const t=window._novaTab.newTab(); if(!t) throw new Error('could not create Nova tab'); window._novaTab.navigate(url); }, requestedUrl);
        await page.waitForFunction(url => document.querySelector('#url-bar')?.value === url, requestedUrl, {timeout:8000});
        r.addressBarUrl = await page.locator('#url-bar').inputValue();
        const requestedHost = new URL(requestedUrl).hostname;
        let lastFrame='';
        const frameDeadline=Date.now()+15000;
        while(Date.now()<frameDeadline){
          const src = await page.locator('.tab-iframe.active').getAttribute('src').catch(()=>null);
          const decoded=decodeFrameUrl(src||'');
          if(decoded) lastFrame=decoded;
          try{ if(new URL(decoded).hostname===requestedHost){ r.frameMatched=true; r.activeFrameUrl=decoded; break; } }catch{}
          await new Promise(res=>setTimeout(res,250));
        }
        if(!r.frameMatched){ r.activeFrameUrl=lastFrame; r.navigationFailed=true; if(lastFrame){ try{r.staleFrame=new URL(lastFrame).hostname!==requestedHost}catch{} } return; }
        // Allow a tab-scoped modern-runtime compatibility fallback to settle,
        // then reacquire the iframe so a Scramjet -> Vortex swap is not graded
        // as a detached/stale frame.
        await new Promise(res=>setTimeout(res,4500));
        const settledSrc = await page.locator('.tab-iframe.active').getAttribute('src').catch(()=>null);
        const settledDecoded = decodeFrameUrl(settledSrc||'');
        if(settledDecoded){
          try{ if(new URL(settledDecoded).hostname===requestedHost) r.activeFrameUrl=settledDecoded; }catch{}
        }
        r.tabCompatibilityFallback = /\/vortex\//.test(settledSrc||'');
        const iframeHandle = await page.locator('.tab-iframe.active').elementHandle();
        const frame = await iframeHandle.contentFrame();
        await frame.waitForLoadState('domcontentloaded', {timeout:8000}).catch(()=>{});
        const snap = await frame.evaluate(() => ({
          title:document.title||'', href:location.href, origin:location.origin, pathname:location.pathname, baseURI:document.baseURI||'', compatMode:document.compatMode,
          text:(document.body?.innerText||'').slice(0,20000), textLength:(document.body?.innerText||'').length, htmlLength:document.documentElement?.outerHTML?.length||0,
          images:[...document.images].map(i=>({complete:i.complete,naturalWidth:i.naturalWidth})), scripts:document.scripts.length, stylesheets:document.styleSheets.length,
          pageDiagnostics:globalThis.__NOVA_PROXY_PAGE_DIAGNOSTICS__||null,
          loadingText:/loading|connecting/i.test((document.body?.innerText||'').slice(0,3000))
        }));
        Object.assign(r,{title:snap.title,effectiveUpstreamOrigin:snap.origin,pathname:snap.pathname,baseURI:snap.baseURI,bodyTextLength:snap.textLength,htmlLength:snap.htmlLength,imageCount:snap.images.length,brokenImageCount:snap.images.filter(i=>i.complete&&i.naturalWidth===0).length,compatMode:snap.compatMode});
        r.blank = snap.textLength < 20 && snap.images.length===0 && snap.htmlLength < 5000;
        r.visible404 = /\b404\b|page not found|not found/i.test(snap.text.slice(0,4000));
        r.tiktokUndefined = /\/404\?fromUrl=%2Fundefined|\/undefined(?:[?#]|$)/i.test(snap.href);
        r.tiktokCallableError = /this\._instance is not a function/i.test([...consoleErrors,...pageErrors].join('\n')) || (name==='TikTok' && snap.pageDiagnostics?.callableSemantics?.ok===false);
        if(name==='Discord app'){
          await new Promise(res=>setTimeout(res,30000));
          const ws = await page.evaluate(()=>window.NovaProxyManager?.getState?.().websocketStats||null).catch(()=>null);
          const sessions = await page.evaluate(()=>window.NovaProxyManager?.getState?.().websocketSessions||[]).catch(()=>[]);
          r.discordReconnectLoop = Array.isArray(sessions) && sessions.filter(x=>/gateway\.discord\.gg/i.test(x.target||'') && Number(x.durationMs||0)<30000).length >= 2;
          const stillLoading = await frame.evaluate(()=>/loading|connecting/i.test((document.body?.innerText||'').slice(0,3000))).catch(()=>false);
          r.discordLoadingStall = !!stillLoading && !!ws?.libcurl?.connectedAt && !r.discordReconnectLoop;
        }
        await frame.evaluate(()=>scrollTo(0,Math.min(500,document.body?.scrollHeight||0))).catch(()=>{});
        r.interactionSuccess=true;
        const search = frame.locator('input[type="search"],input[name="q"],input[placeholder*="search" i]').first();
        if(await search.count().catch(()=>0)){
          const visible=await search.isVisible().catch(()=>false);
          if(visible){ await search.fill('nova test').catch(()=>{}); r.searchSuccess=(await search.inputValue().catch(()=>''))==='nova test'; }
        }
        r.transport = await page.evaluate(()=>window.NovaProxyDiagnostics?.getState?.()||window.NovaProxyManager?.getState?.()||null);
        r.transportAfter = await page.evaluate(url => window.NovaProxyDiagnostics?.captureTransportSnapshot?.(url) || window.NovaProxyManager?.captureTransportSnapshot?.(url) || window.NovaProxyManager?.getState?.() || null, requestedUrl);
      })(),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('per-site timeout')),PER_SITE_TIMEOUT))
    ]);
  } catch(e){ r.navigationFailed=true; pageErrors.push(String(e.message||e).slice(0,500)); }
  r.sriErrors=consoleErrors.filter(x=>/integrity|sha-?384|SRI/i.test(x));
  r.fontErrors=consoleErrors.filter(x=>/font|woff|OTS parsing|sfntVersion/i.test(x));
  r.workerErrors=consoleErrors.filter(x=>/worker/i.test(x));
  r.wasmErrors=consoleErrors.filter(x=>/wasm|WebAssembly/i.test(x));
  r.cspErrors=consoleErrors.filter(x=>/content security policy|CSP/i.test(x));
  r.rewriteErrors=consoleErrors.filter(x=>/rewrite|unrewrite|scramjet/i.test(x));
  r.tlsErrors=failedRequests.filter(x=>/CERT|TLS|SSL/i.test(x));
  r.websocketErrors=consoleErrors.filter(x=>/websocket|socket closed|gateway/i.test(x));
  r.challengeErrors=consoleErrors.filter(x=>/challenge|captcha|cloudflare/i.test(x));
  r.fatalPageErrors=pageErrors.filter(x=>!/^ResizeObserver loop/i.test(x));
  r.durationMs=Date.now()-started;
  Object.assign(r,scoreResult(r));
  const shot=`screenshots/${String(report.results.length+1).padStart(3,'0')}-${slug(name)}.png`;
  r.screenshot=shot;
  await page.screenshot({path:path.join(OUT,shot),fullPage:false}).catch(()=>{r.screenshot='';});
  report.results.push(r); flush();
  page.off('console',onConsole); page.off('pageerror',onPageError); page.off('requestfailed',onRequestFailed);
}

// R8.1 dedicated bad-target classification test. It is intentionally outside
// the 100-popular-site matrix and must not change the selected transport.
if (!stopping && Date.now() <= globalDeadline) {
  const requestedUrl = 'https://does-not-exist-nova-test.invalid/';
  const before = await page.evaluate(url => window.NovaProxyDiagnostics?.captureTransportSnapshot?.(url) || window.NovaProxyManager?.getState?.() || null, requestedUrl);
  let navigationFailed = false;
  try {
    await page.evaluate(url => { const t=window._novaTab.newTab(); if(!t) throw new Error('could not create Nova tab'); window._novaTab.navigate(url); }, requestedUrl);
    await new Promise(res=>setTimeout(res,5000));
  } catch { navigationFailed = true; }
  const after = await page.evaluate(url => window.NovaProxyDiagnostics?.captureTransportSnapshot?.(url) || window.NovaProxyManager?.getState?.() || null, requestedUrl);
  const unchanged = before?.currentTransport === after?.currentTransport && Number(before?.fallbackCount||0) === Number(after?.fallbackCount||0);
  report.badTargetClassification = { requestedUrl, navigationFailed:true, transportBefore:before, transportAfter:after, activeTransportUnchanged:unchanged, score:unchanged?'PASS':'FAIL', reason:unchanged?'target failure did not poison transport health':'invalid target caused transport fallback' };
}
flush();
await context.close();
console.log(`Saved ${report.results.length} results to ${REPORT_JSON}`);

// R8.3 regression signature: Cannot access 'r' before initialization
