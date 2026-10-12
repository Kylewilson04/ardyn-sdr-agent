import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import cssInjectedByJs from 'vite-plugin-css-injected-by-js';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    preact(),
    cssInjectedByJs(),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/widget.tsx'),
      name: 'ArdynVoiceWidget',
      formats: ['iife', 'es', 'umd'],
      fileName: (format) => `ardyn-voice-widget.${format}.js`,
    },
    rollupOptions: {
      // ES and UMD: externalize deps so integrators can share them
      // IIFE: bundles everything for <script> tag usage
      external: (id) => {
        // Always external in es/umd; bundled in iife
        return false; // bundle everything — simplest for embed
      },
      output: {
        globals: {
          preact: 'preact',
        },
      },
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    reportCompressedSize: true,
  },
  // Demo page resolution
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
});