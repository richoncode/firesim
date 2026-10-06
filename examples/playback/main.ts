import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { probeInputFromSimulation, worldPosition } from '../../src/audio/from-simulation.ts';
import { controlsFromProbe } from '../../src/audio/mapping.ts';
import { mountFireAudioPanel } from '../../src/audio/panel.ts';
import { FireAudioProbe, formatProbeSample } from '../../src/audio/probe.ts';
import { FireVoice } from '../../src/audio/voice.ts';
import { FireSimulation, type Emitter, type Explosion } from '../../src/index.ts';

// A configuration exported from the editor (Export → JSON).
const config = await (await fetch(new URL('./simulation.json', import.meta.url))).json();

const renderer = new THREE.WebGPURenderer({ antialias: true });
// Flames light the scene with point lights; clustered lighting adds and removes them
// without recompiling materials.
renderer.lighting = new ClusteredLighting();
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15161a);
scene.add(new THREE.HemisphereLight(0xc5d5e6, 0x32313b, 0.5));
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.58, metalness: 0.08 }),
);
scene.add(floor);

const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.05, 250);
camera.position.fromArray(config.camera.position);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.fromArray(config.camera.target);
controls.enableDamping = true;

// The simulation runs in world space; leave its own transform at the identity.
const simulation = new FireSimulation(config.simulation);
scene.add(simulation);

const pose = (object: THREE.Object3D, item: { position: number[]; rotation: number[] }) => {
  object.position.fromArray(item.position);
  object.rotation.fromArray(item.rotation as [number, number, number]);
};
const emitters = new Map<string, Emitter>();
const explosions: Explosion[] = [];
for (const source of config.emitters) {
  if (source.mode === 'burst') {
    const explosion = simulation.addExplosion(source.burst);
    pose(explosion.object, source);
    explosions.push(explosion);
    continue;
  }
  let emitter: Emitter;
  if (source.shape === 'sphere') {
    emitter = simulation.addEmitter({
      ...source.options,
      shape: { type: 'sphere', radius: source.radius },
    });
    pose(emitter.object, source);
  } else {
    // Other shapes emit from the surface of a mesh, which carries the transform. The mesh
    // only shapes the emission, so it stays invisible.
    const geometry =
      source.shape === 'box'
        ? new THREE.BoxGeometry(...source.size)
        : source.shape === 'disk'
          ? new THREE.CircleGeometry(source.radius, 40)
          : new THREE.TorusGeometry(source.radius, source.radius * 0.4, 12, 40);
    if (source.shape !== 'box') geometry.rotateX(-Math.PI / 2); // lie flat, facing up
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
    pose(mesh, source);
    simulation.add(mesh);
    emitter = simulation.addEmitter({ ...source.options, shape: { type: 'mesh', object: mesh } });
  }
  emitters.set(source.id, emitter);
}
for (const force of config.forces)
  simulation.addForce(
    force.options,
    force.targets?.map((id: string) => emitters.get(id)!),
  );
for (const collider of config.colliders) {
  const mesh = new THREE.Mesh(
    collider.shape === 'sphere'
      ? new THREE.SphereGeometry(collider.radius, 24, 16)
      : new THREE.BoxGeometry(...collider.size),
    new THREE.MeshStandardMaterial({ color: 0x59636b }),
  );
  pose(mesh, collider);
  scene.add(mesh);
  simulation.addCollider({
    object: mesh,
    shape:
      collider.shape === 'sphere'
        ? { type: 'sphere', radius: collider.radius }
        : { type: 'box', size: collider.size },
  });
}

await simulation.initialize(renderer);

// CPU proxies for the voice. The solver is unchanged. Audio stays off until Unmute.
const probe = new FireAudioProbe();
const voice = new FireVoice();
let level = 0.7;
let logProbe = new URLSearchParams(location.search).has('probe');
const postVoice = (includeImpulse: boolean) => {
  const sample = probe.latest;
  if (!sample) return;
  voice.setControls(controlsFromProbe(sample, level, includeImpulse));
};
mountFireAudioPanel(document.body, {
  voice,
  level,
  floating: true,
  logInitially: logProbe,
  hint: 'Level scales the fire’s heat. Zero lets the crackle die out. Mute leaves the simulation running. This preset is the fire tornado.',
  onLevel: (next) => {
    level = next;
    postVoice(false);
  },
  onLog: (enabled) => {
    logProbe = enabled;
  },
});

// Bursts fire once at the start and again on Space. The charge is the audio impulse.
const detonate = () =>
  explosions.forEach((explosion) => {
    probe.noteImpulse(explosion.getOptions().charge.heat, worldPosition(explosion.object));
    explosion.trigger();
  });
detonate();
addEventListener('keydown', (event) => {
  if (event.code === 'Space') detonate();
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  controls.update();
  simulation.update(Math.min(timer.getDelta(), 0.1));
  // Once per simulated step. A short frame that does not step leaves the last probes in place.
  const sample = probe.capture(probeInputFromSimulation(simulation, [...emitters.values()]));
  if (sample) {
    if (logProbe) console.info(formatProbeSample(sample));
    postVoice(true);
  }
  renderer.render(scene, camera);
});
