import type { FireSimulation } from '../library/FireSimulation.ts';
import type { Emitter } from '../library/handles.ts';
import type { ProbeEmitter, ProbeInput } from './probe.ts';

/** World position of a handle. The simulation itself stays at the identity. */
export function worldPosition(object: {
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
  matrixWorld: { elements: ArrayLike<number> };
}): [number, number, number] {
  object.updateWorldMatrix(true, false);
  const elements = object.matrixWorld.elements;
  return [elements[12], elements[13], elements[14]];
}

/** Read the CPU proxies. Does not touch GPU memory. */
export function probeInputFromSimulation(
  simulation: FireSimulation,
  emitters: readonly Emitter[],
): ProbeInput {
  const options = simulation.getOptions();
  const stats = simulation.stats;
  const sources: ProbeEmitter[] = emitters.map((emitter) => {
    const resolved = emitter.getOptions();
    return {
      active: resolved.active,
      flame: resolved.emission.flame,
      heatRate: resolved.emission.heatRate,
      smokeRate: resolved.emission.smokeRate,
      position: worldPosition(emitter.object),
    };
  });
  return {
    simulationTime: stats.simulationTime,
    droppedTime: stats.droppedTime,
    activeVoxels: stats.activeVoxels,
    gridLimited: stats.gridLimited,
    cooling: options.flame.cooling,
    dissipation: options.smoke.dissipation,
    flameHeatRate: options.flame.heatRate,
    flameSmokeRate: options.flame.smokeRate,
    vorticity: options.motion.vorticity,
    emitters: sources,
  };
}
