import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** One ES module the AudioWorklet can load. The main build copies it from public/. */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public/audio',
    emptyOutDir: true,
    copyPublicDir: false,
    minify: true,
    rollupOptions: {
      input: resolve('src/audio/fire-voice-processor.ts'),
      output: {
        format: 'es',
        entryFileNames: 'fire-voice-processor.js',
        codeSplitting: false,
      },
    },
  },
});
