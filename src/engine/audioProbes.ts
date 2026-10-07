/** Threads in `sampleAudioProbes` (`audio-probes.wgsl`). The lattice uses the same count. */
export const AUDIO_PROBE_COUNT = 16;
/** Heat, speed, vorticity, live flag. One vec4 per probe. */
export const AUDIO_PROBE_FLOATS = AUDIO_PROBE_COUNT * 4;
export const AUDIO_PROBE_BYTES = AUDIO_PROBE_FLOATS * 4;
/** Map-read copies kept so a late map never stalls the frame. */
export const AUDIO_PROBE_STAGING = 3;
