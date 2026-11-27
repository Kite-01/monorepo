import type { MiddlewareHandler } from "hono";
import { x402 as core, type X402Options } from "./index";

export const x402 = (options: X402Options): MiddlewareHandler => {
  const handle = core(options);

  return async (c, next) => {
    const result = await handle(c.req.raw);
    if (result.response) return result.response;

    await next();
    for (const [name, value] of Object.entries(result.headers)) {
      c.header(name, value);
    }
  };
};
