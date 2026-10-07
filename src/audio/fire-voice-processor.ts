import type { PlumeControls, VoiceControls } from './mapping.ts';
import { PhisemVoice } from './phisem.ts';
import { PlumeVoice } from './plume.ts';

// The DOM lib in this toolchain describes AudioWorkletNode, not the processor scope.
declare const sampleRate: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

class FireVoiceProcessor extends AudioWorkletProcessor {
  private readonly voice = new PhisemVoice(sampleRate);
  private readonly plume = new PlumeVoice(sampleRate);
  private usePlume = false;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<VoiceControls | PlumeControls>) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (Array.isArray((data as PlumeControls).probes)) {
        this.plume.setControls(data as PlumeControls);
        this.usePlume = true;
        return;
      }
      if (typeof (data as VoiceControls).drive !== 'number') return;
      this.voice.setControls(data as VoiceControls);
      this.usePlume = false;
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    const left = channels?.[0];
    if (!left) return true;
    const right = channels[1];
    if (this.usePlume && right) {
      this.plume.read(left, right);
      return true;
    }
    this.voice.read(left);
    if (right) right.set(left);
    return true;
  }
}

registerProcessor('fire-voice', FireVoiceProcessor);
