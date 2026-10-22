import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "./index.mjs";

test("preserva respostas e versões, exige troca de senha e isola dados por setor/perfil", async (t) => {
  const app = createApplication({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function api(path, method = "GET", body, cookie, extra = {}) {
    const result = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: result.status,
      body: await result.json(),
      cookie: result.headers.get("set-cookie")?.split(";")[0],
    };
  }
  assert.deepEqual((await api("/auth/setup")).body, {
    needsSetup: true,
    demo: false,
  });
  const installation = await api("/auth/setup", "POST", {
    name: "Admin Teste",
    email: "admin@example.test",
    password: "Senha-admin-temporaria-2026",
  });
  assert.equal(installation.status, 201);
  assert.equal(installation.body.user.mustChangePassword, true);
  assert.equal(
    (await api("/bootstrap", "GET", undefined, installation.cookie)).status,
    403,
  );
  const admin = await api(
    "/auth/password",
    "POST",
    {
      currentPassword: "Senha-admin-temporaria-2026",
      newPassword: "Senha-admin-teste-2026",
    },
    installation.cookie,
  );
  assert.equal(admin.status, 200);
  assert.equal(
    (
      await api("/auth/setup", "POST", {
        name: "Outro",
        email: "outro@example.test",
        password: "Outra-senha-123456",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api("/sectors", "POST", { name: "A", slug: "a" }, admin.cookie, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const a = (
    await api("/sectors", "POST", { name: "Setor A", slug: "a" }, admin.cookie)
  ).body.sector;
  const b = (
    await api("/sectors", "POST", { name: "Setor B", slug: "b" }, admin.cookie)
  ).body.sector;
  const survey = (
    await api(
      "/surveys",
      "POST",
      {
        sectorId: a.id,
        title: "Pesquisa A",
        questions: [
          {
            text: "Atendimento original",
            type: "rating",
            category: "Atendimento",
          },
        ],
      },
      admin.cookie,
    )
  ).body.survey;
  const next = (
    await api(
      "/surveys",
      "POST",
      { sectorId: a.id, title: "Pesquisa A2", active: true, questions: [] },
      admin.cookie,
    )
  ).body.survey;
  const surveys = (await api("/surveys", "GET", undefined, admin.cookie)).body
    .surveys;
  assert.equal(surveys.filter((s) => s.active).length, 1);
  assert.equal(surveys.find((s) => s.id === next.id).active, true);
  assert.equal(
    (await api(`/surveys/${survey.id}`, "PUT", { active: true }, admin.cookie))
      .status,
    200,
  );
  assert.equal(survey.questions.filter((q) => q.type === "nps").length, 1);
  const user = await api(
    "/users",
    "POST",
    {
      name: "Setor A",
      email: "a@example.test",
      role: "sector_admin",
      sectorIds: [a.id],
      temporaryPassword: "Senha-temporaria-2026",
    },
    admin.cookie,
  );
  assert.equal(user.status, 201);
  const login = await api("/auth/login", "POST", {
    email: "a@example.test",
    password: "Senha-temporaria-2026",
  });
  assert.equal(login.body.user.mustChangePassword, true);
  assert.equal(
    (await api("/bootstrap", "GET", undefined, login.cookie)).status,
    403,
  );
  const changed = await api(
    "/auth/password",
    "POST",
    {
      currentPassword: "Senha-temporaria-2026",
      newPassword: "Senha-nova-setor-2026",
    },
    login.cookie,
  );
  assert.equal(changed.body.user.mustChangePassword, false);
  assert.equal(
    (await api("/auth/me", "GET", undefined, login.cookie)).status,
    401,
  );
  const sectorCookie = changed.cookie;
  const bootstrap = (await api("/bootstrap", "GET", undefined, sectorCookie))
    .body;
  assert.deepEqual(
    bootstrap.sectors.map((s) => s.id),
    [a.id],
  );
  assert.equal(
    (await api(`/dashboard?sectorId=${b.id}`, "GET", undefined, sectorCookie))
      .status,
    403,
  );
  assert.equal(
    (
      await api(
        "/surveys",
        "POST",
        { sectorId: b.id, title: "Não autorizado" },
        sectorCookie,
      )
    ).status,
    403,
  );
  const draft = await api("/public/responses", "POST", {
    sectorId: a.id,
    attendedOn: "2026-01-20",
    shift: "manha",
  });
  assert.equal(draft.status, 201);
  const question = draft.body.questions.find((q) => q.type === "rating");
  assert.equal(
    (
      await api(`/public/responses/${draft.body.id}`, "PUT", {
        token: draft.body.token,
        questionId: question.id,
        value: 4,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        `/surveys/${survey.id}`,
        "PUT",
        {
          questions: [{ ...question, text: "Pergunta alterada", type: "text" }],
        },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(`/public/responses/${draft.body.id}`, "PUT", {
        token: draft.body.token,
        questionId: question.id,
        value: 5,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(`/public/responses/${draft.body.id}/submit`, "POST", {
        token: draft.body.token,
        nps: 11,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(`/public/responses/${draft.body.id}/submit`, "POST", {
        token: draft.body.token,
        nps: 9,
        comment: "Meu texto original",
        wantsContact: true,
        phone: "(51) 99999-9999",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(`/public/responses/${draft.body.id}`, "PUT", {
        token: draft.body.token,
        questionId: question.id,
        value: 2,
      })
    ).status,
    409,
  );
  const response = (await api("/responses", "GET", undefined, sectorCookie))
    .body.responses[0];
  assert.equal(
    response.answers.find((q) => q.questionId === question.id).questionText,
    "Atendimento original",
  );
  assert.equal(response.comment, "Meu texto original");
  assert.equal(response.phone, undefined);
  assert.equal(response.nps, 9);
  const manifestation = (
    await api("/manifestations", "GET", undefined, admin.cookie)
  ).body.manifestations[0];
  assert.equal(manifestation.phone, "(51) 99999-9999");
  assert.equal(
    (
      await api(
        `/manifestations/${manifestation.id}`,
        "PATCH",
        { comment: "Texto adulterado" },
        admin.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        `/manifestations/${manifestation.id}`,
        "PATCH",
        { status: "resolvida", internalNote: "Retorno realizado" },
        sectorCookie,
      )
    ).status,
    200,
  );
  const result = (await api("/dashboard", "GET", undefined, sectorCookie)).body;
  assert.equal(result.nps, 100);
  assert.equal(result.satisfaction, 5);
  assert.equal(result.responseCount, 1);
  assert.equal(result.pendingCount, 0);
  assert.deepEqual(result.ratingDistribution, [
    { score: 1, count: 0 },
    { score: 2, count: 0 },
    { score: 3, count: 0 },
    { score: 4, count: 0 },
    { score: 5, count: 1 },
  ]);
  assert.equal(
    result.distribution.find((bucket) => bucket.score === 9).count,
    1,
  );
  assert.equal(result.criticalCount, 0);
  assert.equal(
    (await api("/settings", "PUT", { lowScoreThreshold: 9 }, admin.cookie))
      .status,
    200,
  );
  assert.equal(
    (await api("/dashboard", "GET", undefined, sectorCookie)).body
      .criticalCount,
    1,
  );
  for (const [id, timestamp] of [
    ["timezone-a", "2040-01-02T01:30:00.000Z"],
    ["timezone-b", "2040-01-02T04:30:00.000Z"],
  ]) {
    app.db
      .prepare(
        "INSERT INTO responses(id,survey_id,sector_id,token_hash,status,questions_json,created_at) VALUES(?,?,?,?,'partial','[]',?)",
      )
      .run(id, survey.id, a.id, id, timestamp);
    app.db
      .prepare(
        "UPDATE responses SET status='submitted',submitted_at=?,nps=10 WHERE id=?",
      )
      .run(timestamp, id);
  }
  assert.equal(
    (
      await api(
        "/dashboard?from=2040-01-01&to=2040-01-01",
        "GET",
        undefined,
        sectorCookie,
      )
    ).body.responseCount,
    1,
  );
  assert.equal(
    (
      await api(
        "/responses?from=2040-01-02&to=2040-01-02",
        "GET",
        undefined,
        sectorCookie,
      )
    ).body.responses[0].id,
    "timezone-b",
  );
  assert.equal(
    (
      await api(
        "/dashboard?from=2040-01-01&to=2040-01-01&dateBasis=attendance",
        "GET",
        undefined,
        sectorCookie,
      )
    ).body.responseCount,
    0,
  );
  const viewer = await api(
    "/users",
    "POST",
    {
      name: "Visualizador",
      email: "viewer@example.test",
      role: "viewer",
      sectorIds: [a.id],
      temporaryPassword: "Senha-viewer-temporaria",
    },
    admin.cookie,
  );
  assert.equal(viewer.status, 201);
  const viewerLogin = await api("/auth/login", "POST", {
    email: "viewer@example.test",
    password: "Senha-viewer-temporaria",
  });
  const viewerChanged = await api(
    "/auth/password",
    "POST",
    {
      currentPassword: "Senha-viewer-temporaria",
      newPassword: "Senha-viewer-definitiva",
    },
    viewerLogin.cookie,
  );
  assert.equal(
    (await api("/responses", "GET", undefined, viewerChanged.cookie)).status,
    403,
  );
  assert.equal(
    (await api("/manifestations", "GET", undefined, viewerChanged.cookie))
      .status,
    403,
  );
  assert.equal(
    (await api("/dashboard", "GET", undefined, viewerChanged.cookie)).body
      .recent[0].comment,
    undefined,
  );
  assert.equal(
    (await api("/audit", "GET", undefined, sectorCookie)).status,
    403,
  );
  assert.equal(
    (
      await api(
        "/exports",
        "POST",
        { mode: "summary", filters: { sectorId: a.id } },
        viewerChanged.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        "/exports",
        "POST",
        { mode: "detailed", filters: { sectorId: a.id } },
        viewerChanged.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        "/exports",
        "POST",
        { mode: "detailed", filters: { sectorId: b.id } },
        sectorCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        "/exports",
        "POST",
        { mode: "detailed", filters: { from: "invalid" } },
        admin.cookie,
      )
    ).status,
    400,
  );
  assert.deepEqual(
    (
      await api(
        "/exports",
        "POST",
        {
          mode: "detailed",
          filters: { sectorId: a.id, from: "2040-01-01", to: "2040-01-02" },
        },
        admin.cookie,
      )
    ).body,
    { recorded: true },
  );
  const exportEvent = (
    await api("/audit", "GET", undefined, admin.cookie)
  ).body.events.find(
    (event) =>
      event.action === "export_generated" && event.details.mode === "detailed",
  );
  assert.deepEqual(exportEvent.details.filters, {
    sectorId: a.id,
    from: "2040-01-01",
    to: "2040-01-02",
  });
  assert.ok(
    (await api("/audit", "GET", undefined, admin.cookie)).body.events.length >
      0,
  );
  assert.equal(
    (
      await api(
        `/users/${user.body.user.id}`,
        "PUT",
        { sectorIds: [b.id] },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await api("/auth/me", "GET", undefined, sectorCookie)).status,
    401,
  );
  assert.throws(
    () =>
      app.db
        .prepare("UPDATE responses SET comment=? WHERE id=?")
        .run("Alterado", draft.body.id),
    /imutáveis/,
  );
});
