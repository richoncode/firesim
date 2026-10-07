import { AUDIO_PROBE_COUNT } from '../engine/audioProbes.ts';

/**
 * Fixed sparse lattice, not a grid sum.
 * 2 probes in X, 4 in Y, 2 in Z. Neighbors are `PROBE_GAP_CELLS` field cells apart
 * (five cells between them), so no two probes share an edge.
 * X and Z straddle the anchor cell by half that gap. Y starts on the anchor's field
 * cell and steps upward. Each probe sits on a cell center, so it does not land on a face.
 * Index is layer-major, then X, then Z. Layer 0 is the emitter. Within a layer the
 * first pair is −X and the second pair is +X, which is also left to right on the HUD.
 */
export const PROBE_COUNT = AUDIO_PROBE_COUNT;
/** Probes across the fire, then across depth. A HUD row is one layer of `PROBE_X * PROBE_Z`. */
export const PROBE_X = 2;
export const PROBE_Z = 2;
export const PROBE_LAYERS = 4;
export const PROBE_PER_LAYER = PROBE_X * PROBE_Z;
export const PROBE_GAP_CELLS = 6;

export interface ProbeSite {
  index: number;
  /** 0 at the emitter, then upward. */
  layer: number;
  /** Field-cell index. */
  cell: readonly [number, number, number];
  /** World meters, cell center. */
  position: [number, number, number];
}

/** Anchor is the emitter base: XZ on the fire, Y at its lowest point. World meters. */
export function probeLattice(
  anchor: readonly [number, number, number],
  voxelSize: number,
): ProbeSite[] {
  if (!(voxelSize > 0) || !Number.isFinite(voxelSize))
    throw new Error('Probe lattice needs a positive voxel size.');
  const cellOf = (axis: number) => Math.floor(anchor[axis] / voxelSize);
  const half = PROBE_GAP_CELLS / 2;
  const xCells = [cellOf(0) - half, cellOf(0) + half];
  const zCells = [cellOf(2) - half, cellOf(2) + half];
  const y0 = cellOf(1);
  const sites: ProbeSite[] = [];
  let index = 0;
  for (let layer = 0; layer < PROBE_LAYERS; layer++) {
    const yCell = y0 + layer * PROBE_GAP_CELLS;
    for (let x = 0; x < PROBE_X; x++) {
      for (let z = 0; z < PROBE_Z; z++) {
        const cell = [xCells[x], yCell, zCells[z]] as const;
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
  if (sites.length !== PROBE_COUNT) throw new Error('Probe lattice did not fill 16 sites.');
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
