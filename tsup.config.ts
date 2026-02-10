import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    compilerOptions: {
      removeComments: true
    }
  },
  clean: true,
  splitting: false,
  treeshake: true,
  sourcemap: false,
  target: 'es2022'
});
