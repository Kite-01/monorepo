import { KiteError } from "@kite-01/sdk";
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { vi } from "vitest";

const token = (id: string, address: string, decimals: number) => ({
  id,
  address,
  decimals,
});

const chains = [
  {
    id: "stellar",
    caip2Id: "stellar:testnet",
    settlementToken: token("usdc-xlm", "CUSDC", 7),
    usdPeggedToken: token("usdc-xlm", "CUSDC", 7),
  },
  {
    id: "base",
    caip2Id: "eip155:84532",
    settlementToken: token("usdc-base", "0xusdc", 6),
    usdPeggedToken: token("usdc-base", "0xusdc", 6),
  },
  {
    id: "gno",
    caip2Id: "gno:test",
    settlementToken: token("gnot", "ugnot", 6),
    usdPeggedToken: token("tusd", "tusd", 6),
  },
];

export const options = {
  baseUrl: "https://kite.test/",
  auth: { apiKeyId: "key", privateKey: "secret" },
  price: 0.05,
};

export const conflict = (message: string) => {
  return new KiteError(message, 409, "PreconditionFailed");
};

export const stubKite = () => {
  const transfers = new Map<string, { chainId: string; amount: string }>();
  const quotes = new Map<string, { chainId: string; amount: string }>();

  const requirements = (id: string) => {
    const transfer = transfers.get(id)!;
    const chain = chains.find((c) => c.id === transfer.chainId)!;
    return {
      scheme: "exact",
      network: chain.caip2Id,
      asset: chain.settlementToken.address,
      amount: transfer.amount,
      payTo: `pay-${id}`,
      maxTimeoutSeconds: 300,
      extra: {},
    };
  };

  return {
    chains: {
      list: vi.fn(async () => ({ data: { data: chains } })),
    },
    quotes: {
      create: vi.fn(async ({ body }) => {
        const id = `quote-${quotes.size + 1}`;
        quotes.set(id, body);
        return { data: { id } };
      }),
    },
    x402: {
      supported: vi.fn(async () => ({
        data: {
          kinds: chains.map((c) => ({
            x402Version: 2,
            scheme: "exact",
            network: c.caip2Id,
            extra: { asset: c.settlementToken.address },
          })),
        },
      })),
      pay: vi.fn(async ({ body }) => {
        const id = `transfer-${transfers.size + 1}`;
        transfers.set(id, quotes.get(body.quoteId)!);
        return { data: { id } };
      }),
      requirements: vi.fn(async ({ path }) => ({
        data: requirements(path.id),
      })),
      verify: vi.fn(async () => ({ data: { isValid: true } })),
      settle: vi.fn(async ({ body }): Promise<{ data: object }> => ({
        data: {
          success: true,
          transaction: "0xhash",
          network: body.paymentRequirements.network,
          payer: "payer",
        },
      })),
    },
  };
};

export type StubKite = ReturnType<typeof stubKite>;

export const offersOf = (response: Response) => {
  return decodePaymentRequiredHeader(response.headers.get("PAYMENT-REQUIRED")!);
};

/** Signs nothing: the stubbed Kite accepts any payload. */
export const paymentFor = (response: Response, network = "stellar:testnet") => {
  const accepted = offersOf(response).accepts.find(
    (offer) => offer.network === network,
  )!;

  return encodePaymentSignatureHeader({
    x402Version: 2,
    accepted,
    payload: { transaction: "signed" },
  });
};
