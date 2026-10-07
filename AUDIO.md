# FireSim audio

Phases 1–3 of the [FireSim audio plan](https://richoncode.github.io/webartests/experiments/firesimaudio/plan.html) are on this branch, plus a sparse probe lattice in place of a full-grid reduction. Phase 1, further down, is the field note: each signal, whether it is already on the CPU, and whether a probe would be a new GPU reduction or an existing readback. Names were checked on this branch against `main` of this fork (upstream `dgreenheck/threejs-fire-pro` as of 6 Oct 2026).

The solver and the picture are the upstream simulation. The voice is a separate Web Audio graph beside `simulation.update`. It stays silent until a click or the U key. Mute only zeros its gain. The probe pass only reads, and only when playback asks for it. The editor never dispatches it.

The simulation is Daniel Greenheck's [Fire Pro](https://github.com/dgreenheck/threejs-fire-pro) (`threejs-fire-pro`), MIT. This fork is `richoncode/firesim`. `LICENSE` is unchanged, and bundled fonts, models, and textures stay under the terms in `THIRD_PARTY_NOTICES.md`.

## How to hear it

No sampled fire recordings. The editor does not run the voice.

```sh
npm install
npm run dev
```

**Slider, no simulation.** Open <http://127.0.0.1:5173/examples/audio/>. Click **Unmute** or press **U**. **Level** is the energy. Leave it up for a roar plus crackle. Return it to zero and both die out over a few seconds. Mute cuts the output at once and leaves the page up. This is the phase 3 stop line: silent until the gesture, and the slider back at zero lets the crackle die.

**Campfire, experiment panel.** Open <http://127.0.0.1:5173/examples/playback/>. The page loads `editor/presets/campfire.json`. A slim dock sits on the left. Click **Unmute** or press **U**, then move **Level**. The default lattice is sixteen probes. The strip is probe energy: four columns, the bottom row on the emitter, the top row up the plume. As heat climbs, the rows light in order. Zero level stops adding energy and each crackle dies out at the fire's cooling rate. Mute cuts the output and leaves the fire running; the strip keeps updating. Check **Log probe**, or open the page with `?probe=1`, for the CPU proxy and one heat line per completed map.

The dock does not change the solver. **Probes** (4–32) rebuilds the lattice. **Spacing** (2–16 field cells) is the center-to-center gap; 2 is the closest pair that still does not share an edge. The line above those sliders is the shape, for example `2×4×2, 18 cells up`. **Show probe positions** draws a small sphere at each probe and starts on. Turn it off and the picture matches the base sim. **Heat gain**, **Crackle rate**, **Roar mix**, **Motion**, and **Impulse** scale the voice. **Reset** restores the defaults in the table below. Space still detonates a preset's bursts in the picture. The voice does not take a separate pop from the key. A heat jump at a probe is the impulse.

`?preset=tornado` loads the checked-in tornado (`examples/playback/simulation.json`) with the same dock.

After `npm run build`, `npm run preview` serves the same paths. This fork does not have GitHub Pages turned on, so that local server is the preview.

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

Level 0 forces `drive` and the impulse to 0. Energy then decays. That is the phase 3 stop line on the slider page. Playback uses the same rule on every probe: Level 0 forces each drive and each impulse to 0.

While `droppedTime` climbs, playback still posts only the step that ran, and the worklet holds the last controls between posts. It does not invent steps.

The CPU heat proxy is still logged. It no longer drives the playback voice. The lattice below does.

## Sparse probes

Not a sum over the grid, and not a flame-front integral. `probeLattice` in `src/audio/lattice.ts` places them. The anchor is the emission-weighted XZ of the emitters and the lowest emitter Y, taken once at load. The default is sixteen probes, 6 field cells apart. The playback dock can change the count (4–32) and the spacing (2–16 cells). A count change rebuilds the lattice, drops the smoother, and ignores a map whose size no longer matches.

`latticeShape` spends extra probes on height:

| Count | X | Y | Z |
| ----- | - | - | - |
| Multiple of 4 | 2 | count / 4 | 2 |
| Other even count | 2 | count / 2 | 1 |
| Odd count | 1 | count | 1 |

The default 16 is therefore 2×4×2. An odd count is a single vertical line. Spacing 6 puts the default probes here:

| Axis | Count | Placement |
| ---- | ----- | --------- |
| X    | 2     | Three field cells left of the anchor cell, and three to the right. |
| Z    | 2     | The same straddle. |
| Y    | 4     | The anchor's field cell, then three more steps up the plume. |

Neighbors stay at least 2 field cells apart, so they never share an edge. Each probe sits on a cell center. The index is layer-major, then X, then Z. Layer 0 is the emitter. Within a layer the first pair is −X, which is also left to right on the strip. When a layer has only one column, the strip is a single row and the left end is the emitter.

Campfire uses `voxelSize` 0.05, so 6 cells is 0.30 m. The disk emitter is at `[0, 0.27, 0]`. Its field cell is `(0, 5, 0)`. The probes are cells

- X: −3 and +3
- Z: −3 and +3
- Y: 5, 11, 17, 23

World centers are `(cell + 0.5) * 0.05`. The X pair is one cell off the geometric center of the emitter because that emitter sits on a cell boundary. Both centers still fall inside the 0.8 m disk. The Y stack starts on the emitter and steps up by 0.30 m. A preset with another voxel size keeps the same 6-cell gap, so the probes stay non-adjacent.

`FireSimulation.sampleAudioField` asks `FluidSimulation` for the current lattice after a simulated step. `update` does not call it. The editor never allocates the buffers.

The compute kernel `sampleAudioProbes` (`src/engine/shaders/audio-probes.wgsl`) runs workgroups of 16, one thread per probe, at most two workgroups. A thread past the count returns. Each live thread:

| Channel | What it reads |
| ------- | ------------- |
| Heat | `field` Y at that one cell. |
| Speed | The max velocity magnitude in the velocity cell under the probe and its six face neighbors, m/s. |
| Vorticity | The curl magnitude of that same neighborhood, central differences over one velocity cell, 1/s. Same shape as the vorticity debug view. |
| Live | 1 when that field cell's brick has a slot. An empty brick is zero heat and not live. |

The result is one vec4 per probe, 64 to 512 bytes. A copy into one of three `MAP_READ` buffers is mapped after `submit`. The frame does not await the map. If all three buffers are still mapped, that step is skipped and the previous samples stay. The value playback sees lags the dispatch by at least one step. Changing the count destroys those buffers and drops a map whose byte size no longer matches. `reset` drops in-flight maps.

Playback smooths heat, speed, and vorticity with a one-pole of about 60 ms, then posts. `live` is not smoothed.

Each probe has its own energy and a small PhISEM crackle (`PlumeVoice` in `src/audio/plume.ts`). A rising target approaches at about 8/s, so a plume that reaches the next layer a fraction of a second later is still a separate onset. A falling target decays at the fire's cooling (the phase 3 decay, including the 0.35/s floor). The shared roar is the mean energy of the probes that are live and actually burning. Quiet probes are left out of that mean. The roar is equal-power panned by the energy-weighted world X of those probes, and each crackle is panned on its own. ±0.6 m is hard left or right. Campfire's probes are only about 0.15 m off center, so the pan is mild. A lattice that burns on both sides stays near the middle.

| Posted control | Formula |
| -------------- | ------- |
| Local energy | `Level * clamp(smoothedHeat * heatGain / 2, 0, 1)`, times 0.55 when `gridLimited`. That is the attack target. `drive` is the target times the decay. **Heat gain** defaults to 1. |
| Motion | `clamp(0.35 * speed / 4 + 0.65 * vorticity / 50, 0, 1)`. The Poisson rate is multiplied by `max(0, 1 - influence + influence * motion)`. **Motion** defaults to 0.75, which is the old `0.25 + 0.75 * motion`. At 0 the rate ignores speed and vorticity. At 1 a still probe goes quiet. The same motion opens the roar's lowpass. |
| Crackle rate | Multiplies the 70/s Poisson rate. Default 1. The slider runs 0–3. |
| Roar mix | 0 is crackle only, 1 is roar only. 0.5 keeps the previous balance: roar gain and crackle gain are both unchanged. |
| Impulse | On a new map, if unsmoothed heat rose by more than `0.35 / sensitivity` since the previous map, `Level * clamp(rise / (1.5 / sensitivity), 0, 1)` is added to that probe once. **Impulse** defaults to 1. 0 disables pops. The first map, and the first map after a relayout, has no previous sample. A Level move does not repeat it. |
| Smoke | The CPU smoke-rate proxy, `clamp(smoke / 4, 0, 1)`, darkens the shared roar. Field X on campfire is production, not density (`smokeDivisor` is 2). |
| Pan | `clamp(worldX / 0.6, -1, 1)`. |

Level is the master scale, at the top of that left dock. Unmute and the U key are the gesture, unchanged. Orange spheres mark each probe in the scene while **Show probe positions** is on. They are not colliders and not emitters. The strip shows each probe's energy (smoothed heat times heat gain, over the same reference of 2) and the mean heat, speed, and vorticity of the live probes. **Reset** restores Level 0.7, 16 probes, spacing 6, markers on, and the knob defaults above.

The slider page does not send probes. It is still the mono `PhisemVoice`.

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
| `examples/playback/`            | Rebuilds emitters, forces, and colliders. It fetches the campfire preset. `simulation.json` is the tornado, loaded with `?preset=tornado`.                                                                                                                     |

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

Phase 3 wired the CPU rows into one voice. Playback now uses the sparse lattice for heat, speed, and vorticity. That is a read of those cells and their velocity neighbors, not the full-grid reduction this table originally left open. The default is 16 cells.

| Sim signal                                                     | Synth control                                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heat (field, or the CPU heat rates until a reduction exists)   | Energy in, and the level of the roar bed.                                                                                                                                    |
| Smoke density                                                  | Body of the bed. Optional darker resonances. Dissipation is not density.                                                                                                     |
| Speed, and vorticity magnitude                                 | Crackle event rate. Vorticity magnitude also roughens the events.                                                                                                            |
| `flame.cooling`, with `smoke.dissipation`                      | How fast `systemEnergy` decays when the fire is quiet.                                                                                                                       |
| `Explosion.trigger()`                                          | One impulse on the audio block that covers that step.                                                                                                                        |
| `stats.activeVoxels`, `stats.gridLimited`, `stats.droppedTime` | Level. Hold the last probes while `droppedTime` is climbing, and let energy decay. A budget clip (`gridLimited`) is a discontinuity and should be audible as a level change. |

The CPU proxies still do not see heat that has left the emitter. The lattice does: each probe reads the field cell it sits on. Crackle rate on the slider page still follows that page's single `systemEnergy`. On playback it follows each probe's energy, scaled by the speed and vorticity read at that probe.

The campfire preset (`editor/presets/campfire.json`) is what playback loads: one disk at `[0, 0.27, 0]`, `emission.heatRate` 10, `flame.heatRate` 3, `flame.cooling` 0.62, `smoke.dissipation` 0.94, `motion.vorticity` 3.2, fuel disabled, `smokeDivisor` 2. A light wind blows in +X. The lattice stays on the emitter axis rather than chasing that drift. `?preset=tornado` keeps the previous document.

The editor inspector still does not run audio. The seam is the playback loop:

```text
examples/playback/main.ts
  simulation.update(delta)
  sample = probe.capture(public CPU state)          // null unless a step ran
  if sample: read = simulation.sampleAudioField(lattice) // lagged map, or null
  if a new map: smooth, post the plume, paint the strip
  renderer.render(...)
```

`FluidSimulation` stays unexported. The probe buffers live on it and are reached through `sampleAudioField`. Mute and the state before the first unmute do not change `update` or the solver. The probe pass does not write `field` or `velocity`.

## What is next

1. **Phase 5, frame time.** Record frame time and `droppedTime` with the voice muted and `sampleAudioField` not called, then with the lattice on. The default pass is 16 threads and a 256-byte map. The dock can raise that to 32 threads and 512 bytes.
2. **Phases 6 and 7** only after that note exists. Panning is world X of each probe, not the phase 2 centroid. A PR to `dgreenheck/threejs-fire-pro` waits on that, and only if the branch is still MIT and free of unrelated editor churn.
