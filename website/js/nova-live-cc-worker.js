// Nova Movies Live CC — dedicated Whisper worker.
// Keeps WASM speech-to-text off the page's main UI thread.
let recognizerPromise = null;

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

self.onmessage = async event => {
  const message = event.data || {};
  if (message.type !== 'transcribe' || !message.buffer) return;

  const id = message.id;
  try {
    const recognizer = await getRecognizer();
    const audio = new Float32Array(message.buffer);
    const result = await recognizer(audio, {
      sampling_rate: message.sampleRate || 16000,
      return_timestamps: false,
      chunk_length_s: message.chunkSeconds || 3
    });
    self.postMessage({
      type: 'result',
      id,
      text: String(result?.text || '').replace(/\s+/g, ' ').trim()
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      message: error?.message || String(error)
    });
  }
};
