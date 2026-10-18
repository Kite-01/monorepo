import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhook, WebhookVerificationError } from "../src";

const SECRET = "whsec-test";

const body = JSON.stringify({
  id: "delivery-1",
  eventId: "event-1",
  webhookId: "webhook-1",
  category: "Transfer",
  previous: { status: "Processing" },
  current: { status: "Settled" },
  data: { quote: { paymentLink: { reference: "order-1" } } },
});

// How the server signs a delivery.
const deliver = (
  payload = body,
  timestamp = Math.floor(Date.now() / 1000),
) => ({
  "content-type": "application/json",
  "x-kite-timestamp": String(timestamp),
  "x-kite-signature": createHmac("sha256", SECRET)
    .update(`t=${timestamp}&${payload}`)
    .digest("hex"),
});

describe("verifyWebhook", () => {
  it("returns the event of a genuine delivery", async () => {
    const event = await verifyWebhook({
      body,
      headers: deliver(),
      secret: SECRET,
    });

    expect(event.current.status).toBe("Settled");
    expect(event.data).toMatchObject({
      quote: { paymentLink: { reference: "order-1" } },
    });
  });

  it("accepts Fetch headers and a byte body", async () => {
    const event = await verifyWebhook({
      body: new TextEncoder().encode(body),
      headers: new Headers(deliver()),
      secret: SECRET,
    });

    expect(event.eventId).toBe("event-1");
  });

  it.each([
    ["a changed body", { body: body.replace("Settled", "Failed") }],
    ["another secret", { secret: "other" }],
    [
      "a malformed signature",
      { headers: { ...deliver(), "x-kite-signature": "zz" } },
    ],
    ["missing headers", { headers: {} }],
    [
      "an old delivery",
      { headers: deliver(body, Math.floor(Date.now() / 1000) - 600) },
    ],
  ])("rejects %s", async (_label, overrides) => {
    await expect(
      verifyWebhook({ body, headers: deliver(), secret: SECRET, ...overrides }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });
});
