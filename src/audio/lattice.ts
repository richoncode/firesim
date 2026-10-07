import { AUDIO_PROBE_COUNT, AUDIO_PROBE_MAX, AUDIO_PROBE_MIN } from '../engine/audioProbes.ts';

/**
 * Sparse lattice, not a grid sum.
 * The default is 2×4×2. `latticeShape` changes X, Y, and Z with the probe count:
 * a multiple of 4 is 2 × (count/4) × 2, an even count is 2 × (count/2) × 1, and an
 * odd count is one vertical line. Extra probes go up the plume, not out into empty air.
 * Neighbors are `spacingCells` field cells apart (at least 2, so they never share an edge).
 * X and Z straddle the anchor when that axis has two probes. Y starts on the anchor's
 * field cell and steps upward. Each probe sits on a cell center.
 * Index is layer-major, then X, then Z. Layer 0 is the emitter. Within a layer the
 * first probes are −X, which is also left to right on the HUD.
 */
export const PROBE_COUNT = AUDIO_PROBE_COUNT;
export const PROBE_COUNT_MIN = AUDIO_PROBE_MIN;
export const PROBE_COUNT_MAX = AUDIO_PROBE_MAX;
/** Center-to-center gap. 2 is the closest pair that is still non-adjacent. */
export const PROBE_SPACING_MIN = 2;
export const PROBE_SPACING_MAX = 16;
export const PROBE_SPACING_DEFAULT = 6;
/** Probes across the fire, then across depth, for the default count and spacing. */
export const PROBE_X = 2;
export const PROBE_Z = 2;
export const PROBE_LAYERS = 4;
export const PROBE_PER_LAYER = PROBE_X * PROBE_Z;
export const PROBE_GAP_CELLS = PROBE_SPACING_DEFAULT;

export interface LatticeShape {
  x: number;
  y: number;
  z: number;
}

export interface ProbeSite {
  index: number;
  /** 0 at the emitter, then upward. */
  layer: number;
  /** Field-cell index. */
  cell: readonly [number, number, number];
  /** World meters, cell center. */
  position: [number, number, number];
}

/** How a probe count splits across X, Y, and Z. Count is clamped to 4–32. */
export function latticeShape(count: number): LatticeShape {
  const n = clampInt(count, PROBE_COUNT_MIN, PROBE_COUNT_MAX);
  if (n % 4 === 0) return { x: 2, y: n / 4, z: 2 };
  if (n % 2 === 0) return { x: 2, y: n / 2, z: 1 };
  return { x: 1, y: n, z: 1 };
}

/** "2×4×2, 18 cells up" for the experiment panel. */
export function formatLatticeShape(shape: LatticeShape, spacingCells: number): string {
  const spacing = clampInt(spacingCells, PROBE_SPACING_MIN, PROBE_SPACING_MAX);
  const rise = (shape.y - 1) * spacing;
  return `${shape.x}×${shape.y}×${shape.z}, ${rise} cells up`;
}

/** Anchor is the emitter base: XZ on the fire, Y at its lowest point. World meters. */
export function probeLattice(
  anchor: readonly [number, number, number],
  voxelSize: number,
  options?: { count?: number; spacingCells?: number },
): ProbeSite[] {
  if (!(voxelSize > 0) || !Number.isFinite(voxelSize))
    throw new Error('Probe lattice needs a positive voxel size.');
  const shape = latticeShape(options?.count ?? PROBE_COUNT);
  const spacing = clampInt(
    options?.spacingCells ?? PROBE_SPACING_DEFAULT,
    PROBE_SPACING_MIN,
    PROBE_SPACING_MAX,
  );
  const cellOf = (axis: number) => Math.floor(anchor[axis] / voxelSize);
  const xCells = spread(cellOf(0), shape.x, spacing);
  const zCells = spread(cellOf(2), shape.z, spacing);
  const y0 = cellOf(1);
  const sites: ProbeSite[] = [];
  let index = 0;
  for (let layer = 0; layer < shape.y; layer++) {
    const yCell = y0 + layer * spacing;
    for (const xCell of xCells) {
      for (const zCell of zCells) {
        const cell = [xCell, yCell, zCell] as const;
        sites.push({
          index,
          layer,
          cell,
          position: cell.map((value) => (value + 0.5) * voxelSize) as [number, number, number],
        });
        index++;
      }
    }
  }
  if (sites.length !== shape.x * shape.y * shape.z)
    throw new Error('Probe lattice did not fill its shape.');
  return sites;
}

/** Emission-weighted XZ, and the lowest active emitter's Y. Fixed for the page. */
export function latticeAnchor(
  emitters: readonly {
    active: boolean;
    heat: number;
    position: readonly [number, number, number];
  }[],
): [number, number, number] {
  let x = 0;
  let z = 0;
  let weight = 0;
  let y = Infinity;
  let count = 0;
  for (const emitter of emitters) {
    if (!emitter.position.every(Number.isFinite)) continue;
    const contribution = emitter.active && emitter.heat > 0 ? emitter.heat : 1;
    x += emitter.position[0] * contribution;
    z += emitter.position[2] * contribution;
    weight += contribution;
    y = Math.min(y, emitter.position[1]);
    count++;
  }
  if (count === 0 || !(weight > 0) || !Number.isFinite(y)) return [0, 0, 0];
  return [x / weight, y, z / weight];
}

/** Two probes sit `spacing` cells apart, straddling the anchor. One probe sits on it. */
function spread(anchorCell: number, count: number, spacing: number): number[] {
  if (count <= 1) return [anchorCell];
  const left = anchorCell - Math.floor(spacing / 2);
  return [left, left + spacing];
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return min;
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}
