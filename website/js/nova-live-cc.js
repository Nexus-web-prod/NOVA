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
          return pipeline('automatic-speech-recognition', 'onnx-community/whisper-base.en', {
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
    try { old.stream?.getTracks?.().forEach(track => track.stop()); } catch (_) {}
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
    const local = {
      video,
      running: true,
      source: null,
      processor: null,
      context: null,
      busy: false,
      pcm: [],
      pendingChunk: null,
      lastTranscript: '',
      hideTimer: null
    };
    state = local;

    try {
      onState?.('loading');
      setStatus(video, 'LIVE CC · loading speech model');
      const recognizer = await getRecognizer();
      if (!local.running || state !== local) return false;

      const context = new AudioCtx();
      local.context = context;
      if (context.state === 'suspended') await context.resume();

      // Direct media capture is the preferred path, but browsers refuse to
      // expose cross-origin media that was not served with CORS headers.
      // NOVA's movie files are hosted on a separate R2 origin, so fall back
      // to user-approved current-tab audio capture when direct capture is
      // blocked. This never requests microphone access.
      let source;
      try {
        if (typeof video.captureStream !== 'function') {
          throw new Error('captureStream is unavailable');
        }
        const stream = video.captureStream();
        if (!stream || !stream.getAudioTracks().length) {
          throw new Error('Movie capture stream has no audio track');
        }
        local.stream = stream;
        source = context.createMediaStreamSource(stream);
      } catch (captureError) {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw captureError;
        }

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

        const audioTracks = shared.getAudioTracks();
        if (!audioTracks.length) {
          shared.getTracks().forEach(track => track.stop());
          throw new Error('No tab audio was shared. Choose This Tab and enable audio.');
        }

        local.stream = shared;
        source = context.createMediaStreamSource(shared);
        setStatus(video, 'LIVE CC · tab audio connected');

        const [videoTrack] = shared.getVideoTracks();
        videoTrack?.addEventListener('ended', () => {
          if (state === local) {
            stop();
            onState?.('unsupported', new Error('Tab audio sharing ended'));
          }
        }, { once: true });
      }

      const processor = context.createScriptProcessor(4096, 1, 1);
      local.source = source;
      local.processor = processor;

      source.connect(processor);
      processor.connect(context.destination);

      const sampleRate = context.sampleRate;
      const targetSamples = Math.floor(sampleRate * 8);
      processor.onaudioprocess = event => {
        if (!local.running) return;
        const input = event.inputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i += 1) local.pcm.push(input[i]);
        if (local.pcm.length < targetSamples) return;

        // Keep the newest window if Whisper is still processing. This prevents
        // a slow browser inference from permanently falling behind the movie.
        const chunk = Float32Array.from(local.pcm.splice(0, targetSamples));
        if (local.busy) {
          local.pendingChunk = chunk;
          return;
        }

        transcribeChunk(chunk);
      };

      async function transcribeChunk(chunk) {
        if (!local.running || state !== local) return;

        // Avoid sending silence/noise to Whisper. This also reduces the common
        // Whisper hallucination where music-only audio becomes "music".
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
          if (local.running && state === local && local.pendingChunk) {
            const next = local.pendingChunk;
            local.pendingChunk = null;
            transcribeChunk(next);
          }
          return;
        }

        local.busy = true;
        try {
          const result = await recognizer(chunk, {
            sampling_rate: sampleRate,
            return_timestamps: false,
            chunk_length_s: 8
          });
          if (!local.running || state !== local) return;

          let text = String(result?.text || '')
            .replace(/\s+/g, ' ')
            .trim();

          // Whisper commonly hallucinates these labels over instrumental
          // music, intros, silence, or other non-speech. Do not show them as CC.
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
            'thank you'
          ]);
          if (hallucinations.has(normalized) || normalized.length < 2) text = '';

          if (text && text !== local.lastTranscript) {
            local.lastTranscript = text;
            setOverlay(video, text);
            onState?.('live', text);
            clearTimeout(local.hideTimer);
            local.hideTimer = setTimeout(() => {
              if (state === local) setOverlay(video, '');
            }, 5200);
          }
        } catch (error) {
          if (state === local) {
            console.warn('[Nova Live CC] transcription failed', error);
            onState?.('error', 'Live CC transcription failed');
          }
        } finally {
          local.busy = false;
          if (local.running && state === local && local.pendingChunk) {
            const next = local.pendingChunk;
            local.pendingChunk = null;
            transcribeChunk(next);
          }
        }
      }

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
