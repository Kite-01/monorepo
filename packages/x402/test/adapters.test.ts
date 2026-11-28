import { Elysia } from "elysia";
import express from "express";
import Fastify from "fastify";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { x402 as elysia } from "../src/elysia";
import { x402 as forExpress } from "../src/express";
import { x402 as forFastify } from "../src/fastify";
import { x402 as hono } from "../src/hono";
import { x402 as nextMiddleware, withX402 } from "../src/next";
import { options, paymentFor, stubKite, type StubKite } from "./stub";

let kite: StubKite;

vi.mock("@kite-01/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kite-01/sdk")>()),
  Kite: vi.fn(function () {
    return kite;
  }),
}));

beforeEach(() => {
  kite = stubKite();
});

/** An unpaid request gets the 402; paying it runs the route with PAYMENT-RESPONSE. */
const expectWired = async (
  send: (headers?: HeadersInit) => Response | Promise<Response>,
) => {
  const unpaid = await send();
  expect(unpaid.status).toBe(402);
  expect(unpaid.headers.get("PAYMENT-REQUIRED")).toBeTruthy();

  const paid = await send({ "PAYMENT-SIGNATURE": paymentFor(unpaid) });
  expect(paid.status).toBe(200);
  expect(await paid.text()).toBe("post");
  expect(paid.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
};

const url = "http://localhost/post";

describe("adapters", () => {
  it("hono", async () => {
    const app = new Hono().get("/post", hono(options), (c) => c.text("post"));

    await expectWired((headers) => app.request(url, { headers }));
  });

  it("elysia", async () => {
    const app = new Elysia().get("/post", () => "post", {
      beforeHandle: elysia(options),
    });

    await expectWired((headers) => app.handle(new Request(url, { headers })));
  });

  it("next route handler", async () => {
    const GET = withX402(options, () => new Response("post"));

    await expectWired((headers) => GET(new Request(url, { headers }), {}));
  });

  it("next middleware", async () => {
    const middleware = nextMiddleware(options);
    const route = async (headers?: HeadersInit) => {
      const response = await middleware(new Request(url, { headers }));
      if (response.headers.get("x-middleware-next") !== "1") return response;

      return new Response("post", { headers: response.headers });
    };

    await expectWired(route);
  });

  it("express", async () => {
    const app = express().get("/post", forExpress(options), (_req, res) => {
      res.send("post");
    });
    const server = app.listen(0);
    const { port } = server.address() as { port: number };

    try {
      await expectWired((headers) =>
        fetch(`http://localhost:${port}/post`, { headers }),
      );
    } finally {
      server.close();
    }
  });

  it("fastify", async () => {
    const app = Fastify().get(
      "/post",
      { preHandler: forFastify(options) },
      async () => "post",
    );

    await expectWired(async (headers) => {
      const response = await app.inject({
        url: "/post",
        headers: Object.fromEntries(new Headers(headers)),
      });
      return new Response(response.body, {
        status: response.statusCode,
        headers: response.headers as Record<string, string>,
      });
    });
  });
});
