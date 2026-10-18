export class KiteError extends Error {
  override readonly name = "KiteError";

  constructor(
    message: string,
    /** The HTTP status, or undefined when no response came back. */
    readonly status: number | undefined,
    /** Kite's error code, such as "NotFound" or "ValidationError". */
    readonly code: string,
    readonly response?: Response,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

type ErrorBody = { error?: { code?: unknown; message?: unknown } | string };

export const toKiteError = (error: unknown, response?: Response) => {
  if (error instanceof KiteError) return error;

  if (!response) {
    return new KiteError(
      error instanceof Error ? error.message : "The request failed",
      undefined,
      "NetworkError",
      undefined,
      { cause: error },
    );
  }

  const body = (error ?? {}) as ErrorBody;
  const detail = typeof body.error === "object" ? body.error : undefined;
  const message =
    typeof detail?.message === "string"
      ? detail.message
      : typeof body.error === "string"
        ? body.error
        : `Kite answered ${response.status}`;

  return new KiteError(
    message,
    response.status,
    typeof detail?.code === "string" ? detail.code : "HttpError",
    response,
    { cause: error },
  );
};
