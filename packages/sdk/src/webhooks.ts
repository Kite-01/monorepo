import { encoder, fromHex } from "./encoding";

export type WebhookEvent = {
  /** The delivery id; the same event retried keeps its eventId. */
  id: string;
  eventId: string;
  webhookId: string;
  category: "Transfer" | "Deposit" | "Recovery" | "ExcessRefund";
  previous: { status: string | null };
  current: { status: string };
  /**
   * For transfer events, the transfer with its quote, and the quote's
   * payment link (carrying your reference and meta) when it came from one.
   */
  data: unknown;
};

type HeaderBag = Headers | Record<string, string | string[] | undefined | null>;

export class WebhookVerificationError extends Error {
  override readonly name = "WebhookVerificationError";
}

const header = (headers: HeaderBag, name: string) => {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;

  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  )?.[1];
  return Array.isArray(match) ? match[0] : (match ?? undefined);
};

/**
 * Checks a webhook delivery came from your Kite server and returns its event.
 * Pass the body exactly as it arrived, before any JSON parsing.
 */
export const verifyWebhook = async (input: {
  body: string | Uint8Array;
  headers: HeaderBag;
  secret: string;
  /** How old a delivery may be, in seconds. */
  tolerance?: number;
}): Promise<WebhookEvent> => {
  const signature = header(input.headers, "x-kite-signature");
  const timestamp = header(input.headers, "x-kite-timestamp");

  if (!signature || !timestamp) {
    throw new WebhookVerificationError(
      "x-kite-signature and x-kite-timestamp are required",
    );
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!/^\d+$/.test(timestamp) || !(age <= (input.tolerance ?? 300))) {
    throw new WebhookVerificationError(
      "The delivery is outside the allowed time window",
    );
  }

  const body =
    typeof input.body === "string"
      ? input.body
      : new TextDecoder().decode(input.body);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const expected = fromHex(signature);
  const valid =
    !!expected &&
    (await crypto.subtle.verify(
      "HMAC",
      key,
      expected,
      encoder.encode(`t=${timestamp}&${body}`),
    ));

  if (!valid) throw new WebhookVerificationError("Invalid webhook signature");
  return JSON.parse(body) as WebhookEvent;
};
