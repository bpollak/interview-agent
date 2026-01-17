class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array();
    this.sampleRate = 16000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0]; // Mono
    
    // Downsample to 16kHz
    // We assume the context sample rate is higher (e.g. 44.1 or 48kHz)
    // We accumulate samples and only process when we have enough
    
    // Simple buffer accumulation
    const newBuffer = new Float32Array(this.buffer.length + channelData.length);
    newBuffer.set(this.buffer);
    newBuffer.set(channelData, this.buffer.length);
    this.buffer = newBuffer;

    // Calculate ratio
    // globalThis.sampleRate is the context sample rate
    const ratio = globalThis.sampleRate / this.sampleRate;
    
    // We need enough samples to produce at least 1 output sample?
    // Actually, let's just process chunks.
    
    const outputSamples = Math.floor(this.buffer.length / ratio);
    
    if (outputSamples > 0) {
      const pcm16 = new Int16Array(outputSamples);
      
      for (let i = 0; i < outputSamples; i++) {
        const offset = Math.floor(i * ratio);
        // Simple Nearest Neighbor / Decimation for performance
        // Better: Linear Interpolation or averaging
        let sample = this.buffer[offset];
        
        // Clamp to [-1, 1]
        sample = Math.max(-1, Math.min(1, sample));
        
        // Convert to PCM16
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      }
      
      // Post data to main thread
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
      
      // Keep remaining
      const remainingStart = Math.ceil(outputSamples * ratio);
      this.buffer = this.buffer.slice(remainingStart);
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
