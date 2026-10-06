# FireSim audio

Phases 1–3 of the [FireSim audio plan](https://richoncode.github.io/webartests/experiments/firesimaudio/plan.html) are on this branch. Phase 1, further down, is the field note: each signal, whether it is already on the CPU, and whether a probe would be a new GPU reduction or an existing readback. Names were checked on this branch against `main` of this fork (upstream `dgreenheck/threejs-fire-pro` as of 6 Oct 2026).

The solver and the picture are the upstream simulation. The voice is a separate Web Audio graph beside `simulation.update`. It stays silent until a click or the U key. Mute only zeros its gain.

The simulation is Daniel Greenheck's [Fire Pro](https://github.com/dgreenheck/threejs-fire-pro) (`threejs-fire-pro`), MIT. This fork is `richoncode/firesim`. `LICENSE` is unchanged, and bundled fonts, models, and textures stay under the terms in `THIRD_PARTY_NOTICES.md`.

## How to hear it

No sampled fire recordings. The editor does not run the voice.

```sh
npm install
npm run dev
```

**Slider, no simulation.** Open <http://127.0.0.1:5173/examples/audio/>. Click **Unmute** or press **U**. **Level** is the energy. Leave it up for a roar plus crackle. Return it to zero and both die out over a few seconds. Mute cuts the output at once and leaves the page up. This is the phase 3 stop line: silent until the gesture, and the slider back at zero lets the crackle die.

**Driven by the simulation.** Open <http://127.0.0.1:5173/examples/playback/>. The checked-in document is the **Fire tornado** preset (`examples/playback/simulation.json`), not campfire. Unmute, then **Level** scales the CPU heat proxy. Zero level stops adding energy and the crackle dies out at the fire's cooling rate. Space still detonates bursts; that charge is an impulse on the voice. Check **Log probe**, or open the page with `?probe=1`, for one console line per simulated step.

After `npm run build`, `npm run preview` serves the same paths. This fork does not have GitHub Pages turned on, so that local server is the preview. Campfire as the playback document, and a numbers HUD, are phase 4.

## Phase 2 · probe

`FireAudioProbe` (`src/audio/probe.ts`) updates once per simulated step, next to `simulation.update` in `examples/playback/main.ts`. A frame that does not step returns null and keeps the last sample. `?probe=1` or **Log probe** prints it. The probe does not start audio.

It reads public CPU state only. There is no GPU reduction. Speed and vorticity magnitude are still not on the CPU, so they are not in the sample. `vorticity` in the log is the confinement coefficient `motion.vorticity`.

| Field                                            | Source                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `heat`                                           | Sum of active `emission.heatRate * flame`, plus `flame.heatRate` while any emitter is lighting flame. |
| `smoke`                                          | Sum of active `emission.smokeRate`, plus `flame.smokeRate` in that same case. A rate, not density.    |
| `cooling`, `dissipation`                         | `getOptions().flame.cooling` and `smoke.dissipation`.                                                 |
| `impulse`                                        | `Explosion.trigger` charge heat noted by the playback page since the previous sample.                 |
| `centroid`                                       | Emission-weighted emitter positions, with the burst mixed in by its heat. Not used for panning yet.   |
| `activeVoxels`, `gridLimited`, `droppedThisStep` | `simulation.stats`. The voxel fields still lag by the activity readback.                              |

`src/audio/from-simulation.ts` is the adapter. The probe class itself does not import the solver.

## Phase 3 · voice

`PhisemVoice` (`src/audio/phisem.ts`) runs in an AudioWorklet (`src/audio/fire-voice-processor.ts`, built to `public/audio/fire-voice-processor.js` by `npm run build:worklet`). The main thread posts controls. The worklet does not read GPU memory.

Each sample, on the audio clock:

1. `systemEnergy` decays by `exp(-cooling / sampleRate)` and then adds `drive / sampleRate`.
2. Collision times are Poisson with rate `70 * unit²` events per second, where `unit` is `systemEnergy` clamped to 0–1.
3. Each collision adds to a short noise envelope (about 20 ms). Three bandpasses color it, around 300 Hz, 1.5–2.2 kHz, and 3.4–4.3 kHz. They brighten a little as energy rises.
4. A leaked noise, low-passed, follows the same energy. That is the roar. Smoke darkens it. Both the roar and the crackle go silent once energy and the envelope have decayed and `drive` is zero.

`FireVoice` creates the `AudioContext` inside the unmute click or the U key, before any await. Mute sets the output gain to 0. The simulation loop does not look at that gain.

The slider page posts `controlsFromSlider`: settled energy equals Level, and the decay is 1.6/s.

Playback posts `controlsFromProbe` (`src/audio/mapping.ts`) after each new sample, and again when Level moves (without repeating the burst):

| Posted control | Formula                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settled energy | `Level * clamp(heat / 24, 0, 1)`, times 0.55 when `gridLimited`. `drive` is that value times the decay, so the voice settles there.                            |
| Decay          | `max(0.35, cooling + 0.1 * dissipation)` per second. The floor is so Level 0 still dies out if cooling is 0.                                                   |
| Smoke          | `clamp(smoke / 4, 0, 1)` darkens the bed.                                                                                                                      |
| Impulse        | On the step that saw a burst, `Level * clamp(impulse / 6, 0, 1)` is added to `systemEnergy` once and pops the envelope. The 0.55 grid factor applies here too. |

Level 0 forces `drive` and the impulse to 0. Energy then decays. That is the phase 3 stop line on both pages.

While `droppedTime` climbs, playback still posts only the step that ran, and the worklet holds the last controls between posts. It does not invent steps.

## Phase 1 · field note

Heat is art-directed. It is a relative quantity that drives buoyancy and ignition, not a kelvin temperature. Rendering `temperature` is a look control. Map heat and density onto energy by ear. The rest of this note is the phase 1 map the probe and the voice followed.

## Where the state lives

| Place                           | What is public                                                                                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/library/FireSimulation.ts` | `update(deltaSeconds)`, `stats`, `getOptions()`, `configure()`, `debug({ field, bricks })`, `addEmitter` / `addExplosion` / `addForce` / `addCollider`. The emitter, explosion, force, and collider sets are private. Callers keep the handles `add*` returns. |
| `src/library/handles.ts`        | `Emitter.getOptions()`, `object`, `start()`, `stop()`. `Explosion.trigger()` and `getOptions()`. `Force.getOptions()`.                                                                                                                                         |
| `src/library/options.ts`        | `DEBUG_FIELDS` and `DEBUG_SCALES`. Flame, smoke, motion, fuel, emission, and burst option names.                                                                                                                                                               |
| `src/engine/FluidSimulation.ts` | GPU state. Not exported from `src/index.ts`, and the instance is private on `FireSimulation` (`fluid`).                                                                                                                                                        |
| `src/engine/shaders/`           | WGSL for advection, forces, scalar transport, combustion, coarse smoke, and the ray-marched volume.                                                                                                                                                            |
| `editor/`                       | React editor, `editor/presets/*.json` (including `campfire.json`), inspector controls for the same options.                                                                                                                                                    |
| `examples/playback/`            | Loads `simulation.json` and rebuilds emitters, forces, and colliders. The checked-in document is the fire-tornado preset, not campfire.                                                                                                                        |

`update` runs at most one fixed 1/60 s step (`FIXED_DT` in `src/engine/types.ts`). Extra time is added to `stats.droppedTime` and the fire slows down instead of taking extra steps. `FireSimulation` must stay at the identity transform. It runs in world space, ground at y = 0.

## Scalar and velocity layout

`FluidSimulation.field` is one texture. Channels, from `src/engine/shaders/fluid-common.wgsl` and the field comment on `FluidSimulation`:

| Channel | Quantity                                                                                                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X       | Smoke density when `smokeDivisor` is 1. When `smokeDivisor` is 2 or 4, X stages this step's smoke production. Density then lives on `FluidSimulation.smoke` (separate R16F pools). `smoke.wgsl` averages that production onto the coarse grid. |
| Y       | Heat. Relative, empty unit.                                                                                                                                                                                                                    |
| Z       | Normalized remaining flame lifetime, 0 to 1.                                                                                                                                                                                                   |
| W       | Fuel.                                                                                                                                                                                                                                          |

`velocity` is its own texture. Cells are `velocityDivisor` times the field cell (1, 2, or 4). Pressure and divergence are solver buffers on that coarser grid. `expansionRate` is the flame's target divergence, on the field grid.

Vorticity confinement runs `computeCurl` only when `motion.vorticity` is non-zero. The curl is written into a texture the rest of the step reuses (`auxiliary` in `fluid-common.wgsl`, then swapped). It is not a stable field. The debug view does not read it. `scene-volume.wgsl` recomputes a curl magnitude from `velocity` while the vorticity view is on.

The campfire preset uses `smokeDivisor: 2`, so a probe of `field.x` on that preset is production, not the smoke the picture shows.

## Debug views are not a readback

`DEBUG_FIELDS` matches the plan: `beauty`, `lifetime`, `heat`, `smoke`, `velocity`, `flame`, `fuel`, `vorticity`, `expansion`, `pressure`, `divergence`. Velocity and vorticity views show magnitudes. Scales in `DEBUG_SCALES`:

| View            | Range    | Unit  |
| --------------- | -------- | ----- |
| heat            | 0–4      | empty |
| smoke           | 0–1      | empty |
| velocity        | 0–4      | m/s   |
| vorticity       | 0–50     | 1/s   |
| expansion       | 0–5      | 1/s   |
| pressure        | −0.5–0.5 | empty |
| divergence      | −10–10   | 1/s   |
| lifetime, flame | 0–1      | empty |
| fuel            | 0–2      | empty |

These views replace the picture with a colormap (`scene-volume.wgsl`). Sampling the canvas samples the legend. Pressure and divergence are copied into `solverFieldTexture` only while that debug view is selected (`showSolverField`). That copy is still a GPU texture, not a CPU buffer.

## Readbacks that already exist

**Activity, every step.** At the end of `FluidSimulation.substep`, a small buffer is filled with `copyBufferToBuffer` and mapped with `mapAsync(READ)` in `readActivity`. The copy is the active brick count (4 bytes), pool free-slot count and allocation failures (8 bytes from `poolState`), and one activity flag per tile. Several of these buffers can be in flight (up to eight are kept). The plan's "pool pressure" is this occupancy (free slots and failures), not the fluid pressure field.

`stats.activeVoxels` is `activeBrickCount * brickSize³`: cells in bricks the solver computed, not an integral of heat or smoke. `stats.gridLimited` is the latest `poolLimited` flag (failures while the pool is at its slot limit). Both update when the map completes, so on the frame that just called `update` they still describe an earlier step.

**Bricks, when the outline is on.** `FireSimulation.refreshBricks` calls `FluidSimulation.readBricks` only if the brick view is visible, 250 ms have passed, and no read is in flight. The result is world-space boxes of allocated bricks, for the line overlay. It is not a scalar sample. The 250 ms, one-in-flight gate is the known-safe cadence if a later probe moves the frame time.

**Scene lights, when lighting is on.** `SceneLights` reduces rendered flame emission on the GPU (a 4³ sample per active brick in `scene-lights.wgsl`) and reads a small buffer back, one map in flight, deferring if one is pending. Each anchor's light is placed at the centroid of the emission assigned to it. That reduction is look-dependent (`temperature`, `brightness`, `opacity`) and exists to light surfaces. The plan says not to drive the synth from lights or the framebuffer. Copy the shape (one small buffer, at most one map in flight) if a real probe is required. Do not reuse the totals as energy.

`lightAnchors()` on `FireSimulation` is private. It lists every emitter's world position, plus an anchor for each explosion that is still lighting the scene. The positions are not weighted. The host already has those transforms on the handles it created.

A full `field` or `velocity` texture mapped every frame is the expensive read. Phase 5 is where that would be rejected. Do not add it.

## Candidate signals

| Signal           | Where it is on this branch                                                                                                                                                      | Already on the CPU?                             | Probe                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Heat             | `field` Y. CPU proxies: emitter `emission.heatRate`, explosion `charge.heat`, and `flame.heatRate` (production of existing flame, not the field).                               | The rates and the charge are. The field is not. | None for the proxies. A mean or max of `field` Y over active bricks would be a new reduction.                       |
| Smoke density    | `field` X when `smokeDivisor` is 1. Otherwise `FluidSimulation.smoke`. CPU proxies: `emission.smokeRate`, `flame.smokeRate`, `smoke.dissipation`.                               | The rates and dissipation are. Density is not.  | New reduction for the density. Check `smokeDivisor` before reading X.                                               |
| Speed            | `velocity`. Debug view is the magnitude, m/s.                                                                                                                                   | No.                                             | New reduction (magnitude inside the flame). No existing readback.                                                   |
| Vorticity        | Recomputed from `velocity` for the debug view. The confinement coefficient `motion.vorticity` is on the CPU. The curl buffer does not survive the step.                         | The coefficient is. The magnitude is not.       | New reduction from velocity. The coefficient alone cannot stand in for roughness of the flow.                       |
| Cooling          | `getOptions().flame.cooling` (1/s). Partner: `getOptions().smoke.dissipation`.                                                                                                  | Yes.                                            | None.                                                                                                               |
| Burst            | `Explosion.trigger()` queues a private `pending` event. `step` injects it as a one-step source (`charge.heat / FIXED_DT` and the same for smoke and fuel) and clears the queue. | Yes, at the call. There is no listener.         | None if the host that calls `trigger` also notes the impulse. A callback inside `step` would be new, and still CPU. |
| Grid health      | `stats.simulationTime`, `stats.droppedTime`, `stats.estimatedMemoryBytes` update on the call. `stats.activeVoxels` and `stats.gridLimited` lag by the activity map.             | Yes.                                            | None. The activity readback is the existing one.                                                                    |
| Emitter position | `Emitter.object` world matrix. `lightAnchors()` gathers the same positions and does not weight them.                                                                            | Yes, on the handles the host holds.             | None. A centroid is the emission-weighted average of those positions, on the CPU.                                   |

Force options (`wind`, `turbulence`, `vortex`, `radial`) are also on the CPU through `Force.getOptions()`. They are not in the plan's signal map. Turbulence strength is not vorticity magnitude.

Rendering and lighting options (`brightness`, `opacity`, `temperature`, `color`, `illuminateScene`, `intensity`) change the picture and the scene lights. They do not change the solver. Leave them out of energy, gain, and crackle rate.

## How parameters map to sound

Phase 3 wires the CPU rows. The GPU rows are still waiting on a reduction, which phase 2 did not add.

| Sim signal                                                     | Synth control                                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heat (field, or the CPU heat rates until a reduction exists)   | Energy in, and the level of the roar bed.                                                                                                                                    |
| Smoke density                                                  | Body of the bed. Optional darker resonances. Dissipation is not density.                                                                                                     |
| Speed, and vorticity magnitude                                 | Crackle event rate. Vorticity magnitude also roughens the events.                                                                                                            |
| `flame.cooling`, with `smoke.dissipation`                      | How fast `systemEnergy` decays when the fire is quiet.                                                                                                                       |
| `Explosion.trigger()`                                          | One impulse on the audio block that covers that step.                                                                                                                        |
| `stats.activeVoxels`, `stats.gridLimited`, `stats.droppedTime` | Level. Hold the last probes while `droppedTime` is climbing, and let energy decay. A budget clip (`gridLimited`) is a discontinuity and should be audible as a level change. |

The proxies do not see heat that has left the emitter and is cooling in the plume, or speed inside the flame. Those are what a later reduction would be for. Crackle rate follows `systemEnergy`, and that energy follows the heat proxy, because the magnitude is not on the CPU. The campfire preset (`editor/presets/campfire.json`) is still the listening target for phase 4: one disk at `[0, 0.27, 0]`, `emission.heatRate` 10, `flame.heatRate` 3, `flame.cooling` 0.62, `smoke.dissipation` 0.94, `motion.vorticity` 3.2, fuel disabled, `smokeDivisor` 2. Playback currently loads the fire tornado instead.

The editor inspector still does not run audio. The seam is the playback loop:

```text
examples/playback/main.ts
  simulation.update(delta)
  sample = probe.capture(public CPU state)   // null unless a step ran
  if sample: post controlsFromProbe to the worklet
  renderer.render(...)
```

`FluidSimulation` stays private. A GPU reduction, if a later phase needs one, is a new small buffer inside `FireSimulation`: `copyBufferToBuffer`, `mapAsync(READ)`, at most one map in flight. Not a map of `field`. Mute and the state before the first unmute do not change `update` or the solver.

## What is next

1. **Phase 4, playback.** Point `examples/playback` at an export of the campfire preset. HUD for energy, crackle rate, cooling, last impulse, `activeVoxels`, `droppedTime`, `gridLimited`. Mute is already on the playback page.
2. **Phase 5, frame time.** Record frame time and `droppedTime` with the voice muted and the probe off, then on. There is no GPU probe to slow the frame yet.
3. **Phases 6 and 7** only after the campfire is listenable and the phase 5 note exists. Panning uses the phase 2 centroid. A PR to `dgreenheck/threejs-fire-pro` waits on that, and only if the branch is still MIT and free of unrelated editor churn.
