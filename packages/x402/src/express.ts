import type { RequestHandler } from "express";
import { x402 as core, type X402Options } from "./index";
import { body, toRequest } from "./node";

export const x402 = (options: X402Options): RequestHandler => {
  const handle = core(options);

  return async (req, res, next) => {
    try {
      const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      const result = await handle(toRequest(req.method, url, req.headers));

      if (result.response) {
        res.status(result.response.status);
        res.set(Object.fromEntries(result.response.headers));
        res.end(await body(result.response));
        return;
      }

      res.set(result.headers);
      next();
    } catch (error) {
      next(error);
    }
  };
};
