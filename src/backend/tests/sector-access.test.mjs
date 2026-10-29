import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../app.mjs";

test("cria um login por setor e preserva vínculo, isolamento e revogação de acesso", async (t) => {
  const app = createApplication({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  async function api(path, method = "GET", body, cookie) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const initial = await api("/auth/setup", "POST", {
    name: "Admin Supremo",
    email: "supremo@example.test",
    password: "Senha-inicial-supremo",
  });
  const owner = await api(
    "/auth/password",
    "POST",
    {
      currentPassword: "Senha-inicial-supremo",
      newPassword: "Senha-final-supremo",
    },
    initial.cookie,
  );
  const save = (path, body, method = "PUT") =>
    api(path, method, body, owner.cookie);
  const read = (path, cookie = owner.cookie) =>
    api(path, "GET", undefined, cookie);
  const login = (email, password) =>
    api("/auth/login", "POST", { email, password });
  assert.equal(
    (await save("/sectors", { name: "Sem acesso", slug: "sem-acesso" }, "POST"))
      .status,
    400,
  );
  const created = await save(
    "/sectors",
    {
      name: "Recepção",
      slug: "recepcao",
      admin: {
        email: "recepcao@example.test",
        temporaryPassword: "Senha-inicial-recepcao",
      },
    },
    "POST",
  );
  assert.equal(created.status, 201);
  const { sector, user } = created.body;
  assert.equal(user.role, "sector_admin");
  assert.equal(user.name, sector.name);
  assert.deepEqual(user.sectorIds, [sector.id]);
  const other = await save(
    "/sectors",
    {
      name: "Triagem",
      slug: "triagem",
      admin: {
        email: "triagem@example.test",
        temporaryPassword: "Senha-inicial-triagem",
      },
    },
    "POST",
  );
  const sectorLogin = await login(user.email, "Senha-inicial-recepcao");
  assert.equal(sectorLogin.status, 200);
  assert.equal(sectorLogin.body.user.mustChangePassword, true);
  assert.equal((await read("/bootstrap", sectorLogin.cookie)).status, 403);
  const changed = await api(
    "/auth/password",
    "POST",
    {
      currentPassword: "Senha-inicial-recepcao",
      newPassword: "Senha-final-recepcao",
    },
    sectorLogin.cookie,
  );
  assert.equal(changed.status, 200);
  assert.equal((await read("/auth/me", sectorLogin.cookie)).status, 401);
  const bootstrap = await read("/bootstrap", changed.cookie);
  assert.deepEqual(
    bootstrap.body.sectors.map((s) => s.id),
    [sector.id],
  );
  assert.equal((await read("/bootstrap")).body.sectors.length, 2);
  assert.equal(
    (await read(`/dashboard?sectorId=${other.body.sector.id}`, changed.cookie))
      .status,
    403,
  );
  assert.equal(
    (await api("/users", "GET", undefined, changed.cookie)).status,
    403,
  );

  const account = {
    name: "Duplicado",
    email: "duplicado@example.test",
    role: "sector_admin",
    sectorIds: [sector.id],
    temporaryPassword: "Senha-inicial-duplicado",
  };
  assert.equal((await save("/users", account, "POST")).status, 409);
  assert.equal(
    (
      await save(
        "/users",
        { ...account, sectorIds: [sector.id, other.body.sector.id] },
        "POST",
      )
    ).status,
    400,
  );
  assert.equal(
    (await save(`/users/${user.id}`, { sectorIds: [other.body.sector.id] }))
      .status,
    400,
  );
  assert.equal(
    (await save(`/users/${user.id}`, { role: "viewer" })).status,
    400,
  );
  assert.equal((await read("/auth/me", changed.cookie)).status, 200);

  const count = app.db
    .prepare("SELECT COUNT(*) AS total FROM sectors")
    .get().total;
  assert.equal(
    (
      await save(
        "/sectors",
        {
          name: "Não deve existir",
          slug: "rollback",
          admin: {
            email: user.email,
            temporaryPassword: "Senha-inicial-rollback",
          },
        },
        "POST",
      )
    ).status,
    409,
  );
  assert.equal(
    app.db.prepare("SELECT COUNT(*) AS total FROM sectors").get().total,
    count,
  );
  assert.equal(
    (
      await save(`/sectors/${sector.id}`, {
        name: "Não deve mudar",
        admin: { email: "triagem@example.test" },
      })
    ).status,
    409,
  );
  assert.equal(
    app.db.prepare("SELECT name FROM sectors WHERE id=?").get(sector.id).name,
    "Recepção",
  );

  const reset = await save(`/sectors/${sector.id}`, {
    name: "Recepção geral",
    admin: {
      email: "recepcao-nova@example.test",
      temporaryPassword: "Senha-redefinida-recepcao",
    },
  });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.user.id, user.id);
  assert.equal(reset.body.user.name, "Recepção geral");
  assert.equal((await read("/auth/me", changed.cookie)).status, 401);
  assert.equal((await login(user.email, "Senha-final-recepcao")).status, 401);
  const resetLogin = await login(
    reset.body.user.email,
    "Senha-redefinida-recepcao",
  );
  assert.equal(resetLogin.body.user.mustChangePassword, true);
  const resetChanged = await api(
    "/auth/password",
    "POST",
    {
      currentPassword: "Senha-redefinida-recepcao",
      newPassword: "Senha-final-recepcao-nova",
    },
    resetLogin.cookie,
  );
  assert.equal(
    (await save(`/sectors/${sector.id}`, { active: false })).status,
    200,
  );
  assert.equal((await read("/auth/me", resetChanged.cookie)).status, 401);
  assert.equal(
    (await login(reset.body.user.email, "Senha-final-recepcao-nova")).status,
    401,
  );
  assert.equal(
    (await save(`/sectors/${sector.id}`, { active: true })).status,
    200,
  );
  assert.equal((await read("/auth/me", resetChanged.cookie)).status, 401);
  assert.equal(
    (await login(reset.body.user.email, "Senha-final-recepcao-nova")).status,
    200,
  );
  await save(`/users/${user.id}`, { active: false });
  await save(`/sectors/${sector.id}`, { active: false });
  await save(`/sectors/${sector.id}`, { active: true });
  assert.equal(
    (await login(reset.body.user.email, "Senha-final-recepcao-nova")).status,
    401,
  );
  await save(`/users/${user.id}`, { active: true });

  // Dados legados exigem correção explícita; não são migrados nem apagados ao iniciar.
  app.db
    .prepare("INSERT INTO sectors VALUES(?,?,?,?,?,?)")
    .run("legacy", "Legado", "legado", "", 1, new Date().toISOString());
  const configured = await save("/sectors/legacy", {
    admin: {
      email: "legado@example.test",
      temporaryPassword: "Senha-inicial-legado",
    },
  });
  assert.equal(configured.status, 200);
  assert.equal(
    (await login(reset.body.user.email, "Senha-final-recepcao-nova")).status,
    200,
  );
  app.db.prepare("INSERT INTO user_sectors VALUES(?,?)").run(user.id, "legacy");
  assert.equal(
    (await login(reset.body.user.email, "Senha-final-recepcao-nova")).status,
    409,
  );
  assert.equal(
    (
      await save(`/sectors/${sector.id}`, {
        admin: { email: "outro@example.test" },
      })
    ).status,
    409,
  );
  const legacyAccount = app.db
    .prepare("SELECT * FROM users WHERE id=?")
    .get(user.id);
  const metadata = await save(`/sectors/${sector.id}`, {
    name: "Recepção atualizada",
    description: "Descrição atualizada",
  });
  assert.equal(metadata.status, 200);
  assert.equal(metadata.body.sector.name, "Recepção atualizada");
  assert.equal(metadata.body.sector.description, "Descrição atualizada");
  assert.equal(metadata.body.user, undefined);
  assert.deepEqual(
    app.db.prepare("SELECT * FROM users WHERE id=?").get(user.id),
    legacyAccount,
  );
  assert.ok(
    app.db
      .prepare("SELECT COUNT(*) AS total FROM sessions WHERE user_id=?")
      .get(user.id).total > 0,
  );
  assert.equal(
    (await save(`/sectors/${sector.id}`, { active: false })).status,
    200,
  );
  assert.equal(
    app.db
      .prepare("SELECT COUNT(*) AS total FROM sessions WHERE user_id=?")
      .get(user.id).total,
    0,
  );
  assert.deepEqual(
    app.db.prepare("SELECT * FROM users WHERE id=?").get(user.id),
    legacyAccount,
  );
  assert.equal(
    (await save(`/sectors/${sector.id}`, { active: true })).status,
    200,
  );
  assert.equal(
    (await save(`/users/${user.id}`, { sectorIds: [sector.id] })).status,
    200,
  );
  assert.equal(
    (await login(reset.body.user.email, "Senha-final-recepcao-nova")).status,
    200,
  );

  app.db
    .prepare(
      "INSERT INTO users SELECT 'legacy-duplicate',name,'duplicado@example.test',password_hash,role,must_change_password,active,created_at FROM users WHERE id=?",
    )
    .run(user.id);
  app.db
    .prepare("INSERT INTO user_sectors VALUES(?,?)")
    .run("legacy-duplicate", sector.id);
  assert.equal(
    (await login(reset.body.user.email, "Senha-final-recepcao-nova")).status,
    409,
  );
  assert.equal(
    (await save("/users/legacy-duplicate", { role: "viewer" })).status,
    200,
  );
  assert.equal(
    (await login(reset.body.user.email, "Senha-final-recepcao-nova")).status,
    200,
  );

  const audit = (await read("/audit")).body.events;
  assert.ok(
    audit.some(
      (event) =>
        event.targetId === user.id && event.details.passwordReset === true,
    ),
  );
  assert.ok(!JSON.stringify(audit).includes("Senha-redefinida-recepcao"));
});
