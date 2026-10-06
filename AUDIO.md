# FireSim audio, phase 1

Phase 1 of the [FireSim audio plan](https://richoncode.github.io/webartests/experiments/firesimaudio/plan.html) is a field note, not a synth. It lists each signal the later phases may sample, whether that signal is already on the CPU, and whether a probe would be a new GPU reduction or an existing readback. Names below were checked on this branch against `main` of this fork (upstream `dgreenheck/threejs-fire-pro` as of 6 Oct 2026).

There is no audio graph in this phase. The picture is the upstream simulation, unchanged. Later phases add sound beside `simulation.update` and leave the solver's step alone when audio is off.

The simulation is Daniel Greenheck's [Fire Pro](https://github.com/dgreenheck/threejs-fire-pro) (`threejs-fire-pro`), MIT. This fork is `richoncode/firesim`. `LICENSE` is unchanged, and bundled fonts, models, and textures stay under the terms in `THIRD_PARTY_NOTICES.md`.

## What phase 1 does

The voice, when it exists, is Perry Cook's PhISEM shape: a system energy, Poisson crackle whose rate follows that energy, noise bursts with short envelopes, and a few bandpass resonances, plus a continuous roar bed driven by the same energy. Phase 3 builds that voice from a slider. Phase 4 drives it from the fire. This note is the map those phases have to follow, so they sample solver or emitter state and not the framebuffer.

Heat is art-directed. It is a relative quantity that drives buoyancy and ignition, not a kelvin temperature. Rendering `temperature` is a look control. Map heat and density onto energy by ear.

## Where the state lives

| Place | What is public |
| --- | --- |
| `src/library/FireSimulation.ts` | `update(deltaSeconds)`, `stats`, `getOptions()`, `configure()`, `debug({ field, bricks })`, `addEmitter` / `addExplosion` / `addForce` / `addCollider`. The emitter, explosion, force, and collider sets are private. Callers keep the handles `add*` returns. |
| `src/library/handles.ts` | `Emitter.getOptions()`, `object`, `start()`, `stop()`. `Explosion.trigger()` and `getOptions()`. `Force.getOptions()`. |
| `src/library/options.ts` | `DEBUG_FIELDS` and `DEBUG_SCALES`. Flame, smoke, motion, fuel, emission, and burst option names. |
| `src/engine/FluidSimulation.ts` | GPU state. Not exported from `src/index.ts`, and the instance is private on `FireSimulation` (`fluid`). |
| `src/engine/shaders/` | WGSL for advection, forces, scalar transport, combustion, coarse smoke, and the ray-marched volume. |
| `editor/` | React editor, `editor/presets/*.json` (including `campfire.json`), inspector controls for the same options. |
| `examples/playback/` | Loads `simulation.json` and rebuilds emitters, forces, and colliders. The checked-in document is the fire-tornado preset, not campfire. |

`update` runs at most one fixed 1/60 s step (`FIXED_DT` in `src/engine/types.ts`). Extra time is added to `stats.droppedTime` and the fire slows down instead of taking extra steps. `FireSimulation` must stay at the identity transform. It runs in world space, ground at y = 0.

## Scalar and velocity layout

`FluidSimulation.field` is one texture. Channels, from `src/engine/shaders/fluid-common.wgsl` and the field comment on `FluidSimulation`:

| Channel | Quantity |
| --- | --- |
| X | Smoke density when `smokeDivisor` is 1. When `smokeDivisor` is 2 or 4, X stages this step's smoke production. Density then lives on `FluidSimulation.smoke` (separate R16F pools). `smoke.wgsl` averages that production onto the coarse grid. |
| Y | Heat. Relative, empty unit. |
| Z | Normalized remaining flame lifetime, 0 to 1. |
| W | Fuel. |

`velocity` is its own texture. Cells are `velocityDivisor` times the field cell (1, 2, or 4). Pressure and divergence are solver buffers on that coarser grid. `expansionRate` is the flame's target divergence, on the field grid.

Vorticity confinement runs `computeCurl` only when `motion.vorticity` is non-zero. The curl is written into a texture the rest of the step reuses (`auxiliary` in `fluid-common.wgsl`, then swapped). It is not a stable field. The debug view does not read it. `scene-volume.wgsl` recomputes a curl magnitude from `velocity` while the vorticity view is on.

The campfire preset uses `smokeDivisor: 2`, so a probe of `field.x` on that preset is production, not the smoke the picture shows.

## Debug views are not a readback

`DEBUG_FIELDS` matches the plan: `beauty`, `lifetime`, `heat`, `smoke`, `velocity`, `flame`, `fuel`, `vorticity`, `expansion`, `pressure`, `divergence`. Velocity and vorticity views show magnitudes. Scales in `DEBUG_SCALES`:

| View | Range | Unit |
| --- | --- | --- |
| heat | 0–4 | empty |
| smoke | 0–1 | empty |
| velocity | 0–4 | m/s |
| vorticity | 0–50 | 1/s |
| expansion | 0–5 | 1/s |
| pressure | −0.5–0.5 | empty |
| divergence | −10–10 | 1/s |
| lifetime, flame | 0–1 | empty |
| fuel | 0–2 | empty |

These views replace the picture with a colormap (`scene-volume.wgsl`). Sampling the canvas samples the legend. Pressure and divergence are copied into `solverFieldTexture` only while that debug view is selected (`showSolverField`). That copy is still a GPU texture, not a CPU buffer.

## Readbacks that already exist

**Activity, every step.** At the end of `FluidSimulation.substep`, a small buffer is filled with `copyBufferToBuffer` and mapped with `mapAsync(READ)` in `readActivity`. The copy is the active brick count (4 bytes), pool free-slot count and allocation failures (8 bytes from `poolState`), and one activity flag per tile. Several of these buffers can be in flight (up to eight are kept). The plan's "pool pressure" is this occupancy (free slots and failures), not the fluid pressure field.

`stats.activeVoxels` is `activeBrickCount * brickSize³`: cells in bricks the solver computed, not an integral of heat or smoke. `stats.gridLimited` is the latest `poolLimited` flag (failures while the pool is at its slot limit). Both update when the map completes, so on the frame that just called `update` they still describe an earlier step.

**Bricks, when the outline is on.** `FireSimulation.refreshBricks` calls `FluidSimulation.readBricks` only if the brick view is visible, 250 ms have passed, and no read is in flight. The result is world-space boxes of allocated bricks, for the line overlay. It is not a scalar sample. The 250 ms, one-in-flight gate is the known-safe cadence if a later probe moves the frame time.

**Scene lights, when lighting is on.** `SceneLights` reduces rendered flame emission on the GPU (a 4³ sample per active brick in `scene-lights.wgsl`) and reads a small buffer back, one map in flight, deferring if one is pending. Each anchor's light is placed at the centroid of the emission assigned to it. That reduction is look-dependent (`temperature`, `brightness`, `opacity`) and exists to light surfaces. The plan says not to drive the synth from lights or the framebuffer. Copy the shape (one small buffer, at most one map in flight) if a real probe is required. Do not reuse the totals as energy.

`lightAnchors()` on `FireSimulation` is private. It lists every emitter's world position, plus an anchor for each explosion that is still lighting the scene. The positions are not weighted. The host already has those transforms on the handles it created.

A full `field` or `velocity` texture mapped every frame is the expensive read. Phase 5 is where that would be rejected. Do not add it.

## Candidate signals

| Signal | Where it is on this branch | Already on the CPU? | Probe |
| --- | --- | --- | --- |
| Heat | `field` Y. CPU proxies: emitter `emission.heatRate`, explosion `charge.heat`, and `flame.heatRate` (production of existing flame, not the field). | The rates and the charge are. The field is not. | None for the proxies. A mean or max of `field` Y over active bricks would be a new reduction. |
| Smoke density | `field` X when `smokeDivisor` is 1. Otherwise `FluidSimulation.smoke`. CPU proxies: `emission.smokeRate`, `flame.smokeRate`, `smoke.dissipation`. | The rates and dissipation are. Density is not. | New reduction for the density. Check `smokeDivisor` before reading X. |
| Speed | `velocity`. Debug view is the magnitude, m/s. | No. | New reduction (magnitude inside the flame). No existing readback. |
| Vorticity | Recomputed from `velocity` for the debug view. The confinement coefficient `motion.vorticity` is on the CPU. The curl buffer does not survive the step. | The coefficient is. The magnitude is not. | New reduction from velocity. The coefficient alone cannot stand in for roughness of the flow. |
| Cooling | `getOptions().flame.cooling` (1/s). Partner: `getOptions().smoke.dissipation`. | Yes. | None. |
| Burst | `Explosion.trigger()` queues a private `pending` event. `step` injects it as a one-step source (`charge.heat / FIXED_DT` and the same for smoke and fuel) and clears the queue. | Yes, at the call. There is no listener. | None if the host that calls `trigger` also notes the impulse. A callback inside `step` would be new, and still CPU. |
| Grid health | `stats.simulationTime`, `stats.droppedTime`, `stats.estimatedMemoryBytes` update on the call. `stats.activeVoxels` and `stats.gridLimited` lag by the activity map. | Yes. | None. The activity readback is the existing one. |
| Emitter position | `Emitter.object` world matrix. `lightAnchors()` gathers the same positions and does not weight them. | Yes, on the handles the host holds. | None. A centroid is the emission-weighted average of those positions, on the CPU. |

Force options (`wind`, `turbulence`, `vortex`, `radial`) are also on the CPU through `Force.getOptions()`. They are not in the plan's signal map. Turbulence strength is not vorticity magnitude.

Rendering and lighting options (`brightness`, `opacity`, `temperature`, `color`, `illuminateScene`, `intensity`) change the picture and the scene lights. They do not change the solver. Leave them out of energy, gain, and crackle rate.

## How parameters map to sound

Nothing in this phase makes sound. The mapping the later voice should use, from the plan, with the reach from the table above:

| Sim signal | Synth control |
| --- | --- |
| Heat (field, or the CPU heat rates until a reduction exists) | Energy in, and the level of the roar bed. |
| Smoke density | Body of the bed. Optional darker resonances. Dissipation is not density. |
| Speed, and vorticity magnitude | Crackle event rate. Vorticity magnitude also roughens the events. |
| `flame.cooling`, with `smoke.dissipation` | How fast `systemEnergy` decays when the fire is quiet. |
| `Explosion.trigger()` | One impulse on the audio block that covers that step. |
| `stats.activeVoxels`, `stats.gridLimited`, `stats.droppedTime` | Level. Hold the last probes while `droppedTime` is climbing, and let energy decay. A budget clip (`gridLimited`) is a discontinuity and should be audible as a level change. |

CPU proxies are enough to start phase 2. They do not see heat that has left the emitter and is cooling in the plume, or speed inside the flame. Those two are the signals a reduction is for, and only if the proxies are not enough to listen to. The first listening target is `editor/presets/campfire.json`: one disk emitter at `[0, 0.27, 0]`, `emission.heatRate` 10, `flame.heatRate` 3, `flame.cooling` 0.62, `smoke.dissipation` 0.94, `motion.vorticity` 3.2, fuel disabled, `smokeDivisor` 2.

The editor inspector already exposes these as Flame, Smoke, Fuel, and emitter emission controls. They are not wired to audio. The editor is the wrong first host. `examples/playback` already calls `simulation.update` and then renders. That call is the seam.

## Seam for later phases

Phase 2 adds a probe object beside the playback loop, updated once per simulated step, and logs it. No audio yet.

```text
examples/playback/main.ts
  simulation.update(delta)
  if stats.simulationTime advanced by FIXED_DT:
    probe.capture(public CPU state)   // phase 2
    post probe to the worklet         // phase 4, control rate
  renderer.render(...)
```

`stats.simulationTime` advances by `FIXED_DT` only when a step ran, so a short frame that does not step does not invent a probe. Build the probe from public state:

- `simulation.stats`
- `simulation.getOptions()` for cooling, dissipation, `smokeDivisor`, fuel, and `motion.vorticity`
- each `Emitter.getOptions()` plus `emitter.object` world position
- the `Explosion.trigger()` the example already uses for Space (record the impulse there)

`FluidSimulation` stays private. A GPU reduction, if phase 2 needs one, is a new small buffer inside `FireSimulation` / `FluidSimulation`: `copyBufferToBuffer`, `mapAsync(READ)`, at most one map in flight, mean or max over active bricks. Not a map of `field`. The worklet in phase 3 does not read GPU memory. The main thread posts controls.

When audio is added, off or muted must skip the graph's output and must not change `update`, the solver, or the picture. This phase has no graph, so that is already true.

## What is next

Do these in order. Each one stops before the next.

1. **Phase 2, probe layer.** A probe object once per simulated step, CPU proxies first, logged. No audio.
2. **Phase 3, PhISEM-lite.** A gesture resumes `AudioContext`. `systemEnergy` decays per audio block. Poisson events, noise bursts, two to four bandpasses. A slider drives it and silence returns when the slider is zero.
3. **Phase 4, playback.** Point `examples/playback` at an export of the campfire preset, not the checked-in fire-tornado document. Copy probes in after `update`. HUD for energy, crackle rate, cooling, last impulse, `activeVoxels`, `droppedTime`, `gridLimited`. Mute zeros the voice and leaves the sim running.
4. **Phase 5, frame time.** Record `droppedTime` and frame time with probes off, then on. Drop to the 250 ms brick cadence, or drop the GPU reduction, if the frame moves.
5. **Phases 6 and 7** only after the campfire is listenable and the phase 5 note exists. Panning uses the phase 2 centroid. A PR to `dgreenheck/threejs-fire-pro` waits on that, and only if the branch is still MIT and free of unrelated editor churn.
