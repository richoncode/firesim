import type { VoiceControls } from './mapping.ts';

/**
 * Perry Cook's PhISEM shape, plus a continuous roar.
 * `systemEnergy` decays every sample on the audio clock. A control-rate `drive` adds
 * energy. Collision times are a Poisson process whose rate follows that energy. Each
 * collision adds to a noise envelope. Three bandpasses color the envelope. The roar is
 * filtered noise following the same energy, so both die out when `drive` stays at zero.
 */
export class PhisemVoice {
  private readonly sampleRate: number;
  private readonly low: Biquad;
  private readonly mid: Biquad;
  private readonly high: Biquad;
  private drive = 0;
  private cooling = 1;
  private smoke = 0;
  private impulse = 0;
  private systemEnergy = 0;
  private soundLevel = 0;
  private brown = 0;
  private bed = 0;
  private wobble = 0;
  private dcIn = 0;
  private dcOut = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate > 0 ? sampleRate : 48000;
    this.low = new Biquad(this.sampleRate);
    this.mid = new Biquad(this.sampleRate);
    this.high = new Biquad(this.sampleRate);
    this.retune(0);
  }

  setControls(controls: VoiceControls): void {
    this.drive = finite(controls.drive, 0);
    this.cooling = Math.max(0.05, finite(controls.cooling, 1));
    this.smoke = clamp01(finite(controls.smoke, 0));
    const kick = finite(controls.impulse, 0);
    if (kick > 0) this.impulse = Math.min(1.5, this.impulse + kick);
  }

  read(output: Float32Array): void {
    const dt = 1 / this.sampleRate;
    if (this.impulse > 0) {
      this.systemEnergy = Math.min(1.5, this.systemEnergy + this.impulse);
      this.soundLevel += 0.85 * Math.min(1, this.impulse);
      this.impulse = 0;
    }
    if (this.drive <= 1e-6 && this.systemEnergy < 1e-5 && this.soundLevel < 1e-5) {
      this.systemEnergy = 0;
      this.soundLevel = 0;
      output.fill(0);
      return;
    }
    const decay = Math.exp(-this.cooling * dt);
    const envelopeDecay = Math.exp(-58 * dt);
    for (let i = 0; i < output.length; i++) {
      this.systemEnergy = this.systemEnergy * decay + this.drive * dt;
      if (this.systemEnergy > 1.5) this.systemEnergy = 1.5;
      const unit = this.systemEnergy > 1 ? 1 : this.systemEnergy;
      // Quadratic so a quiet fire pops sparsely and a hot one crackles.
      const rate = 70 * unit * unit;
      if (Math.random() < 1 - Math.exp(-rate * dt)) {
        this.soundLevel += 0.35 + 0.65 * Math.random();
      }
      this.soundLevel *= envelopeDecay;
      if (this.soundLevel < 1e-6) this.soundLevel = 0;
      this.retune(unit);
      const burst = (Math.random() * 2 - 1) * this.soundLevel;
      const crackle =
        this.low.process(burst) * 0.55 +
        this.mid.process(burst) * 0.9 +
        this.high.process(burst) * 0.42;
      const white = Math.random() * 2 - 1;
      this.brown = this.brown * 0.97 + white * 0.28;
      const cutoff = 160 + 1500 * unit * (1 - 0.65 * this.smoke);
      const follow = 1 - Math.exp(-2 * Math.PI * cutoff * dt);
      this.bed += follow * (this.brown - this.bed);
      this.wobble = this.wobble * 0.9992 + white * 0.0015;
      if (this.wobble > 0.35) this.wobble = 0.35;
      else if (this.wobble < -0.35) this.wobble = -0.35;
      const body = 0.45 + 0.55 * (1 - this.smoke);
      const roar = this.bed * unit * body * (0.82 + this.wobble);
      const mixed = roar * 0.9 + crackle * 0.5;
      // DC blocker, about 20 Hz, so the bed does not shove the speaker.
      const highpassed = mixed - this.dcIn + 0.995 * this.dcOut;
      this.dcIn = mixed;
      this.dcOut = highpassed;
      output[i] = Math.tanh(highpassed * 1.35);
    }
  }

  private retune(unit: number): void {
    this.low.setBandpass(280 + 80 * unit, 0.8);
    this.mid.setBandpass(1500 + 700 * unit, 3.2);
    this.high.setBandpass(3400 + 900 * unit, 4.5);
  }
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  if (!(value > 0)) return 0;
  return value > 1 ? 1 : value;
}

/** Constant-peak-gain bandpass, RBJ cookbook. Coefficients refresh only when the tune changes. */
export class Biquad {
  private readonly sampleRate: number;
  private frequency = -1;
  private q = -1;
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  setBandpass(frequency: number, q: number): void {
    if (frequency === this.frequency && q === this.q) return;
    this.frequency = frequency;
    this.q = q;
    const omega = (2 * Math.PI * frequency) / this.sampleRate;
    const sine = Math.sin(omega);
    const cosine = Math.cos(omega);
    const alpha = sine / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cosine) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    if (Math.abs(y) < 1e-12) return 0;
    return y;
  }
}
