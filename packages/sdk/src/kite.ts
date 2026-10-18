import { createClient, createConfig, type Client } from "./gen/client";
import { createNonce, importPrivateKey, sign } from "./signing";
import { toKiteError } from "./errors";
import { Api } from "./gen/sdk.gen";

export type KiteAuth =
  /** The server's root key. Add an app id to act as that app. */
  | { rootKey: string; appId?: string }
  /** An API key: every request is signed with its private key. */
  | { apiKeyId: string; privateKey: string };

export type KiteOptions = {
  /** Where your Kite server runs, such as https://pay.example.com */
  baseUrl: string;
  auth: KiteAuth;
  fetch?: typeof fetch;
  /**
   * Root and private keys must stay on a server. Set this only when the code
   * runs somewhere a browser-like global is present but nobody else can read
   * it, such as a test environment.
   */
  dangerouslyAllowBrowser?: boolean;
};

const inBrowser = () =>
  typeof window !== "undefined" && typeof window.document !== "undefined";

const authenticate = (client: Client, auth: KiteAuth) => {
  if ("rootKey" in auth) {
    client.interceptors.request.use((request) => {
      request.headers.set("x-kite-root-key", auth.rootKey);
      if (auth.appId) request.headers.set("x-kite-app-id", auth.appId);
      return request;
    });
    return;
  }

  const key = importPrivateKey(auth.privateKey);

  client.interceptors.request.use(async (request, options) => {
    const url = new URL(request.url);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = createNonce();

    const signature = await sign(await key, {
      timestamp,
      nonce,
      method: request.method,
      target: `${url.pathname}${url.search}`,
      body: options.serializedBody ?? "",
    });

    request.headers.set("x-kite-api-key-id", auth.apiKeyId);
    request.headers.set("x-kite-timestamp", timestamp);
    request.headers.set("x-kite-nonce", nonce);
    request.headers.set("x-kite-signature", signature);
    return request;
  });
};

export class Kite extends Api {
  constructor(options: KiteOptions) {
    if (inBrowser() && !options.dangerouslyAllowBrowser) {
      throw new Error(
        "@kite-01/sdk holds secret keys and must not run in a browser. " +
          "Create payment links on your server and open them with @kite-01/js.",
      );
    }

    const client = createClient(
      createConfig({
        baseUrl: options.baseUrl,
        fetch: options.fetch,
        throwOnError: true,
      }),
    );

    authenticate(client, options.auth);
    client.interceptors.error.use((error, response) =>
      toKiteError(error, response),
    );

    super({ client });
  }
}
