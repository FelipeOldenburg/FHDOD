import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer, loadConfigFromFile } from "vite";
import { createApplication } from "../app.mjs";

test("permite login da mesma origem pelo proxy e bloqueia origens externas", async (t) => {
  const app = createApplication({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const target = `http://127.0.0.1:${app.server.address().port}`;
  const credentials = {
    email: "proxy@example.test",
    password: "Senha-temporaria-proxy-2026",
  };
  const setup = await fetch(`${target}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Admin Proxy", ...credentials }),
  });
  assert.equal(setup.status, 201);
  await setup.json();

  const { config } = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    fileURLToPath(new URL("../../../vite.config.ts", import.meta.url)),
  );
  const configuredProxy = config.server.proxy["/api"];
  const vite = await createServer({
    ...config,
    configFile: false,
    logLevel: "silent",
    server: {
      ...config.server,
      port: 0,
      open: false,
      hmr: false,
      proxy: {
        "/api":
          typeof configuredProxy === "string"
            ? target
            : { ...configuredProxy, target },
      },
    },
  });
  t.after(() => vite.close());
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const login = (headers = {}) =>
    fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "Sec-Fetch-Site": "same-origin",
        ...headers,
      },
      body: JSON.stringify(credentials),
    });

  const valid = await login();
  assert.equal(valid.status, 200, JSON.stringify(await valid.json()));
  assert.match(valid.headers.get("set-cookie"), /fhdod_session=/);
  for (const headers of [
    { Origin: "https://externo.example" },
    { "Sec-Fetch-Site": "cross-site" },
  ]) {
    const blocked = await login(headers);
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), {
      error: "Origem da solicitação não autorizada.",
    });
  }
});
