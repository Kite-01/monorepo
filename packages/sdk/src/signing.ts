import { encoder, fromBase64Url, toBase64Url, toHex } from "./encoding";

export type SignedRequest = {
  timestamp: string;
  nonce: string;
  method: string;
  target: string;
  body: string;
};

// Must match the server's signing string byte for byte.
export const signingString = async (request: SignedRequest) => {
  const bodyHash = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(request.body),
  );

  return [
    request.timestamp,
    request.nonce,
    request.method.toUpperCase(),
    request.target,
    toHex(bodyHash),
  ].join("\n");
};

export const importPrivateKey = (privateKey: string) =>
  crypto.subtle.importKey(
    "pkcs8",
    fromBase64Url(privateKey),
    { name: "Ed25519" },
    false,
    ["sign"],
  );

export const sign = async (key: CryptoKey, request: SignedRequest) => {
  const signature = await crypto.subtle.sign(
    "Ed25519",
    key,
    encoder.encode(await signingString(request)),
  );

  return toBase64Url(signature);
};

export const createNonce = () =>
  toHex(crypto.getRandomValues(new Uint8Array(16)));
