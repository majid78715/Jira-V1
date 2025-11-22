import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/index";

export async function startTestServer(): Promise<{
  baseURL: string;
  stop: () => Promise<void>;
}> {
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseURL = `http://127.0.0.1:${address.port}`;

  return {
    baseURL,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      })
  };
}
