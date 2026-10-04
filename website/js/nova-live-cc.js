// Nova Movies Live CC — optional on-device speech-to-text for movies without caption tracks.
(function () {
  'use strict';

  let state = null;

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

  function stop() {
    if (!state) return;
    const old = state;
    state = null;

    try { old.audioNode?.disconnect(); } catch (_) {}
    try { old.source?.disconnect(); } catch (_) {}
    try { old.sink?.disconnect(); } catch (_) {}
    try { old.worker?.terminate(); } catch (_) {}
    try { old.stream?.getTracks?.().forEach(track => track.stop()); } catch (_) {}
    try { old.context?.close(); } catch (_) {}

    if (old.video) {
      setOverlay(old.video, '');
      setStatus(old.video, '');
    }
  }

  function cleanText(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    const normalized = text
      .toLowerCase()
      .replace(/[♪♫]+/g, '')
      .replace(/[^a-z0-9'!?., -]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const hallucinations = new Set([
      'music',
      'music playing',
      '♪',
      '♫',
      'applause',
      'silence',
      'thank you for watching',
      'thanks for watching',
      'subscribe',
      'you',
      'thank you',
      '♪ music ♪'
    ]);

    if (hallucinations.has(normalized) || normalized.length < 2) return '';
    return text;
  }

  async function start(video, onState) {
    if (!video) return false;
    stop();

    if (!window.AudioContext && !window.webkitAudioContext) {
      onState?.('unavailable');
      return false;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const local = {
      video,
      running: true,
      source: null,
      audioNode: null,
      sink: null,
      context: null,
      worker: null,
      workerBusy: false,
      pendingBuffer: null,
      nextId: 1,
      lastTranscript: '',
      hideTimer: null,
      chunkSeconds: 3,
      pcm: [],
      sampleRate: 0
    };
    state = local;

    try {
      onState?.('loading');
      setStatus(video, 'LIVE CC · loading speech model');

      const workerUrl = new URL('/website/js/nova-live-cc-worker.js', window.location.href);
      local.worker = new Worker(workerUrl, { type: 'module' });

      local.worker.onmessage = event => {
        const message = event.data || {};
        if (!local.running || state !== local) return;
        if (message.type === 'error') {
          local.workerBusy = false;
          console.warn('[Nova Live CC] worker transcription failed', message.message);
          onState?.('error', 'Live CC transcription failed');
          processPending();
          return;
        }
        if (message.type !== 'result') return;

        local.workerBusy = false;
        const text = cleanText(message.text);
        if (text && text !== local.lastTranscript) {
          local.lastTranscript = text;
          setOverlay(video, text);
          onState?.('live', text);
          clearTimeout(local.hideTimer);
          local.hideTimer = setTimeout(() => {
            if (state === local) setOverlay(video, '');
          }, 2400);
        }
        processPending();
      };

      local.worker.onerror = error => {
        if (state !== local) return;
        console.warn('[Nova Live CC] worker error', error);
        onState?.('error', 'Live CC worker failed');
      };

      const context = new AudioCtx();
      local.context = context;
      if (context.state === 'suspended') await context.resume();

      let source;
      try {
        if (typeof video.captureStream !== 'function') throw new Error('captureStream is unavailable');
        const stream = video.captureStream();
        if (!stream || !stream.getAudioTracks().length) {
          throw new Error('Movie capture stream has no audio track');
        }
        local.stream = stream;
        source = context.createMediaStreamSource(stream);
      } catch (captureError) {
        if (!navigator.mediaDevices?.getDisplayMedia) throw captureError;

        onState?.('permission');
        setStatus(video, 'LIVE CC · select This Tab + share audio');

        const shared = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          systemAudio: 'include'
        });

        if (!local.running || state !== local) {
          shared.getTracks().forEach(track => track.stop());
          return false;
        }

        if (!shared.getAudioTracks().length) {
          shared.getTracks().forEach(track => track.stop());
          throw new Error('No tab audio was shared. Choose This Tab and enable audio.');
        }

        local.stream = shared;
        source = context.createMediaStreamSource(shared);
        setStatus(video, 'LIVE CC · tab audio connected');

        shared.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (state === local) {
            stop();
            onState?.('unsupported', new Error('Tab audio sharing ended'));
          }
        }, { once: true });
      }

      local.source = source;

      if (!context.audioWorklet) {
        throw new Error('AudioWorklet is unavailable in this browser');
      }

      await context.audioWorklet.addModule(new URL('./nova-live-cc-worklet.js', document.baseURI));

      const audioNode = new AudioWorkletNode(context, 'nova-live-cc-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers'
      });
      local.audioNode = audioNode;

      // Keep the worklet alive without feeding captured audio back to the
      // speakers. This avoids the old ScriptProcessorNode and tab-audio echo.
      const sink = context.createGain();
      sink.gain.value = 0;
      local.sink = sink;

      source.connect(audioNode);
      audioNode.connect(sink);
      sink.connect(context.destination);

      local.sampleRate = context.sampleRate;
      audioNode.port.onmessage = event => {
        if (!local.running || state !== local) return;
        const buffer = event.data instanceof ArrayBuffer
          ? new Float32Array(event.data)
          : null;
        if (!buffer) return;

        for (let i = 0; i < buffer.length; i += 1) local.pcm.push(buffer[i]);

        const targetSamples = Math.floor(local.sampleRate * local.chunkSeconds);
        if (local.pcm.length < targetSamples) return;

        const chunk = Float32Array.from(local.pcm.splice(0, targetSamples));
        if (local.workerBusy) {
          // Never queue an old backlog. Only the newest audio window matters.
          local.pendingBuffer = chunk;
          return;
        }
        sendChunk(chunk);
      };

      function sendChunk(chunk) {
        if (!local.running || state !== local || local.workerBusy) return;

        let sum = 0;
        let peak = 0;
        for (let i = 0; i < chunk.length; i += 1) {
          const value = chunk[i];
          sum += value * value;
          const magnitude = Math.abs(value);
          if (magnitude > peak) peak = magnitude;
        }

        const rms = Math.sqrt(sum / chunk.length);
        if (rms < 0.008 || peak < 0.035) {
          processPending();
          return;
        }

        local.workerBusy = true;
        const id = local.nextId++;
        local.worker.postMessage({
          type: 'transcribe',
          id,
          buffer: chunk.buffer,
          sampleRate: local.sampleRate,
          chunkSeconds: local.chunkSeconds
        }, [chunk.buffer]);
      }

      function processPending() {
        if (!local.running || state !== local || local.workerBusy || !local.pendingBuffer) return;
        const next = local.pendingBuffer;
        local.pendingBuffer = null;
        sendChunk(next);
      }

      onState?.('live');
      setStatus(video, 'LIVE CC');
      return true;
    } catch (error) {
      console.warn('[Nova Live CC] startup failed', error);
      stop();
      onState?.('unsupported', error);
      return false;
    }
  }

  window.NovaLiveCC = { start, stop, isActive: () => Boolean(state) };
}());
