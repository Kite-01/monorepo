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

Each change carries a changeset (`pnpm changeset`). When changesets reach `main`, the **Version** workflow opens a "Version packages" pull request that bumps versions and writes the changelogs. After merging it, run the **Release** workflow from the Actions tab once per package.

Release publishes through npm trusted publishing with `npm stage publish`, in the `release` environment, so no npm token is stored. On npmjs.com, each package needs a trusted publisher pointing at this repository, the `release.yml` workflow and the `release` environment. The Version workflow needs "Allow GitHub Actions to create and approve pull requests" turned on under the repository's Actions settings.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, changesets and releases. To report a vulnerability, follow the [security policy](https://github.com/Kite-01/server/blob/main/SECURITY.md).

## License

[MIT](LICENSE)
