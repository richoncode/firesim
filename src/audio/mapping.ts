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

/**
 * Field heat that counts as full local energy. The heat debug view spans 0–4,
 * and a campfire cell sits in the lower part of that, so 2 is hot without clamping every sample.
 */
export const FIELD_HEAT_REFERENCE = 2;
/** Debug velocity scale, m/s. */
export const SPEED_REFERENCE = 4;
/** Debug vorticity scale, 1/s. */
export const VORTICITY_REFERENCE = 50;
/** World X, in meters, that pans a probe hard left or right. */
export const PAN_REFERENCE = 0.6;
/** Unsmoothed heat rise, in field units, that counts as a crackle impulse. */
export const HEAT_JUMP = 0.35;
/** A rise of this many field units is an impulse of 1. */
export const HEAT_JUMP_REFERENCE = 1.5;

/** One sparse probe, already read back. Structurally the simulation's `AudioFieldSample`. */
export interface FieldProbeReading {
  heat: number;
  speed: number;
  vorticity: number;
  live: boolean;
}

export interface ProbeVoiceControl {
  drive: number;
  /** 0 to 1. Speed and vorticity. Raises the crackle rate and opens the roar. */
  motion: number;
  impulse: number;
  /** −1 is left, +1 is right, from world X. */
  pan: number;
  live: boolean;
}

export interface PlumeControls {
  probes: ProbeVoiceControl[];
  cooling: number;
  smoke: number;
}

/**
 * Smoothed heat, speed, and vorticity drive each probe. Impulses use the unsmoothed
 * heat rise, and only when `includeImpulse` is set, so a Level move does not repeat one.
 * The first reading has no previous sample, so it does not impulse.
 * Level 0 forces every drive and impulse to 0.
 */
export function controlsFromField(
  heard: readonly FieldProbeReading[],
  jumps: readonly FieldProbeReading[],
  previousJumps: readonly FieldProbeReading[] | null,
  positions: readonly (readonly [number, number, number])[],
  level: number,
  cooling: number,
  smoke: number,
  gridLimited: boolean,
  includeImpulse: boolean,
): PlumeControls {
  const count = heard.length;
  if (jumps.length !== count || positions.length !== count)
    throw new Error('Probe controls need one position per reading.');
  const gain = clamp01(level) * (gridLimited ? GRID_LIMIT_GAIN : 1);
  const decay = Math.max(0.05, cooling);
  const probes: ProbeVoiceControl[] = [];
  for (let i = 0; i < count; i++) {
    const reading = heard[i];
    const live = jumps[i].live;
    const intensity = clamp01(reading.heat / FIELD_HEAT_REFERENCE) * gain;
    const speed = clamp01(reading.speed / SPEED_REFERENCE);
    const swirl = clamp01(reading.vorticity / VORTICITY_REFERENCE);
    let impulse = 0;
    if (includeImpulse && previousJumps && live && previousJumps[i].live) {
      const rise = jumps[i].heat - previousJumps[i].heat;
      if (rise > HEAT_JUMP) impulse = gain * clamp01(rise / HEAT_JUMP_REFERENCE);
    }
    probes.push({
      drive: live ? intensity * decay : 0,
      motion: clamp01(0.35 * speed + 0.65 * swirl),
      impulse,
      pan: clampSigned(positions[i][0] / PAN_REFERENCE),
      live,
    });
  }
  return { probes, cooling: decay, smoke: clamp01(smoke) };
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
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
