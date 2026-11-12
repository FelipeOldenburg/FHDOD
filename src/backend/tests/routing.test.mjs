import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApiController } from "../controllers/api-controller.mjs";
import { createAuthController } from "../controllers/auth-controller.mjs";
import { createTvWallController } from "../controllers/tv-wall-controller.mjs";
import { createApiRoutes } from "../routes/api.mjs";

test("cookies seguros funcionam em requisições serverless sem socket", async () => {
  const headers = {};
  const req = { headers: { "x-forwarded-proto": "https" }, socket: null };
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  const send = (value, status = 200) => ({ value, status });
  const auth = createAuthController({
    auth: {
      login: async () => ({ user: { id: "admin" }, token: "session-token" }),
    },
    readBody: async () => ({}),
    rateLimit: () => {},
    demo: false,
  });
  const login = await auth.login({ req, res, send });
  assert.deepEqual(login, { value: { user: { id: "admin" } }, status: 200 });
  assert.match(headers["Set-Cookie"], /fhdod_session=session-token/);
  assert.match(headers["Set-Cookie"], /; Secure$/);

  const tvWall = createTvWallController({
    tvWall: {
      pair: async () => ({ token: "tv-token", device: { id: "tv" } }),
    },
    readBody: async () => ({ code: "123456" }),
    rateLimit: () => {},
  });
  const paired = await tvWall.pair({ req, res, send });
  assert.deepEqual(paired, { value: { device: { id: "tv" } }, status: 200 });
  assert.match(headers["Set-Cookie"], /fhdod_tv=tv-token/);
  assert.match(headers["Set-Cookie"], /; Secure$/);
});

test("métodos de criação e atualização exigem o caminho correto antes de chamar o controller", async (t) => {
  const calls = [];
  const handle = ({ method, params, send }) => {
    calls.push({ method, params });
    return send({ handled: true });
  };
  const routes = createApiRoutes({
    auth: { me: handle, password: handle },
    admin: { sectors: handle, users: handle },
    survey: { list: handle, save: handle, deactivate: handle },
    reports: { responses: handle, dashboard: handle, export: handle },
    management: { bootstrap: handle, manifestations: handle, settings: handle, audit: handle },
    tvWall: { devices: handle, pairingCode: handle },
  });
  const server = createServer(createApiController({
    root: process.cwd(),
    routes,
    authenticate: async () => ({ id: "admin", role: "superadmin", mustChangePassword: false }),
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  for (const resource of ["surveys", "sectors", "users"]) {
    for (const [method, path] of [["PUT", resource], ["PATCH", resource], ["POST", `${resource}/existing`]]) {
      const response = await fetch(`${base}/${path}`, { method });
      assert.equal(response.status, 405, `${method} /api/${path} deve ser rejeitado`);
      assert.equal((await response.json()).error, "Método não permitido.");
    }
  }
  assert.deepEqual(calls, [], "requisições inválidas não podem chegar a um controller que grave dados");

  for (const [method, path] of [["POST", "surveys"], ["PUT", "surveys/existing"], ["PATCH", "surveys/existing"]]) {
    const response = await fetch(`${base}/${path}`, { method });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { handled: true });
  }
  assert.deepEqual(calls, [
    { method: "POST", params: [] },
    { method: "PUT", params: ["existing"] },
    { method: "PATCH", params: ["existing"] },
  ]);
});
