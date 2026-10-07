import type { PlumeControls } from './mapping.ts';
import { Biquad } from './phisem.ts';

const ATTACK = 8;
const CRACKLE_RATE = 70;
const CRACKLE_GAIN = 0.22;
const ROAR_GAIN = 0.8;

/**
 * Sixteen small crackle voices plus one shared roar.
 * Each probe keeps its own energy. A rising target approaches at `ATTACK` (about 8/s)
 * so a plume that reaches the next probe a fraction of a second later is still a
 * separate onset. A falling target decays at the posted cooling, which is the fire's
 * cooling. The roar is the mean energy of the probes that are actually burning.
 * Empty probes are left out of that mean so they do not thin the bed.
 */
export class PlumeVoice {
  private readonly sampleRate: number;
  private readonly probes: ProbeCrackle[];
  private readonly roar: RoarBed;
  private cooling = 1;
  private smoke = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate > 0 ? sampleRate : 48000;
    this.probes = Array.from({ length: 16 }, () => new ProbeCrackle(this.sampleRate));
    this.roar = new RoarBed(this.sampleRate);
  }

  setControls(controls: PlumeControls): void {
    this.cooling = Math.max(0.05, finite(controls.cooling, 1));
    this.smoke = clamp01(finite(controls.smoke, 0));
    const probes = Array.isArray(controls.probes) ? controls.probes : [];
    for (let i = 0; i < this.probes.length; i++) {
      const probe = probes[i];
      const voice = this.probes[i];
      if (!probe) {
        voice.drive = 0;
        voice.motion = 0;
        voice.pan = 0;
        voice.live = false;
        continue;
      }
      voice.drive = Math.max(0, finite(probe.drive, 0));
      voice.motion = clamp01(finite(probe.motion, 0));
      voice.pan = Math.min(1, Math.max(-1, finite(probe.pan, 0)));
      voice.live = Boolean(probe.live);
      const kick = finite(probe.impulse, 0);
      if (kick > 0) voice.impulse = Math.min(1.5, voice.impulse + kick);
    }
  }

  read(left: Float32Array, right: Float32Array): void {
    const frames = Math.min(left.length, right.length);
    if (!this.audible()) {
      left.fill(0);
      right.fill(0);
      this.roar.silence();
      return;
    }
    const dt = 1 / this.sampleRate;
    const decay = Math.exp(-this.cooling * dt);
    const attack = 1 - Math.exp(-ATTACK * dt);
    for (let i = 0; i < frames; i++) {
      let energy = 0;
      let motion = 0;
      let panMoment = 0;
      let panWeight = 0;
      let burning = 0;
      let crackleLeft = 0;
      let crackleRight = 0;
      for (const probe of this.probes) {
        const sample = probe.tick(dt, decay, attack, this.cooling);
        crackleLeft += sample.left;
        crackleRight += sample.right;
        if (probe.live && (probe.energy > 0.02 || probe.drive > 1e-4)) {
          const weight = Math.max(probe.energy, 0.02);
          energy += probe.energy;
          motion += probe.motion;
          panMoment += probe.pan * weight;
          panWeight += weight;
          burning++;
        }
      }
      const unit = burning > 0 ? Math.min(1, energy / burning) : 0;
      const brightness = burning > 0 ? motion / burning : 0;
      const roar = this.roar.tick(dt, unit, brightness, this.smoke) * ROAR_GAIN;
      // Equal-power pan from the burning probes' world X. A balanced lattice stays centered.
      const weight = panWeight > 0 ? panMoment / panWeight : 0;
      const angle = ((clampSigned(weight) + 1) * Math.PI) / 4;
      left[i] = Math.tanh((roar * Math.cos(angle) + crackleLeft * CRACKLE_GAIN) * 1.25);
      right[i] = Math.tanh((roar * Math.sin(angle) + crackleRight * CRACKLE_GAIN) * 1.25);
    }
    if (frames < left.length) left.fill(0, frames);
    if (frames < right.length) right.fill(0, frames);
  }

  private audible(): boolean {
    for (const probe of this.probes) {
      if (probe.drive > 1e-6 || probe.energy > 1e-5 || probe.envelope > 1e-5 || probe.impulse > 0)
        return true;
    }
    return false;
  }
}

