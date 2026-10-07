/** Fewest probes the playback lattice will build. */
export const AUDIO_PROBE_MIN = 4;
/** Most probes one readback holds. The shader dispatches this in workgroups of 16. */
export const AUDIO_PROBE_MAX = 32;
/** Default lattice: 2×4×2. */
export const AUDIO_PROBE_COUNT = 16;
/** Map-read copies kept so a late map never stalls the frame. */
export const AUDIO_PROBE_STAGING = 3;

/** Bytes for `count` vec4 probe records. */
export function audioProbeBytes(count: number): number {
  return count * 16;
}
