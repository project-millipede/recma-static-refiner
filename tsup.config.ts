import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  treeshake: true,
  sourcemap: false,
  target: "es2022",
});
