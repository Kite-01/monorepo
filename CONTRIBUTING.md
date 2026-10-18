# Contributing

Thanks for helping with Kite. This repo holds the npm packages merchants use to integrate with a Kite server: `@kite-01/sdk` for their backend and `@kite-01/js` for their site.

Found a security issue? Don't open an issue or pull request; follow the [security policy](https://github.com/Kite-01/server/blob/main/SECURITY.md).

## Before you start

For anything beyond a small fix, open an issue first and describe the change, so we can agree on the approach before you build it.

API changes start in the [server](https://github.com/Kite-01/server). The SDK is generated from the server's OpenAPI spec, so an endpoint or field has to exist there first.

## Setup

You need Node.js 20 or newer and pnpm 10.

```sh
pnpm install
pnpm build
pnpm test
```

## Making a change

1. Fork the repo and branch from `main`.
2. Make the change, with tests next to it in the package's `test/` folder.
3. Run the checks; all must pass:

   ```sh
   pnpm lint
   pnpm check
   pnpm test
   pnpm build
   ```

   `pnpm format` fixes formatting.

4. Add a changeset (below).
5. Open a pull request saying what changed and why. Link the issue if there is one.

A few rules the packages follow:

- `@kite-01/sdk` runs anywhere with Web Crypto (Node 20+, Bun, Deno, edge runtimes), so its `src/` can't use Node built-ins. Tests can.
- `@kite-01/js` has no dependencies and stays small; check `dist/index.iife.js` after building.
- Don't hand-write types the spec already gives you. Generated code lives in `packages/sdk/src/gen/` and isn't committed.
- Write comments only where the code can't explain itself.

### Updating the API spec

When the server's API changes, pull its spec and regenerate:

```sh
pnpm spec:pull https://pay.example.com/openapi/json
# or from a server checkout: bun run spec > kite.json, then pnpm spec:pull kite.json
pnpm build
```

Commit `openapi/kite.json` with any SDK changes it needs.

## Changesets

Every change that affects a published package needs a changeset:

```sh
pnpm changeset
```

Choose the packages it touches, pick `patch` for fixes, `minor` for new features and `major` for breaking changes, and write one line a user of the package would understand. Commit the file it creates in `.changeset/` with your change. Changes that don't touch a package, like CI or docs, don't need one.

## Releases

Maintainers release; you don't need to do anything beyond the changeset.

When changesets reach `main`, the **Version** workflow opens a "Version packages" pull request that bumps versions and writes each package's `CHANGELOG.md`. After merging it, a maintainer runs the **Release** workflow once per package to publish it to npm.

A new package's first version has to be published by hand, because npm only accepts a trusted publisher for a package that exists. From an up-to-date `main`, signed in to npm with publish rights to `@kite-01`:

```sh
pnpm install
pnpm build
cd packages/<package> && npm publish
```

Then, on the package's npm settings page, add a trusted publisher for this repository with the `release.yml` workflow and the `release` environment. Every later version goes through the Release workflow.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
