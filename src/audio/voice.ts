import type { VoiceControls } from './mapping.ts';

const WORKLET_URL = `${import.meta.env.BASE_URL}audio/fire-voice-processor.js`;

/**
 * Main-thread owner of the fire voice. The context is created on the first unmute,
 * which has to be a click or a key: browsers will not start audio without a gesture.
 * Mute zeros the output gain and leaves the caller (and the simulation) running.
 */
export class FireVoice {
  private context?: AudioContext;
  private gain?: GainNode;
  private node?: AudioWorkletNode;
  private opening?: Promise<void>;
  private audible = false;
  private controls: VoiceControls = { drive: 0, cooling: 1, smoke: 0, impulse: 0 };
  private queuedImpulse = 0;

  get isAudible(): boolean {
    return this.audible;
  }

  /** Remember the latest controls and post them when the worklet exists. */
  setControls(controls: VoiceControls): void {
    const kick = Number.isFinite(controls.impulse) ? Math.max(0, controls.impulse) : 0;
    // Drop bursts that happen before the gesture. Audio-off stays silent, including the first unmute.
    if (this.context && kick > 0) this.queuedImpulse = Math.min(1.5, this.queuedImpulse + kick);
    this.controls = { ...controls, impulse: 0 };
    this.post();
  }

  /**
   * Start or resume. Call from a click or key handler. The AudioContext is constructed
   * before the first await so the gesture still counts.
   */
  async unmute(): Promise<void> {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      const resumed = context.resume();
      this.opening = this.open(context, resumed).catch(async (error: unknown) => {
        this.node?.disconnect();
        this.gain?.disconnect();
        await context.close().catch(() => {});
        this.context = undefined;
        this.node = undefined;
        this.gain = undefined;
        this.opening = undefined;
        throw error;
      });
    } else if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    await this.opening;
    if (!this.gain) throw new Error('Fire audio did not start.');
    this.gain.gain.value = 1;
    this.audible = true;
    this.post();
  }

  /** Instant silence. The simulation is not involved. */
  mute(): void {
    if (this.gain) this.gain.gain.value = 0;
    this.audible = false;
  }

  async toggle(): Promise<void> {
    if (this.audible) this.mute();
    else await this.unmute();
  }

  private async open(context: AudioContext, resumed: Promise<void>): Promise<void> {
    await context.audioWorklet.addModule(WORKLET_URL);
    const node = new AudioWorkletNode(context, 'fire-voice', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const gain = context.createGain();
    gain.gain.value = 0;
    node.connect(gain);
    gain.connect(context.destination);
    node.onprocessorerror = () => {
      this.audible = false;
      gain.gain.value = 0;
    };
    this.node = node;
    this.gain = gain;
    await resumed;
    this.post();
  }

  private post(): void {
    if (!this.node) return;
    this.node.port.postMessage({ ...this.controls, impulse: this.queuedImpulse });
    this.queuedImpulse = 0;
  }
}
