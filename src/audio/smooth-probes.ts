import type { FieldProbeReading } from './mapping.ts';

/** One-pole time constant. Short enough that a plume step of a few tenths of a second still reads as a sequence. */
const SMOOTH_SECONDS = 0.06;
const STEP_SECONDS = 1 / 60;

/**
 * Smooth heat, speed, and vorticity between GPU maps.
 * `live` is not smoothed: a brick either has a slot or it does not.
 * The first sample snaps, so the onset is not delayed by the filter.
 */
export class ProbeSmoother {
  private readonly heat: number[] = [];
  private readonly speed: number[] = [];
  private readonly vorticity: number[] = [];
  private ready = false;

  /** Drop smoothed state when the lattice is rebuilt, so old cells do not bleed into new ones. */
  reset(): void {
    this.heat.length = 0;
    this.speed.length = 0;
    this.vorticity.length = 0;
    this.ready = false;
  }

  apply(samples: readonly FieldProbeReading[], dt = STEP_SECONDS): FieldProbeReading[] {
    const blend = this.ready ? 1 - Math.exp(-Math.max(0, dt) / SMOOTH_SECONDS) : 1;
    this.ready = true;
    return samples.map((sample, index) => {
      const heat = sample.live ? sample.heat : 0;
      const speed = sample.live ? sample.speed : 0;
      const vorticity = sample.live ? sample.vorticity : 0;
      this.heat[index] = mix(this.heat[index] ?? 0, heat, blend);
      this.speed[index] = mix(this.speed[index] ?? 0, speed, blend);
      this.vorticity[index] = mix(this.vorticity[index] ?? 0, vorticity, blend);
      return {
        heat: this.heat[index],
        speed: this.speed[index],
        vorticity: this.vorticity[index],
        live: sample.live,
      };
    });
  }
}

function mix(from: number, to: number, blend: number): number {
  return from + (to - from) * blend;
}
