// Nova Movies Live CC — optional on-device speech-to-text for movies without caption tracks.
(function () {
  'use strict';

  let state = null;
  let recognizerPromise = null;

  function ensureStyle() {
    if (document.getElementById('nova-live-cc-style')) return;
    const style = document.createElement('style');
    style.id = 'nova-live-cc-style';
    style.textContent = [
      '.nova-live-cc-overlay{position:absolute;left:5%;right:5%;bottom:7%;z-index:6;display:flex;justify-content:center;pointer-events:none}',
      '.nova-live-cc-text{max-width:min(900px,90%);padding:.45rem .8rem;border-radius:.35rem;background:rgba(0,0,0,.78);color:#fff;font:600 clamp(.72rem,1.5vw,1.05rem)/1.35 system-ui,sans-serif;text-align:center;text-shadow:0 1px 2px #000;box-shadow:0 2px 14px rgba(0,0,0,.25);opacity:0;transition:opacity .12s ease}',
      '.nova-live-cc-text.visible{opacity:1}',
      '.movies-player-live-status{position:absolute;left:50%;bottom:1.1rem;transform:translateX(-50%);z-index:7;padding:.28rem .55rem;border:1px solid rgba(139,143,255,.28);border-radius:999px;background:rgba(4,4,10,.8);color:var(--muted);font:700 .42rem/1 "Space Mono",monospace;letter-spacing:.06em;pointer-events:none;opacity:0;transition:opacity .15s}',
      '.movies-player-live-status.visible{opacity:1}'
    ].join('');
    document.head.appendChild(style);
  }

  function setOverlay(video, text) {
    ensureStyle();
    const wrap = video?.parentElement;
    if (!wrap) return;
    let overlay = wrap.querySelector('.nova-live-cc-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'nova-live-cc-overlay';
      overlay.innerHTML = '<div class="nova-live-cc-text" aria-live="polite"></div>';
      wrap.appendChild(overlay);
    }
    const label = overlay.firstElementChild;
    label.textContent = text || '';
    label.classList.toggle('visible', Boolean(text));
  }

  function setStatus(video, text) {
    ensureStyle();
    const wrap = video?.parentElement;
    if (!wrap) return;
    let status = wrap.querySelector('.movies-player-live-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'movies-player-live-status';
      wrap.appendChild(status);
    }
    status.textContent = text || '';
    status.classList.toggle('visible', Boolean(text));
  }

  async function getRecognizer() {
    if (!recognizerPromise) {
      recognizerPromise = import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2')
        .then(({ pipeline, env }) => {
          env.allowLocalModels = false;
          env.useBrowserCache = true;
          return pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
            dtype: 'q8',
            device: 'wasm'
          });
        });
    }
    return recognizerPromise;
  }

  function stop() {
    if (!state) return;
    const old = state;
    state = null;
    try { old.processor?.disconnect(); } catch (_) {}
    try { old.source?.disconnect(); } catch (_) {}
    try { old.context?.close(); } catch (_) {}
    if (old.video) {
      setOverlay(old.video, '');
      setStatus(old.video, '');
    }
  }

  async function start(video, onState) {
    if (!video) return false;
    stop();

    if (!window.AudioContext && !window.webkitAudioContext) {
      onState?.('unavailable');
      return false;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const local = { video, running: true, source: null, processor: null, context: null, busy: false, pcm: [] };
    state = local;

    try {
      onState?.('loading');
      setStatus(video, 'LIVE CC · loading speech model');
      const recognizer = await getRecognizer();
      if (!local.running || state !== local) return false;

      const context = new AudioCtx();
      local.context = context;
      if (context.state === 'suspended') await context.resume();

      // This requires the movie response to permit Web Audio access (CORS).
      const source = context.createMediaElementSource(video);
      const processor = context.createScriptProcessor(4096, 1, 1);
      local.source = source;
      local.processor = processor;

      source.connect(processor);
      processor.connect(context.destination);

      const sampleRate = context.sampleRate;
      const targetSamples = Math.floor(sampleRate * 6);
      processor.onaudioprocess = event => {
        if (!local.running || local.busy) return;
        const input = event.inputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i += 1) local.pcm.push(input[i]);
        if (local.pcm.length < targetSamples) return;

        const chunk = Float32Array.from(local.pcm.splice(0, targetSamples));
        local.busy = true;
        Promise.resolve(recognizer(chunk, { sampling_rate: sampleRate, return_timestamps: false }))
          .then(result => {
            if (!local.running || state !== local) return;
            const text = String(result?.text || '').trim();
            if (text) {
              setOverlay(video, text);
              onState?.('live', text);
              clearTimeout(local.hideTimer);
              local.hideTimer = setTimeout(() => {
                if (state === local) setOverlay(video, '');
              }, 5200);
            }
          })
          .catch(error => {
            if (state !== local) return;
            console.warn('[Nova Live CC] transcription failed', error);
            onState?.('error', 'Live CC transcription failed');
          })
          .finally(() => {
            local.busy = false;
          });
      };

      onState?.('live');
      setStatus(video, 'LIVE CC');
      return true;
    } catch (error) {
      console.warn('[Nova Live CC] audio capture unavailable', error);
      stop();
      onState?.('unsupported', error);
      return false;
    }
  }

  window.NovaLiveCC = { start, stop, isActive: () => Boolean(state) };
}());
