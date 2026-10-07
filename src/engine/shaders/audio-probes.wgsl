// Sparse audio probes. One thread per probe, dispatched as a single workgroup of 16.
// Each probe reads one heat cell and the velocity cell under it plus that cell's six
// neighbors. Nothing here sums the grid, and nothing here writes a field.
@group(0) @binding(80) var<storage, read> audioProbePositions: array<vec4f>;
// xyzw: heat (empty unit), speed (m/s), vorticity (1/s), 1 when the field brick has a slot.
@group(0) @binding(81) var<storage, read_write> audioProbeResults: array<vec4f>;

@compute @workgroup_size(16)
fn sampleAudioProbes(@builtin(global_invocation_id) id: vec3u) {
  if id.x >= arrayLength(&audioProbePositions) {
    return;
  }
  let world = audioProbePositions[id.x].xyz;
  let fieldSpacing = u.fieldGrid.xyz;
  let velocitySpacing = u.velocityGrid.xyz;
  if fieldSpacing.x <= 0.0 || velocitySpacing.x <= 0.0 {
    audioProbeResults[id.x] = vec4f(0.0);
    return;
  }
  let fieldCell = vec3i(floor(world / fieldSpacing));
  let page = brickPage(fieldCell >> vec3u(brickShift(fieldSpacing)));
  let live = select(0.0, 1.0, page >= 0);
  let heat = loadCell(fields, fieldCell, fieldSpacing).y;

  let velocityCell = vec3i(floor(world / velocitySpacing));
  // Center, then +x, -x, +y, -y, +z, -z. Empty bricks load as zero.
  var sampled: array<vec3f, 7>;
  sampled[0] = loadCell(velocity, velocityCell, velocitySpacing).xyz;
  sampled[1] = loadCell(velocity, velocityCell + vec3i(1, 0, 0), velocitySpacing).xyz;
  sampled[2] = loadCell(velocity, velocityCell + vec3i(-1, 0, 0), velocitySpacing).xyz;
  sampled[3] = loadCell(velocity, velocityCell + vec3i(0, 1, 0), velocitySpacing).xyz;
  sampled[4] = loadCell(velocity, velocityCell + vec3i(0, -1, 0), velocitySpacing).xyz;
  sampled[5] = loadCell(velocity, velocityCell + vec3i(0, 0, 1), velocitySpacing).xyz;
  sampled[6] = loadCell(velocity, velocityCell + vec3i(0, 0, -1), velocitySpacing).xyz;
  var speed = 0.0;
  for (var i = 0u; i < 7u; i++) {
    speed = max(speed, length(sampled[i]));
  }
  // Same central difference as the vorticity debug view in scene-volume.wgsl.
  let scale = 1.0 / (2.0 * velocitySpacing);
  let dx = (sampled[1] - sampled[2]) * scale.x;
  let dy = (sampled[3] - sampled[4]) * scale.y;
  let dz = (sampled[5] - sampled[6]) * scale.z;
  let vorticity = length(vec3f(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x));
  audioProbeResults[id.x] = vec4f(heat, speed, vorticity, live);
}
