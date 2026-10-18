import { readFile, writeFile } from "node:fs/promises";

const source = process.argv[2];
if (!source) {
  console.error(
    "Usage: pnpm spec:pull <url or file>\n" +
      "  e.g. https://pay.example.com/openapi/json, or a file from the server's `bun run spec`",
  );
  process.exit(1);
}

const text = /^https?:\/\//.test(source)
  ? await fetch(source).then((response) => {
      if (!response.ok)
        throw new Error(`${source} answered ${response.status}`);
      return response.text();
    })
  : await readFile(source, "utf8");

const spec = JSON.parse(text);
if (!spec.openapi || !spec.paths)
  throw new Error(`${source} is not an OpenAPI spec`);

await writeFile(
  new URL("../openapi/kite.json", import.meta.url),
  `${JSON.stringify(spec, null, 2)}\n`,
);
console.log(
  `openapi/kite.json: Kite ${spec.info?.version}, ${Object.keys(spec.paths).length} paths`,
);
