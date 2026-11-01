# AGENTS.md

Notes for AI agents working in this repository.

This is `@kite-01/sdk`, the npm package for calling a [Kite](https://github.com/Kite-01/server) server's API with signed requests and verifying its webhooks.

## Commands

```sh
pnpm install

# every package, cached by Turborepo
pnpm build
pnpm test

# typecheck
pnpm check

# oxlint and Prettier
pnpm lint
```

## Layout

- `packages/sdk/`: the SDK. `src/gen/` is generated from `openapi/kite.json` by Hey API (see `openapi-ts.config.ts`), so don't edit it by hand.
- `openapi/kite.json`: the server's OpenAPI spec. Refresh it with `pnpm spec:pull <url or file>`, then rebuild.
- `.changeset/`: every change carries a changeset (`pnpm changeset`). Versions and releases run from GitHub Actions, as the README describes.

## Rules

- Never commit an npm token or any key: packages publish through npm trusted publishing.
- Format with Prettier (`pnpm format`).
