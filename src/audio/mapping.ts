import type { FireProbeSample } from './probe.ts';

/** Posted to the worklet at control rate. The worklet does not read the simulation. */
export interface VoiceControls {
  /** Energy added per second. With constant `cooling`, the voice settles at `drive / cooling`. */
  drive: number;
  /** Exponential decay of `systemEnergy`, in 1/s. */
  cooling: number;
  /** 0 to 1. Darkens the roar bed. A smoke-rate proxy, not density. */
  smoke: number;
  /** One-shot energy added on this message, then forgotten. */
  impulse: number;
}

/**
 * Heat proxy that settles at full energy when Level is 1.
 * Campfire's emitter heat is 10 plus `flame.heatRate` 3, so it sits near half.
 * The tornado emitters are hotter and clamp at full.
 */
export const HEAT_REFERENCE = 24;
/** So a cooling of 0 still lets Level 0 die out. */
export const MIN_COOLING = 0.35;
/** `smoke.dissipation` adds this fraction of itself to the decay. */
export const DISSIPATION_DECAY = 0.1;
/** A voxel-budget clip is a level drop. The picture already lost those cells. */
export const GRID_LIMIT_GAIN = 0.55;
/** Burst heat that counts as an impulse of 1. */
export const IMPULSE_REFERENCE = 6;
/** Slider page decay, chosen so returning the slider to zero dies out in about two seconds. */
export const SLIDER_COOLING = 1.6;

function clamp01(value: number): number {
  if (!(value > 0)) return 0;
  return value > 1 ? 1 : value;
}

/** Decay the voice should use for this step. */
export function coolingFromProbe(sample: FireProbeSample): number {
  return Math.max(
    MIN_COOLING,
    sample.cooling + DISSIPATION_DECAY * Math.max(0, sample.dissipation),
  );
}

/**
 * Level is the phase 3 slider, 0 to 1. At 0 the drive is 0 and the voice decays.
 * `includeImpulse` is true only for the step that observed a burst, so a later slider
 * move does not fire the burst again.
 */
export function controlsFromProbe(
  sample: FireProbeSample,
  level: number,
  includeImpulse: boolean,
): VoiceControls {
  const gain = clamp01(level) * (sample.gridLimited ? GRID_LIMIT_GAIN : 1);
  const intensity = clamp01(sample.heat / HEAT_REFERENCE) * gain;
  const cooling = coolingFromProbe(sample);
  return {
    // Settled energy equals `intensity` (drive / cooling).
    drive: intensity * cooling,
    cooling,
    smoke: clamp01(sample.smoke / 4),
    impulse: includeImpulse ? gain * clamp01(sample.impulse / IMPULSE_REFERENCE) : 0,
  };
}

/** The slider page has no simulation. The slider is the settled energy. */
export function controlsFromSlider(level: number): VoiceControls {
  const intensity = clamp01(level);
  return {
    drive: intensity * SLIDER_COOLING,
    cooling: SLIDER_COOLING,
    smoke: 0.15,
    impulse: 0,
  };
}
