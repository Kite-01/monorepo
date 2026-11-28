import { NextResponse } from "next/server";
import { x402 as core, type X402Options } from "./index";

/** For `middleware.ts` or `proxy.ts`; pick the paid routes with `config.matcher`. */
export const x402 = (options: X402Options) => {
  const handle = core(options);

  return async (request: Request) => {
    const result = await handle(request);
    if (result.response) return result.response;

    return NextResponse.next({ headers: result.headers });
  };
};

/** Wraps an App Router route handler. */
export const withX402 = <R extends Request, C>(
  options: X402Options,
  handler: (request: R, context: C) => Response | Promise<Response>,
) => {
  const handle = core(options);

  return async (request: R, context: C) => {
    const result = await handle(request);
    if (result.response) return result.response;

    const response = await handler(request, context);
    for (const [name, value] of Object.entries(result.headers)) {
      response.headers.set(name, value);
    }
    return response;
  };
};
