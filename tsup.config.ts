import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node20",
  bundle: true,
  clean: true,
  sourcemap: false,
  minify: false,
  dts: false,
  outExtension: () => ({ js: ".mjs" }),
});