# Kite packages

npm packages for integrating with a [Kite](https://github.com/Kite-01/server) server.

| Package                        | Runs on     | For                                                     |
| ------------------------------ | ----------- | ------------------------------------------------------- |
| [`@kite-01/sdk`](packages/sdk) | your server | Calling the Kite API with signed requests, and webhooks |
| [`@kite-01/js`](packages/js)   | the browser | Opening checkout over your page                         |

A payment goes like this:

1. Your server creates a payment link for the order with `@kite-01/sdk`, tagging it with your order id as its `reference`.
2. Your page opens it with `openCheckout` from `@kite-01/js`.
3. Kite sends a `Transfer` webhook when the payment settles; your server verifies it with `verifyWebhook` and fulfils the order.

## Development

Needs Node 20+ and pnpm.

```sh
pnpm install
pnpm build    # every package; Turborepo caches the results
pnpm test
pnpm check    # typecheck
pnpm lint
```

### The API spec

`@kite-01/sdk` is generated from `openapi/kite.json` with [Hey API](https://heyapi.dev), so its types always match the server. To update it after the API changes:

```sh
pnpm spec:pull https://pay.example.com/openapi/json
# or, from a server checkout: bun run spec > kite.json && pnpm spec:pull kite.json
```

Then commit the new spec with whatever SDK changes it needs.

### Releasing

Describe each change with `pnpm changeset`. When those reach `main`, the release workflow opens a version PR; merging it publishes to npm. It needs an `NPM_TOKEN` secret with publish rights to `@kite-01`.

To share the build cache across machines and CI, set a `TURBO_TOKEN` secret and `TURBO_TEAM` variable for [Vercel Remote Cache](https://turborepo.com/docs/core-concepts/remote-caching); without them the cache stays local.
