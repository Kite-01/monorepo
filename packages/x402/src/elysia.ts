import { x402 as core, type X402Options } from "./index";

type Context = {
  request: Request;
  set: { headers: Record<string, string | number> };
};

/** A `beforeHandle` hook. */
export const x402 = (options: X402Options) => {
  const handle = core(options);

  return async ({ request, set }: Context) => {
    const result = await handle(request);
    if (result.response) return result.response;

    Object.assign(set.headers, result.headers);
  };
};
