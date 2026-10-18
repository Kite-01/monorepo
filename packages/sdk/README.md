# @kite-01/sdk

Typed client for a [Kite](https://github.com/Kite-01/server) server. It signs every request for you and verifies webhooks. Use it on your server; it refuses to run in a browser.

```sh
npm install @kite-01/sdk
```

Node 20+, Bun, Deno and edge runtimes are supported: signing uses Web Crypto.

## Connect

With an API key (an Ed25519 key pair whose public half you registered with Kite):

```ts
import { Kite } from "@kite-01/sdk";

const kite = new Kite({
  baseUrl: "https://pay.example.com",
  auth: {
    apiKeyId: process.env.KITE_API_KEY_ID,
    privateKey: process.env.KITE_PRIVATE_KEY,
  },
});
```

Or with the server's root key, optionally acting as one app:

```ts
const kite = new Kite({
  baseUrl: "https://pay.example.com",
  auth: { rootKey: process.env.KITE_ROOT_KEY, appId },
});
```

## Take a payment

Create a payment link for the order, tagged with your own reference, and hand its id to your frontend to open with [`@kite-01/js`](../js):

```ts
const { data: link } = await kite.paymentLinks.create({
  body: {
    title: "Pro plan",
    currency: "USD",
    amount: "49",
    reference: order.id,
    meta: { customerEmail: order.email },
  },
});

return { paymentLinkId: link.id };
```

Find it again by reference with `kite.paymentLinks.list({ query: { reference: order.id } })`.

Every operation in the API is available, grouped as `kite.<group>.<action>`: `apps`, `apiKeys`, `customers`, `paymentLinks`, `quotes`, `transfers`, `webhooks`, `fees`, `tokens`, `chains`, `x402` and more. Calls return `{ data, request, response }`, typed from Kite's OpenAPI spec.

## Errors

A failed call throws a `KiteError` with the HTTP `status`, Kite's error `code` and its `message`. A request that never got a response has no status and the code `NetworkError`.

```ts
import { KiteError } from "@kite-01/sdk";

try {
  await kite.paymentLinks.create({ body });
} catch (error) {
  if (error instanceof KiteError && error.code === "Conflict") {
    // a link with this reference already exists
  }
}
```

## Webhooks

Pass the raw body, before any JSON parsing, with the request headers and the webhook's signing secret:

```ts
import { verifyWebhook } from "@kite-01/sdk";

app.post(
  "/kite/webhooks",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const event = await verifyWebhook({
      body: req.body,
      headers: req.headers,
      secret: process.env.KITE_WEBHOOK_SECRET,
    });

    if (event.category === "Transfer" && event.current.status === "Settled") {
      const transfer = event.data as {
        quote: { paymentLink: { reference: string | null } | null };
      };
      const orderId = transfer.quote.paymentLink?.reference;
      // fulfil the order
    }

    res.sendStatus(200);
  },
);
```

It throws a `WebhookVerificationError` when the signature doesn't match or the delivery is more than five minutes old. A retried delivery keeps its `eventId`, so use that to ignore repeats.

## License

[MIT](https://github.com/Kite-01/monorepo/blob/main/LICENSE)
