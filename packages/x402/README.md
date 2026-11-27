# @kite-01/x402

Charge per request with [x402](https://x402.org), using a [Kite](https://github.com/Kite-01/server) server as the facilitator. Your server is the seller: a protected route answers `402 Payment Required` with one offer per chain your Kite app accepts, and when an x402 client pays, Kite verifies and settles the payment before the route runs. Any standard x402 v2 client can pay.

```sh
npm install @kite-01/x402
```

## Options

```ts
const options = {
  baseUrl: "https://pay.example.com",
  auth: {
    apiKeyId: process.env.KITE_API_KEY_ID,
    privateKey: process.env.KITE_PRIVATE_KEY,
  },
  price: 0.05,
};
```

- `baseUrl`: your Kite server. There's no default; anyone can run their own.
- `auth`: passed to `@kite-01/sdk`'s `Kite`. The API key needs the `x402` and `quotes:write` scopes.
- `price`: USD per request. Only chains that settle in their USD stablecoin are offered, so 0.05 USD is 0.05 of that token. Chains that settle in anything else are skipped. If Kite's fees on a chain are more than the price, that chain is dropped with a warning the first time the route is priced.
- `free(request)`: return `true` to let a request through without paying. By default every request is charged.
- `settled`: where settled payments are recorded (see below).

Create one middleware per route price. Each keeps one open offer per chain and reuses it until Kite stops accepting it, because every new offer opens a transfer, and on NEAR that pays a storage deposit.

## Hono

```ts
import { x402 } from "@kite-01/x402/hono";

app.get("/post", x402(options), (c) => c.text("Paid content"));
```

## Elysia

```ts
import { x402 } from "@kite-01/x402/elysia";

app.get("/post", () => "Paid content", { beforeHandle: x402(options) });
```

## Next.js

A route handler, in `app/post/route.ts`:

```ts
import { withX402 } from "@kite-01/x402/next";

export const GET = withX402(options, () => new Response("Paid content"));
```

Or `middleware.ts` (`proxy.ts` from Next.js 16), with `config.matcher` choosing the paid routes:

```ts
import { x402 } from "@kite-01/x402/next";

export default x402(options);
export const config = { matcher: "/post" };
```

## Express

```ts
import { x402 } from "@kite-01/x402/express";

app.get("/post", x402(options), (req, res) => res.send("Paid content"));
```

## Fastify

```ts
import { x402 } from "@kite-01/x402/fastify";

app.get("/post", { preHandler: x402(options) }, async () => "Paid content");
```

## Anything with `Request` and `Response`

Bun, Deno, Cloudflare Workers and other frameworks without an adapter use the core. It returns either a `response` to send as it is, or the `headers` to add to your route's response:

```ts
import { x402 } from "@kite-01/x402";

const charge = x402(options);

Bun.serve({
  async fetch(request) {
    const { response, headers } = await charge(request);
    if (response) return response;

    return new Response("Paid content", { headers });
  },
});
```

## Count each payment once

Kite answers `settle` with success again for a payment that has already settled, so clients can retry safely. That would also let one payment unlock the route forever, so each settled payment is recorded and refused the second time. It's recorded by its `payTo`, the pay-in address Kite gives each transfer.

The record is an in-memory set by default. When several servers share the route, or it should survive restarts, pass anything with `has` and `add`:

```ts
x402({
  ...options,
  settled: {
    has: async (payTo) => (await redis.sIsMember("x402:settled", payTo)) === 1,
    add: (payTo) => redis.sAdd("x402:settled", payTo),
  },
});
```

## Errors

Kite's refusals, such as a wrong amount or a transfer that's already reserved, come back as a `402` with Kite's message in `error`. A payment still being confirmed gets a `402` carrying only its `PAYMENT-RESPONSE`, so the client can retry with the same payment.

## License

[MIT](../../LICENSE)
