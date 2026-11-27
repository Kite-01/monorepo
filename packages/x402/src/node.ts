import type { IncomingHttpHeaders } from "node:http";

export const toRequest = (
  method: string,
  url: string,
  headers: IncomingHttpHeaders,
) => {
  const init = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    for (const item of [value ?? []].flat()) init.append(name, item);
  }

  return new Request(url, { method, headers: init });
};

export const body = async (response: Response) => {
  return Buffer.from(await response.arrayBuffer());
};
