#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const runtimeModules = process.env.CODEX_RUNTIME_NODE_MODULES ||
  '/Users/closcon000/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(runtimeModules, 'playwright'));
const sharp = require(path.join(runtimeModules, 'sharp'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseURL = process.env.NOVA_AUDIT_URL || 'http://127.0.0.1:8788/';
const waitMs = Number(process.env.NOVA_AUDIT_WAIT_MS || 10000);
const concurrency = Math.max(1, Number(process.env.NOVA_AUDIT_CONCURRENCY || 4));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.env.NOVA_AUDIT_OUT || path.join(root, 'reports', `game-audit-${stamp}`));
const shotDir = path.join(outDir, 'screenshots');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'games.json'), 'utf8'))
  .filter(game => !game.blank && game.name && /^https?:\/\//i.test(game.url || ''));

fs.mkdirSync(shotDir, { recursive: true });
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorPattern = /\b(?:404|403|502|503|not found|access denied|forbidden|proxy error|connection (?:failed|refused)|site (?:wasn.?t|is not) available|couldn.?t (?:load|connect|find)|failed to (?:fetch|load)|application error|this site can.?t be reached)\b/i;

async function imageStats(file) {
  const { data, info } = await sharp(file).resize({ width: 480, withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, sum2 = 0, dark = 0, light = 0, edges = 0;
  const gray = new Uint8Array(info.width * info.height);
  for (let p = 0, i = 0; i < data.length; i += info.channels, p++) {
    const value = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    gray[p] = value; sum += value; sum2 += value * value;
    if (value < 12) dark++; if (value > 243) light++;
  }
  for (let y = 1; y < info.height; y++) for (let x = 1; x < info.width; x++) {
    const p = y * info.width + x;
    if (Math.abs(gray[p] - gray[p - 1]) + Math.abs(gray[p] - gray[p - info.width]) > 45) edges++;
  }
  const count = gray.length;
  const mean = sum / count;
  return { mean:+mean.toFixed(2), stdev:+Math.sqrt(Math.max(0, sum2 / count - mean * mean)).toFixed(2), darkRatio:+(dark/count).toFixed(4), lightRatio:+(light/count).toFixed(4), edgeRatio:+(edges/count).toFixed(4) };
}

function classify(snapshot, pixels, expected) {
  const reasons = [];
  const text = `${snapshot.title || ''}\n${snapshot.text || ''}`.slice(0, 16000);
  const uniform = pixels.stdev < 3.2 && (pixels.darkRatio > .93 || pixels.lightRatio > .93);
  const visuallyEmpty = pixels.stdev < 5 && pixels.edgeRatio < .0025;
  if (snapshot.transport !== expected && !(expected === 'legacy' && snapshot.transport === 'baremux-legacy')) reasons.push(`transport changed to ${snapshot.transport || 'unknown'}`);
  // A number of game portals intentionally redirect to a CDN or a newer host.
  // Treat that as working when a substantial, non-error document rendered.
  if (!snapshot.frameMatched && snapshot.htmlLength < 1000) reasons.push('active frame did not match the requested game host');
  if (snapshot.proxyError) reasons.push(snapshot.proxyError);
  if (errorPattern.test(text)) reasons.push('visible error page');
  if (uniform || visuallyEmpty) reasons.push('screenshot is blank or nearly uniform');
  if (snapshot.htmlLength < 300 && snapshot.textLength < 10) reasons.push('document has no usable content');
  return { works: reasons.length === 0, reasons };
}

async function inspect(page, game, transport, index) {
  const started = Date.now();
  const consoleErrors = [];
  const failedRequests = [];
  const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); };
  const onFailed = request => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText || 'failed'}`.slice(0, 600));
  page.on('console', onConsole); page.on('requestfailed', onFailed);
  let snapshot = { frameMatched:false, title:'', text:'', textLength:0, htmlLength:0, transport:'', proxyError:'' };
  const shotName = `${transport}-${String(index + 1).padStart(3, '0')}-${slug(game.name)}.png`;
  const shotPath = path.join(shotDir, shotName);
  try {
    await page.evaluate(url => window._novaTab.navigate(url), game.url);
    await sleep(waitMs);
    snapshot = await page.evaluate(requested => {
      const iframe = document.querySelector('.tab-iframe.active');
      const state = window.NovaProxyManager?.getState?.() || {};
      let title = '', text = '', htmlLength = 0, href = '', frameMatched = false;
      try {
        const doc = iframe?.contentDocument;
        title = doc?.title || '';
        text = (doc?.body?.innerText || doc?.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16000);
        htmlLength = doc?.documentElement?.outerHTML?.length || 0;
        href = String(iframe?.contentWindow?.location?.href || '');
      } catch (_) {}
      try {
        const current = String(window._novaTab.getUrl?.() || requested);
        frameMatched = new URL(current).hostname === new URL(requested).hostname;
      } catch (_) {}
      return {
        title, text, textLength:text.length, htmlLength, href, frameMatched,
        transport:state.currentTransport || '', engine:state.currentEngine || '',
        proxyError:document.querySelector('.nova-proxy-error')?.textContent?.replace(/\s+/g, ' ').trim().slice(0,500) || ''
      };
    }, game.url);
    const frame = page.locator('.tab-iframe.active');
    if (await frame.count()) await frame.screenshot({ path:shotPath });
    else await page.screenshot({ path:shotPath });
  } catch (error) {
    snapshot.proxyError = String(error?.message || error).slice(0, 500);
    await page.screenshot({ path:shotPath }).catch(() => {});
  }
  const pixels = fs.existsSync(shotPath) ? await imageStats(shotPath) : { mean:0, stdev:0, darkRatio:1, lightRatio:0, edgeRatio:0 };
  const verdict = classify(snapshot, pixels, transport);
  page.off('console', onConsole); page.off('requestfailed', onFailed);
  return { name:game.name, url:game.url, transport, ...verdict, snapshot, pixels, consoleErrors:consoleErrors.slice(0,8), failedRequests:failedRequests.slice(0,8), screenshot:path.relative(outDir, shotPath), durationMs:Date.now()-started };
}

async function runPass(browser, transport, games) {
  const results = new Array(games.length);
  let cursor = 0;
  async function worker() {
    const context = await browser.newContext({ viewport:{ width:1280, height:800 }, serviceWorkers:'allow' });
    await context.addInitScript(() => {
      localStorage.setItem('nova_consent', 'minimal');
      localStorage.setItem('nova_setup_v7_complete', '7.0-launch');
      localStorage.setItem('nova_seen_version', '7.0');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const url = new URL(baseURL); url.searchParams.set('novaProxyAuditTransport', transport);
    let ready = false;
    for (let attempt = 1; attempt <= 3 && !ready; attempt++) {
      try {
        await page.goto(url.toString(), { waitUntil:'domcontentloaded', timeout:45000 });
        await page.waitForFunction(() => !!window.NovaProxyManager && !!window._novaTab, null, { timeout:45000 });
        ready = true;
      } catch (error) {
        if (attempt === 3) throw error;
        await sleep(1500 * attempt);
      }
    }
    while (true) {
      const index = cursor++;
      if (index >= games.length) break;
      results[index] = await inspect(page, games[index], transport, index);
      process.stdout.write(`${transport} ${index + 1}/${games.length} ${results[index].works ? 'PASS' : 'FAIL'} ${games[index].name}\n`);
    }
    await context.close();
  }
  await Promise.all(Array.from({ length:Math.min(concurrency, games.length) }, worker));
  fs.writeFileSync(path.join(outDir, `${transport}.json`), JSON.stringify(results, null, 2));
  return results;
}

const browser = await chromium.launch({ headless:true });
try {
  const cachedPass = (transport) => {
    const file = path.join(outDir, `${transport}.json`);
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
  };
  const libcurl = cachedPass('libcurl') || await runPass(browser, 'libcurl', catalog);
  const epoxyGames = catalog.filter((_, index) => !libcurl[index].works);
  const epoxy = cachedPass('epoxy') || (epoxyGames.length ? await runPass(browser, 'epoxy', epoxyGames) : []);
  const epoxyByURL = new Map(epoxy.map(result => [result.url, result]));
  const legacyGames = epoxyGames.filter(game => !epoxyByURL.get(game.url)?.works);
  const legacy = cachedPass('legacy') || (legacyGames.length ? await runPass(browser, 'legacy', legacyGames) : []);
  const legacyByURL = new Map(legacy.map(result => [result.url, result]));
  const assignments = catalog.map((game, index) => ({
    name:game.name, url:game.url,
    proxyTransport:libcurl[index].works ? 'libcurl' : epoxyByURL.get(game.url)?.works ? 'epoxy' : legacyByURL.get(game.url)?.works ? 'legacy' : null
  }));
  const broken = assignments.filter(item => !item.proxyTransport);
  const report = { generatedAt:new Date().toISOString(), baseURL, waitMs, concurrency, playableGames:catalog.length,
    summary:{ libcurl:assignments.filter(x=>x.proxyTransport==='libcurl').length, epoxy:assignments.filter(x=>x.proxyTransport==='epoxy').length, legacy:assignments.filter(x=>x.proxyTransport==='legacy').length, broken:broken.length },
    assignments, broken };
  fs.writeFileSync(path.join(outDir, 'final-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'assignments.json'), JSON.stringify(assignments, null, 2));
  console.log(`FINAL_REPORT=${path.join(outDir, 'final-report.json')}`);
} finally {
  await browser.close();
}
