import { defineConfig } from 'tsup'

// Bundles lib/ascii into a standalone package; @napi-rs/canvas stays a runtime dependency.
export default defineConfig({
  entry: { index: 'src/index.ts', bin: 'bin.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node20',
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  external: ['@napi-rs/canvas'],
  noExternal: [/^(?!@napi-rs\/canvas)/],
  tsconfig: 'tsconfig.json',
})
