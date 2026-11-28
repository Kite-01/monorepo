import {
  Kite,
  KiteError,
  type KiteAuth,
  type X402PaymentRequirements,
} from "@kite-01/sdk";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";

/** Where settled payments are recorded, so each unlocks one request. */
export type SettledStore = {
  has: (payTo: string) => boolean | Promise<boolean>;
  add: (payTo: string) => unknown;
};

export type X402Options = {
  /** Your Kite server, such as https://pay.example.com */
  baseUrl: string;
  /** An API key with the `x402` and `quotes:write` scopes. */
  auth: KiteAuth;
  /** USD per request, such as 0.05. */
  price: number | string;
  /** Lets a request through without paying. */
  free?: (request: Request) => boolean;
  /** Defaults to an in-memory set. */
  settled?: SettledStore;
};

/** Send `response` as it is, or run the route and add `headers` to its response. */
export type X402Result =
  | { response: Response; headers?: never }
  | { headers: Record<string, string>; response?: never };

type Chain = {
  network: string;
  chainId: string;
  asset: string;
  amount: string;
};

type Offer = { transferId: string; requirements: X402PaymentRequirements };

const toBaseUnits = (usd: string, decimals: number) => {
  const [whole, fraction = ""] = usd.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole + fraction.padEnd(decimals, "0")).toString();
};

const json = (status: number, body: unknown, headers: HeadersInit = {}) => {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
  for (const [name, value] of new Headers(headers)) {
    response.headers.set(name, value);
  }
  return response;
};

const refused = (error: unknown) => {
  return error instanceof KiteError && error.status !== undefined;
};

export const x402 = (options: X402Options) => {
  const usd = String(options.price);
  if (!/^\d+(\.\d+)?$/.test(usd) || Number(usd) <= 0) {
    throw new Error(`price must be a positive USD amount, got ${usd}`);
  }

  const kite = new Kite({
    baseUrl: options.baseUrl.replace(/\/$/, ""),
    auth: options.auth,
  });
  const settled = options.settled ?? new Set<string>();
  const offers = new Map<string, Promise<Offer>>();
  let pricing: Promise<Chain[]> | undefined;

  const open = (chain: Chain) => {
    const opening = (async () => {
      const { data: quote } = await kite.quotes.create({
        body: {
          chainId: chain.chainId,
          sourceTokenAddress: chain.asset,
          amount: chain.amount,
        },
      });
      const { data: transfer } = await kite.x402.pay({
        body: { quoteId: quote.id },
      });
      const { data: requirements } = await kite.x402.requirements({
        path: { id: transfer.id },
      });
      return { transferId: transfer.id, requirements };
    })();

    offers.set(chain.network, opening);
    opening.catch(() => {
      if (offers.get(chain.network) === opening) offers.delete(chain.network);
    });
    return opening;
  };

  const offer = async (chain: Chain): Promise<X402PaymentRequirements> => {
    const current = offers.get(chain.network);
    if (!current) return (await open(chain)).requirements;

    try {
      const { transferId } = await current;
      const { data } = await kite.x402.requirements({
        path: { id: transferId },
      });
      return data;
    } catch (error) {
      if (!refused(error)) throw error;
      if (offers.get(chain.network) === current) {
        return (await open(chain)).requirements;
      }
      return offer(chain);
    }
  };

  const price = async () => {
    const [{ data: chains }, { data: supported }] = await Promise.all([
      kite.chains.list(),
      kite.x402.supported(),
    ]);

    const usdChains = chains.data.flatMap((chain): Chain[] => {
      const token = chain.settlementToken;
      if (!token || token.id !== chain.usdPeggedToken?.id) return [];

      const accepted = supported.kinds.some(
        (kind) =>
          kind.network === chain.caip2Id && kind.extra?.asset === token.address,
      );
      const amount = toBaseUnits(usd, token.decimals);
      if (!accepted || !amount) return [];

      return [
        {
          network: chain.caip2Id,
          chainId: chain.id,
          asset: token.address,
          amount,
        },
      ];
    });

    const opened = await Promise.allSettled(usdChains.map(open));
    const priced = usdChains.filter((chain, i) => {
      const result = opened[i]!;
      if (result.status === "fulfilled" || !refused(result.reason)) return true;

      console.warn(
        `[@kite-01/x402] Not offering ${chain.network}: ${(result.reason as Error).message}`,
      );
      return false;
    });

    if (!priced.length) {
      throw new Error(
        `Kite can't price ${usd} USD on any chain this app accepts that settles in a USD stablecoin`,
      );
    }
    return priced;
  };

  const challenge = async (request: Request, error?: string) => {
    const chains = await pricing!;
    const accepts = await Promise.allSettled(chains.map(offer));
    const required: PaymentRequired = {
      x402Version: 2,
      ...(error ? { error } : {}),
      resource: { url: request.url },
      accepts: accepts.flatMap((result) =>
        result.status === "fulfilled"
          ? [result.value as PaymentRequirements]
          : [],
      ),
    };

    if (!required.accepts.length) {
      throw new Error("No chain has an open x402 offer", {
        cause: accepts.find((result) => result.status === "rejected")?.reason,
      });
    }

    return {
      response: json(402, required, {
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required),
      }),
    };
  };

  const settle = async (request: Request, payment: PaymentPayload) => {
    const accepted = payment.accepted;
    const chain = (await pricing!).find((c) => c.network === accepted.network);

    if (
      accepted.scheme !== "exact" ||
      accepted.asset !== chain?.asset ||
      accepted.amount !== chain.amount
    ) {
      return challenge(
        request,
        "The payment doesn't match this resource's price",
      );
    }

    if (await settled.has(accepted.payTo)) {
      return challenge(request, "This payment has already been used");
    }

    const body = {
      x402Version: payment.x402Version,
      paymentPayload: payment,
      paymentRequirements: accepted,
    };

    const { data: verified } = await kite.x402.verify({ body });
    if (!verified.isValid) {
      return challenge(
        request,
        verified.invalidMessage ?? verified.invalidReason ?? "Invalid payment",
      );
    }

    let { data: result } = await kite.x402.settle({ body });
    if (result.errorReason === "settlement_pending") {
      ({ data: result } = await kite.x402.settle({ body }));
    }

    const header = {
      "PAYMENT-RESPONSE": encodePaymentResponseHeader(result as SettleResponse),
    };

    if (result.errorReason === "settlement_pending") {
      return { response: json(402, {}, header) };
    }

    if (!result.success) {
      return challenge(
        request,
        result.errorMessage ?? result.errorReason ?? "Settlement failed",
      );
    }

    if (await settled.has(accepted.payTo)) {
      return challenge(request, "This payment has already been used");
    }
    await settled.add(accepted.payTo);

    return { headers: header };
  };

  return async (request: Request): Promise<X402Result> => {
    if (options.free?.(request)) return { headers: {} };

    if (!pricing) {
      pricing = price();
      pricing.catch((error) => {
        if (error instanceof KiteError) pricing = undefined;
      });
    }

    const signature = request.headers.get("PAYMENT-SIGNATURE");
    if (!signature) return challenge(request);

    let payment: PaymentPayload;
    try {
      payment = decodePaymentSignatureHeader(signature);
    } catch {
      return challenge(request, "Invalid PAYMENT-SIGNATURE header");
    }

    if (payment.x402Version !== 2 || !payment.accepted) {
      return challenge(request, "Only x402 version 2 payments are accepted");
    }

    try {
      return await settle(request, payment);
    } catch (error) {
      if (refused(error)) {
        return challenge(request, (error as Error).message);
      }
      throw error;
    }
  };
};
