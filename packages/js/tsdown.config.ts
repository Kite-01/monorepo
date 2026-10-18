import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: "src/index.ts",
    format: ["esm", "cjs"],
    dts: true,
    platform: "browser",
  },
  {
    entry: "src/index.ts",
    format: "iife",
    globalName: "Kite",
    platform: "browser",
    minify: true,
  },
]);