class ProbeCrackle {
  drive = 0;
  motion = 0;
  pan = 0;
  live = false;
  impulse = 0;
  energy = 0;
  envelope = 0;
  private readonly low: Biquad;
  private readonly mid: Biquad;
  private readonly high: Biquad;
  private readonly envelopeDecay: number;
  private leftGain = Math.SQRT1_2;
  private rightGain = Math.SQRT1_2;
  private tuned = -1;
  private appliedPan = Number.NaN;

  constructor(sampleRate: number) {
    this.low = new Biquad(sampleRate);
    this.mid = new Biquad(sampleRate);
    this.high = new Biquad(sampleRate);
    this.envelopeDecay = Math.exp(-58 / sampleRate);
    this.retune(0);
  }

  tick(
    dt: number,
    decay: number,
    attack: number,
    cooling: number,
  ): { left: number; right: number } {
    if (this.impulse > 0) {
      this.energy = Math.min(1.5, this.energy + this.impulse);
      this.envelope += 0.85 * Math.min(1, this.impulse);
      this.impulse = 0;
    }
    const target = this.drive / cooling;
    if (target >= this.energy) this.energy += (target - this.energy) * attack;
    else this.energy *= decay;
    if (this.energy > 1.5) this.energy = 1.5;
    if (this.energy < 1e-6) this.energy = 0;
    const unit = this.energy > 1 ? 1 : this.energy;
    const rate = CRACKLE_RATE * unit * unit * (0.25 + 0.75 * this.motion);
    if (rate > 0 && Math.random() < 1 - Math.exp(-rate * dt)) {
      this.envelope += 0.35 + 0.65 * Math.random();
    }
    this.envelope *= this.envelopeDecay;
    if (this.envelope < 1e-6) this.envelope = 0;
    if (this.envelope === 0) return { left: 0, right: 0 };
    this.applyPan();
    this.retune(unit);
    const burst = (Math.random() * 2 - 1) * this.envelope;
    const crackle =
      this.low.process(burst) * 0.55 +
      this.mid.process(burst) * 0.9 +
      this.high.process(burst) * 0.42;
    return { left: crackle * this.leftGain, right: crackle * this.rightGain };
  }

  private retune(unit: number): void {
    const bucket = Math.round(unit * 16);
    if (bucket === this.tuned) return;
    this.tuned = bucket;
    const shaped = bucket / 16;
    this.low.setBandpass(280 + 80 * shaped, 0.8);
    this.mid.setBandpass(1500 + 700 * shaped, 3.2);
    this.high.setBandpass(3400 + 900 * shaped, 4.5);
  }

  private applyPan(): void {
    if (this.pan === this.appliedPan) return;
    this.appliedPan = this.pan;
    const angle = ((this.pan + 1) * Math.PI) / 4;
    this.leftGain = Math.cos(angle);
    this.rightGain = Math.sin(angle);
  }
}

/** Leaked-noise roar. Brightness opens the lowpass. Smoke darkens it. */
class RoarBed {
  private readonly sampleRate: number;
  private brown = 0;
  private bed = 0;
  private wobble = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  silence(): void {
    this.brown = 0;
    this.bed = 0;
    this.wobble = 0;
  }

  tick(dt: number, unit: number, brightness: number, smoke: number): number {
    if (unit < 1e-5) {
      this.bed *= 0.99;
      if (Math.abs(this.bed) < 1e-5) this.bed = 0;
      return 0;
    }
    const white = Math.random() * 2 - 1;
    this.brown = this.brown * 0.97 + white * 0.28;
    const open = 0.45 + 0.55 * clamp01(brightness);
    const cutoff = 160 + 1700 * unit * open * (1 - 0.65 * smoke);
    const follow = 1 - Math.exp(-2 * Math.PI * cutoff * dt);
    this.bed += follow * (this.brown - this.bed);
    this.wobble = this.wobble * 0.9992 + white * 0.0015;
    if (this.wobble > 0.35) this.wobble = 0.35;
    else if (this.wobble < -0.35) this.wobble = -0.35;
    const body = 0.45 + 0.55 * (1 - smoke);
    return this.bed * unit * body * (0.82 + this.wobble);
  }
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  if (!(value > 0)) return 0;
  return value > 1 ? 1 : value;
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}
