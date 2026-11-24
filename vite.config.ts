import { fileURLToPath } from 'node:url';
import { build as esbuildBuild } from 'esbuild';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

const CONTENT_SCRIPT_VIRTUAL_ID = 'virtual:dalaran-content-script';
const CONTENT_SCRIPT_RESOLVED_ID = `\0${CONTENT_SCRIPT_VIRTUAL_ID}`;

/**
 * Compila `src/injected/bootstrap.ts` como un bundle IIFE autocontenido y lo
 * expone como string. La Shell lo entrega a Rust para inyectarlo como
 * `initialization_script` en el WebView hijo, manteniendo una única fuente de
 * verdad con el código TypeScript probado por Vitest.
 */
function contentScriptBundlePlugin(): Plugin {
  return {
    name: 'dalaran-content-script-bundle',
    resolveId(id) {
      if (id === CONTENT_SCRIPT_VIRTUAL_ID) return CONTENT_SCRIPT_RESOLVED_ID;
      return null;
    },
    async load(id) {
      if (id !== CONTENT_SCRIPT_RESOLVED_ID) return null;

      const result = await esbuildBuild({
        entryPoints: [fileURLToPath(new URL('./src/injected/bootstrap.ts', import.meta.url))],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        minify: true,
      });

      const bundled = result.outputFiles[0]?.text ?? '';
      return `export const contentScriptSource = ${JSON.stringify(bundled)};`;
    },
  };
}

export default defineConfig({
  plugins: [preact(), contentScriptBundlePlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'es2022',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
