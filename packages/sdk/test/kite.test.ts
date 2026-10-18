import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  verify,
} from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Kite, KiteError } from "../src";

// The server's own key format and signature check, from kite-01/server.
const keyPair = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  return {
    publicKey: publicKey.export({ format: "jwk" }).x as string,
    privateKey: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64url"),
  };
};

const serverVerifies = (publicKey: string, request: Request, body: string) => {
  const url = new URL(request.url);
  const signed = [
    request.headers.get("x-kite-timestamp"),
    request.headers.get("x-kite-nonce"),
    request.method.toUpperCase(),
    `${url.pathname}${url.search}`,
    createHash("sha256").update(body).digest("hex"),
  ].join("\n");

  return verify(
    null,
    Buffer.from(signed),
    createPublicKey({
      format: "jwk",
      key: { kty: "OKP", crv: "Ed25519", x: publicKey },
    }),
    Buffer.from(request.headers.get("x-kite-signature") ?? "", "base64url"),
  );
};

const recorder = (respond = () => Response.json({ id: "link-1" })) => {
  const requests: Array<{ request: Request; body: string }> = [];
  const fetch = vi.fn(async (request: Request) => {
    requests.push({ request, body: await request.clone().text() });
    return respond();
  });

  return { requests, fetch: fetch as unknown as typeof globalThis.fetch };
};

const KEY_ID = "0b9a1d5e-5a7c-4b8e-9f00-1c2d3e4f5a6b";

describe("Kite", () => {
  it("signs requests the way the server checks them", async () => {
    const pair = keyPair();
    const { requests, fetch } = recorder();
    const kite = new Kite({
      baseUrl: "https://pay.example.com/",
      auth: { apiKeyId: KEY_ID, privateKey: pair.privateKey },
      fetch,
    });

    await kite.paymentLinks.create({
      body: {
        title: "Pro plan",
        currency: "USD",
        amount: "49",
        reference: "order-1",
      },
    });
    await kite.paymentLinks.list({ query: { reference: "order-1" } });

    const [created, listed] = requests;
    expect(created!.request.url).toBe(
      "https://pay.example.com/api/payment-links",
    );
    expect(created!.request.headers.get("x-kite-api-key-id")).toBe(KEY_ID);
    expect(JSON.parse(created!.body)).toMatchObject({ reference: "order-1" });
    expect(
      serverVerifies(pair.publicKey, created!.request, created!.body),
    ).toBe(true);

    expect(listed!.request.url).toContain("?reference=order-1");
    expect(serverVerifies(pair.publicKey, listed!.request, "")).toBe(true);
    expect(created!.request.headers.get("x-kite-nonce")).not.toBe(
      listed!.request.headers.get("x-kite-nonce"),
    );
  });

  it("produces a signature the server rejects once the body changes", async () => {
    const pair = keyPair();
    const { requests, fetch } = recorder();
    const kite = new Kite({
      baseUrl: "https://pay.example.com",
      auth: { apiKeyId: KEY_ID, privateKey: pair.privateKey },
      fetch,
    });

    await kite.paymentLinks.create({
      body: { title: "Pro plan", currency: "USD", amount: "49" },
    });

    const [{ request, body }] = requests as [(typeof requests)[number]];
    expect(
      serverVerifies(pair.publicKey, request, body.replace("49", "1")),
    ).toBe(false);
  });

  it("sends the root key, and the app to act as", async () => {
    const { requests, fetch } = recorder();
    const kite = new Kite({
      baseUrl: "https://pay.example.com",
      auth: { rootKey: "root-secret", appId: "app-1" },
      fetch,
    });

    await kite.apps.get();

    const [{ request }] = requests as [(typeof requests)[number]];
    expect(request.headers.get("x-kite-root-key")).toBe("root-secret");
    expect(request.headers.get("x-kite-app-id")).toBe("app-1");
    expect(request.headers.has("x-kite-signature")).toBe(false);
  });

  it("throws Kite's errors as KiteError", async () => {
    const { fetch } = recorder(() =>
      Response.json(
        { error: { code: "Conflict", message: "Resource already exists" } },
        { status: 409 },
      ),
    );
    const kite = new Kite({
      baseUrl: "https://pay.example.com",
      auth: { rootKey: "root-secret" },
      fetch,
    });

    const error = await kite.paymentLinks
      .create({ body: { title: "x", currency: "USD", amount: "1" } })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KiteError);
    expect(error).toMatchObject({
      status: 409,
      code: "Conflict",
      message: "Resource already exists",
    });
  });

  it("reports a failed connection as a KiteError without a status", async () => {
    const kite = new Kite({
      baseUrl: "https://pay.example.com",
      auth: { rootKey: "root-secret" },
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof globalThis.fetch,
    });

    await expect(kite.apps.get()).rejects.toMatchObject({
      name: "KiteError",
      status: undefined,
      code: "NetworkError",
      message: "fetch failed",
    });
  });

  it("refuses to run in a browser", () => {
    vi.stubGlobal("window", { document: {} });

    try {
      expect(
        () =>
          new Kite({
            baseUrl: "https://pay.example.com",
            auth: { rootKey: "root-secret" },
          }),
      ).toThrow(/must not run in a browser/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
