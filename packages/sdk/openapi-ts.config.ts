import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../../openapi/kite.json",
  output: "src/gen",
  plugins: [
    "@hey-api/typescript",
    {
      name: "@hey-api/sdk",
      operations: {
        strategy: "single",
        containerName: "Api",
        methods: "instance",
      },
    },
    {
      name: "@hey-api/client-fetch",
      baseUrl: false,
      throwOnError: true,
    },
  ],
  logs: { file: false },
});
