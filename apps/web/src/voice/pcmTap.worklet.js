// Runs on the audio thread: hands the microphone's samples to the page in
// 20 ms frames. It only copies; deciding what the sound means happens on the
// page (voice/micInput.js), where it can be tested.

class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(Math.round(sampleRate * 0.02));
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (let i = 0; i < channel.length; i += 1) {
        this.frame[this.filled] = channel[i];
        this.filled += 1;
        if (this.filled === this.frame.length) {
          this.port.postMessage(this.frame.slice());
          this.filled = 0;
        }
      }
    }
    return true; // keep running while the microphone is open
  }
}

registerProcessor('pcm-tap', PcmTap);
