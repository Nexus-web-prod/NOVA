class NovaLiveCCProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.target = 4096;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (channel) {
      const copy = new Float32Array(channel.length);
      copy.set(channel);
      this.buffer.push(copy);

      let length = 0;
      for (const part of this.buffer) length += part.length;
      if (length >= this.target) {
        const out = new Float32Array(length);
        let offset = 0;
        for (const part of this.buffer) {
          out.set(part, offset);
          offset += part.length;
        }
        this.buffer = [];
        this.port.postMessage(out.buffer, [out.buffer]);
      }
    }

    const output = outputs[0];
    if (output) {
      for (const channelOut of output) channelOut.fill(0);
    }
    return true;
  }
}

registerProcessor('nova-live-cc-processor', NovaLiveCCProcessor);
