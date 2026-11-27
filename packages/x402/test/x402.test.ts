import { decodePaymentResponseHeader } from "@x402/core/http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { x402 } from "../src";
import {
  conflict,
  offersOf,
  options,
  paymentFor,
  stubKite,
  type StubKite,
} from "./stub";

let kite: StubKite;

vi.mock("@kite-01/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kite-01/sdk")>()),
  Kite: vi.fn(function () {
    return kite;
  }),
}));

const url = "https://blog.test/post";

const unpaid = async (handle: ReturnType<typeof x402>) => {
  const result = await handle(new Request(url));
  return result.response!;
};

const paid = (handle: ReturnType<typeof x402>, signature: string) => {
  return handle(
    new Request(url, { headers: { "PAYMENT-SIGNATURE": signature } }),
  );
};

beforeEach(() => {
  kite = stubKite();
});

describe("x402", () => {
  it("answers an unpaid request with one offer per USD-settled chain", async () => {
    const response = await unpaid(x402(options));

    expect(response.status).toBe(402);
    const required = offersOf(response);
    expect(await response.json()).toEqual(required);
    expect(required.resource.url).toBe(url);
    expect(
      required.accepts.map(({ network, amount }) => ({ network, amount })),
    ).toEqual([
      { network: "stellar:testnet", amount: "500000" },
      { network: "eip155:84532", amount: "50000" },
    ]);
  });

  it("reuses an open offer, and opens a new one once it stops answering", async () => {
    const handle = x402(options);

    const first = offersOf(await unpaid(handle)).accepts;
    expect(offersOf(await unpaid(handle)).accepts).toEqual(first);
    expect(kite.x402.pay).toHaveBeenCalledTimes(2);

    kite.x402.requirements.mockRejectedValueOnce(conflict("Quote has expired"));
    const third = offersOf(await unpaid(handle)).accepts;

    expect(kite.x402.pay).toHaveBeenCalledTimes(3);
    expect(third[0]!.payTo).not.toBe(first[0]!.payTo);
    expect(third[1]).toEqual(first[1]);
  });

  it("runs a paid request with PAYMENT-RESPONSE", async () => {
    const handle = x402(options);
    const signature = paymentFor(await unpaid(handle));

    const result = await paid(handle, signature);

    expect(result.response).toBeUndefined();
    expect(
      decodePaymentResponseHeader(result.headers!["PAYMENT-RESPONSE"]!),
    ).toMatchObject({ success: true, transaction: "0xhash" });
    expect(kite.x402.verify).toHaveBeenCalledOnce();
    expect(kite.x402.settle.mock.calls[0]![0].body).toMatchObject({
      x402Version: 2,
      paymentRequirements: { network: "stellar:testnet", amount: "500000" },
    });
  });

  it("unlocks once for the same payment sent twice", async () => {
    const handle = x402(options);
    const signature = paymentFor(await unpaid(handle));

    expect((await paid(handle, signature)).headers).toBeDefined();
    const again = await paid(handle, signature);

    expect(again.response!.status).toBe(402);
    expect(offersOf(again.response!).error).toBe(
      "This payment has already been used",
    );
    expect(kite.x402.settle).toHaveBeenCalledOnce();
  });

  it("refuses a payment for another price", async () => {
    const handle = x402(options);
    const signature = paymentFor(
      await unpaid(x402({ ...options, price: 0.01 })),
    );

    const result = await paid(handle, signature);

    expect(result.response!.status).toBe(402);
    expect(kite.x402.verify).not.toHaveBeenCalled();
  });

  it("turns a 409 from Kite into a 402", async () => {
    const handle = x402(options);
    const signature = paymentFor(await unpaid(handle));
    kite.x402.verify.mockRejectedValueOnce(
      conflict("Payment amount does not match the quote"),
    );

    const { response } = await paid(handle, signature);

    expect(response!.status).toBe(402);
    expect(offersOf(response!).error).toBe(
      "Payment amount does not match the quote",
    );
  });

  it("retries settlement_pending once", async () => {
    const handle = x402(options);
    const signature = paymentFor(await unpaid(handle));
    const pending = {
      data: {
        success: false,
        errorReason: "settlement_pending",
        transaction: "0xhash",
        network: "stellar:testnet",
      },
    };

    kite.x402.settle.mockResolvedValueOnce(pending);
    expect((await paid(handle, signature)).headers).toBeDefined();
    expect(kite.x402.settle).toHaveBeenCalledTimes(2);

    const next = paymentFor(await unpaid(handle), "eip155:84532");
    kite.x402.settle
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending);
    const { response } = await paid(handle, next);

    expect(response!.status).toBe(402);
    expect(response!.headers.has("PAYMENT-REQUIRED")).toBe(false);
    expect(
      decodePaymentResponseHeader(response!.headers.get("PAYMENT-RESPONSE")!),
    ).toMatchObject({ errorReason: "settlement_pending" });
  });

  it("drops a chain Kite can't price, when the route is first priced", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    kite.quotes.create.mockRejectedValueOnce(
      Object.assign(
        conflict("Fees exceed the amount this payment settles for"),
        {
          status: 400,
        },
      ),
    );

    const response = await unpaid(x402(options));

    expect(offersOf(response).accepts.map((a) => a.network)).toEqual([
      "eip155:84532",
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Fees exceed"));
  });

  it("lets free() requests through without paying", async () => {
    const handle = x402({
      ...options,
      free: (request) => request.headers.get("accept") === "text/html",
    });

    const result = await handle(
      new Request(url, { headers: { accept: "text/html" } }),
    );

    expect(result).toEqual({ headers: {} });
    expect(kite.chains.list).not.toHaveBeenCalled();
  });
});
