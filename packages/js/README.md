# @kite-01/js

Opens [Kite](https://github.com/Kite-01/server) checkout over your page, so customers pay without leaving your site. No dependencies, about 1 KB gzipped.

```sh
npm install @kite-01/js
```

Or without a bundler:

```html
<script src="https://unpkg.com/@kite-01/js"></script>
<!-- exposes window.Kite.openCheckout -->
```

## Open checkout

Your server creates the payment link with [`@kite-01/sdk`](../sdk), which decides the price. The page only opens it:

```ts
import { openCheckout } from "@kite-01/js";

const { paymentLinkId } = await fetch("/orders", { method: "POST" }).then(
  (response) => response.json(),
);

const checkout = openCheckout({
  baseUrl: "https://pay.example.com",
  paymentLinkId,
  onSuccess: ({ transferId }) => showThankYou(),
});

const result = await checkout.result;
// { status: "success", transferId } | { status: "failed", reason } | { status: "closed" }
```

A payment link you made in the Kite dashboard works too: pass its id, no server needed.

`onSuccess` tells you the customer paid, but anyone can call it from the browser console. Fulfil orders from the webhook or by reading the transfer on your server.

## Options

| Option          | Called with               | When                                                       |
| --------------- | ------------------------- | ---------------------------------------------------------- |
| `baseUrl`       |                           | Where your Kite server runs                                |
| `paymentLinkId` |                           | The link to pay                                            |
| `onReady`       |                           | Checkout has loaded                                        |
| `onStatus`      | `{ transferId, status }`  | A transfer opened or changed status                        |
| `onSuccess`     | `{ transferId }`          | The payment settled                                        |
| `onFailed`      | `{ reason, transferId? }` | It failed, was refunded, expired, or the link wasn't found |
| `onClose`       |                           | Checkout closed, by the customer or by `checkout.close()`  |

`openCheckout` returns `{ result, close }`. Opening a second checkout closes the first.
