import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/hono.ts",
    "src/elysia.ts",
    "src/next.ts",
    "src/express.ts",
    "src/fastify.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  platform: "neutral",
});
