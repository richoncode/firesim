import { PhisemVoice } from './phisem.ts';
import type { VoiceControls } from './mapping.ts';

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

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<VoiceControls>) => {
      const data = event.data;
      if (!data || typeof data.drive !== 'number') return;
      this.voice.setControls(data);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channel = outputs[0]?.[0];
    if (channel) this.voice.read(channel);
    return true;
  }
}

registerProcessor('fire-voice', FireVoiceProcessor);
