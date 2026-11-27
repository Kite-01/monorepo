import type { preHandlerAsyncHookHandler } from "fastify";
import { x402 as core, type X402Options } from "./index";
import { body, toRequest } from "./node";

/** A `preHandler` hook. */
export const x402 = (options: X402Options): preHandlerAsyncHookHandler => {
  const handle = core(options);

  return async (request, reply) => {
    const url = `${request.protocol}://${request.host}${request.url}`;
    const result = await handle(
      toRequest(request.method, url, request.headers),
    );

    if (result.response) {
      return reply
        .code(result.response.status)
        .headers(Object.fromEntries(result.response.headers))
        .send(await body(result.response));
    }

    reply.headers(result.headers);
  };
};
