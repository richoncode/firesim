/** One emitter's CPU controls, in world meters. No solver fields. */
export interface ProbeEmitter {
  active: boolean;
  /** Normalized flame lifetime the emitter supplies, 0 to 1. */
  flame: number;
  heatRate: number;
  smokeRate: number;
  position: readonly [number, number, number];
}

/** Everything the probe can see without a GPU read. */
export interface ProbeInput {
  simulationTime: number;
  droppedTime: number;
  activeVoxels: number;
  gridLimited: boolean;
  /** `flame.cooling`, 1/s. */
  cooling: number;
  /** `smoke.dissipation`, 1/s. */
  dissipation: number;
  /** Heat the existing flame produces, added once while any emitter is lighting flame. */
  flameHeatRate: number;
  flameSmokeRate: number;
  /** `motion.vorticity`, the confinement coefficient, not a curl magnitude. */
  vorticity: number;
  emitters: readonly ProbeEmitter[];
}

/** CPU proxies for one simulated step. Speed and vorticity magnitude are not here. */
export interface FireProbeSample {
  simulationTime: number;
  droppedTime: number;
  /** `droppedTime` gained on this step. Whole steps the solver skipped. */
  droppedThisStep: number;
  activeVoxels: number;
  gridLimited: boolean;
  /**
   * Active `emission.heatRate * flame`, plus `flame.heatRate` while any emitter is lighting
   * flame. Relative heat per second, not the plume.
   */
  heat: number;
  /**
   * Active `emission.smokeRate`, plus `flame.smokeRate` while any emitter is lighting flame.
   * A rate, not smoke density.
   */
  smoke: number;
  cooling: number;
  dissipation: number;
  vorticity: number;
  /** Burst heat noted since the previous sample. */
  impulse: number;
  /** Emission-weighted emitter positions, with this step's burst mixed in by its heat. */
  centroid: [number, number, number];
  activeEmitters: number;
}

/**
 * Samples public simulation controls once per simulated step.
 * Call `noteImpulse` when something calls `Explosion.trigger`, then `capture` after
 * `simulation.update`. A frame that does not step returns null and holds the last sample.
 */
export class FireAudioProbe {
  latest: FireProbeSample | null = null;
  private previousTime = -1;
  private previousDropped = 0;
  private impulseHeat = 0;
  private impulseMoment: [number, number, number] = [0, 0, 0];
  private impulseWeight = 0;

  /** A burst's charge heat. Position is the explosion's world position, if you have it. */
  noteImpulse(heat: number, position?: readonly [number, number, number]): void {
    if (!(heat > 0) || !Number.isFinite(heat)) return;
    this.impulseHeat += heat;
    if (!position || !position.every(Number.isFinite)) return;
    this.impulseMoment[0] += position[0] * heat;
    this.impulseMoment[1] += position[1] * heat;
    this.impulseMoment[2] += position[2] * heat;
    this.impulseWeight += heat;
  }

  /**
   * Returns a sample when `simulationTime` has moved forward since the last call.
   * A reset (time going backwards) waits for the next step before sampling again.
   */
  capture(input: ProbeInput): FireProbeSample | null {
    if (this.previousTime >= 0 && input.simulationTime + 1e-8 < this.previousTime) {
      this.previousTime = -1;
      this.previousDropped = 0;
      this.latest = null;
    }
    if (this.previousTime < 0) {
      if (!(input.simulationTime > 0)) return null;
    } else if (input.simulationTime <= this.previousTime + 1e-8) {
      return null;
    }

    const droppedThisStep = Math.max(
      0,
      input.droppedTime - (this.previousTime < 0 ? 0 : this.previousDropped),
    );
    const measured = measureEmitters(input.emitters);
    const impulse = this.impulseHeat;
    const weight = measured.weight + this.impulseWeight;
    const centroid: [number, number, number] =
      weight > 0
        ? [
            (measured.moment[0] + this.impulseMoment[0]) / weight,
            (measured.moment[1] + this.impulseMoment[1]) / weight,
            (measured.moment[2] + this.impulseMoment[2]) / weight,
          ]
        : [0, 0, 0];
    const sample: FireProbeSample = {
      simulationTime: input.simulationTime,
      droppedTime: input.droppedTime,
      droppedThisStep,
      activeVoxels: input.activeVoxels,
      gridLimited: input.gridLimited,
      heat: measured.heat + (measured.anyFlame ? input.flameHeatRate : 0),
      smoke: measured.smoke + (measured.anyFlame ? input.flameSmokeRate : 0),
      cooling: input.cooling,
      dissipation: input.dissipation,
      vorticity: input.vorticity,
      impulse,
      centroid,
      activeEmitters: measured.activeEmitters,
    };
    this.previousTime = input.simulationTime;
    this.previousDropped = input.droppedTime;
    this.impulseHeat = 0;
    this.impulseMoment = [0, 0, 0];
    this.impulseWeight = 0;
    this.latest = sample;
    return sample;
  }
}

/** One console line. Pass `?probe=1` on the playback page, or turn on Log probe. */
export function formatProbeSample(sample: FireProbeSample): string {
  const [x, y, z] = sample.centroid;
  const n = (value: number) => value.toFixed(2);
  return [
    '[fire-probe]',
    `t=${n(sample.simulationTime)}`,
    `heat=${n(sample.heat)}`,
    `smoke=${n(sample.smoke)}`,
    `cooling=${n(sample.cooling)}`,
    `dissipation=${n(sample.dissipation)}`,
    `vorticity=${n(sample.vorticity)}`,
    `impulse=${n(sample.impulse)}`,
    `voxels=${sample.activeVoxels}`,
    `gridLimited=${sample.gridLimited}`,
    `dropped=${sample.droppedThisStep.toFixed(3)}`,
    `centroid=(${n(x)}, ${n(y)}, ${n(z)})`,
  ].join(' ');
}

function measureEmitters(emitters: readonly ProbeEmitter[]): {
  heat: number;
  smoke: number;
  anyFlame: boolean;
  activeEmitters: number;
  weight: number;
  moment: [number, number, number];
} {
  let heat = 0;
  let smoke = 0;
  let anyFlame = false;
  let activeEmitters = 0;
  let weight = 0;
  const moment: [number, number, number] = [0, 0, 0];
  for (const emitter of emitters) {
    if (!emitter.active) continue;
    activeEmitters += 1;
    const flame = Math.max(0, emitter.flame);
    const heatRate = Math.max(0, emitter.heatRate);
    const smokeRate = Math.max(0, emitter.smokeRate);
    heat += heatRate * flame;
    smoke += smokeRate;
    if (flame > 0) anyFlame = true;
    // Flame still marks the place when the emitter is not adding heat or smoke.
    const contribution = heatRate * flame + smokeRate + flame;
    if (!(contribution > 0) || !emitter.position.every(Number.isFinite)) continue;
    weight += contribution;
    moment[0] += emitter.position[0] * contribution;
    moment[1] += emitter.position[1] * contribution;
    moment[2] += emitter.position[2] * contribution;
  }
  return { heat, smoke, anyFlame, activeEmitters, weight, moment };
}
