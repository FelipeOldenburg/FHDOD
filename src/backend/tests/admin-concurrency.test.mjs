import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestApplication, dbGet, dbRun, hasTestDatabase } from "./helpers.mjs";

test("serializa cadastros concorrentes sem duplicar administradores ou deixar setores incompletos", { skip: !hasTestDatabase }, async (t) => {
  const app = await createTestApplication();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  async function api(path, method, body, cookie) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const setup = await api("/auth/setup", "POST", {
    name: "Administrador",
    email: "admin-concurrency@example.test",
    password: "Senha-inicial-concorrencia",
  });
  assert.equal(setup.status, 201);
  const changed = await api("/auth/password", "POST", {
    currentPassword: "Senha-inicial-concorrencia",
    newPassword: "Senha-definitiva-concorrencia",
  }, setup.cookie);
  assert.equal(changed.status, 200);
  const save = (path, method, body) => api(path, method, body, changed.cookie);
  for (const id of ["pending-users", "pending-sector"])
    await dbRun(app.db, "INSERT INTO sectors VALUES(?,?,?,?,1,?)", id, id, id, "", new Date().toISOString());

  const users = await Promise.all(Array.from({ length: 6 }, (_, index) => save("/users", "POST", {
    name: `Administrador ${index}`,
    email: `concurrent-${index}@example.test`,
    role: "sector_admin",
    sectorIds: ["pending-users"],
    temporaryPassword: "Senha-temporaria-concorrencia",
  })));
  assert.deepEqual(users.map((result) => result.status).sort(), [201, 409, 409, 409, 409, 409]);
  assert.equal((await dbGet(app.db,
    "SELECT count(*)::int AS total FROM users u JOIN user_sectors us ON us.user_id=u.id WHERE us.sector_id=? AND u.role='sector_admin'",
    "pending-users",
  )).total, 1);

  const configured = await Promise.all([0, 1].map((index) => save("/sectors/pending-sector", "PUT", {
    admin: { email: `configure-${index}@example.test`, temporaryPassword: "Senha-temporaria-concorrencia" },
  })));
  assert.deepEqual(configured.map((result) => result.status), [200, 200]);
  assert.equal(configured[0].body.user.id, configured[1].body.user.id);
  assert.equal((await dbGet(app.db,
    "SELECT count(*)::int AS total FROM users u JOIN user_sectors us ON us.user_id=u.id WHERE us.sector_id=? AND u.role='sector_admin'",
    "pending-sector",
  )).total, 1);

  const sectors = await Promise.all([0, 1].map((index) => save("/sectors", "POST", {
    name: `Setor concorrente ${index}`,
    slug: `setor-concorrente-${index}`,
    admin: { email: "same-email@example.test", temporaryPassword: "Senha-temporaria-concorrencia" },
  })));
  assert.deepEqual(sectors.map((result) => result.status).sort(), [201, 409]);
  assert.equal((await dbGet(app.db, "SELECT count(*)::int AS total FROM sectors WHERE slug LIKE 'setor-concorrente-%'")).total, 1);
});
