import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestApplication, dbGet, dbRun, hasTestDatabase } from "./helpers.mjs";
import { passwordHash } from "../services/auth-service.mjs";
import { normalizeQuestions } from "../services/survey-service.mjs";

async function start(t) {
  const app = await createTestApplication();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const api = async (path, method = "GET", body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie") };
  };
  return { ...app, api };
}

test("leitura pública entrega áudio WAV não vazio e aceita a leitura parcial de navegadores móveis", async (t) => {
  const app = await createTestApplication();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}/api/public/survey-speech`;
  const url = `${base}?${new URLSearchParams({ text: "Sua opinião faz a diferença." })}`;

  const probe = await fetch(url, { headers: { Range: "bytes=0-1" } });
  assert.equal(probe.status, 206);
  assert.equal(probe.headers.get("accept-ranges"), "bytes");
  assert.match(probe.headers.get("content-range"), /^bytes 0-1\/\d+$/);
  assert.equal(await probe.text(), "RI");

  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/wav");
  const wave = Buffer.from(await response.arrayBuffer());
  assert.equal(wave.toString("ascii", 0, 4), "RIFF");
  assert.equal(wave.toString("ascii", 8, 12), "WAVE");
  assert.equal(wave.readUInt32LE(40), wave.length - 44);
  assert.ok(wave.subarray(44).some((byte) => byte !== 0));

  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get("content-length")), wave.length);
  const outOfRange = await fetch(url, { headers: { Range: `bytes=${wave.length}-` } });
  assert.equal(outOfRange.status, 416);
  assert.equal(outOfRange.headers.get("content-range"), `bytes */${wave.length}`);
  assert.equal((await fetch(base)).status, 400);
  assert.equal((await fetch(url, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
});

test("login valida o setor antes de criar sessão e devolve o usuário resolvido", { skip: !hasTestDatabase }, async (t) => {
  const { db, api } = await start(t);
  const timestamp = new Date().toISOString();
  const password = "Senha-regressao-login-2026";
  await dbRun(db, "INSERT INTO sectors VALUES('sector','Setor','setor','',0,?)", timestamp);
  await dbRun(db,
    "INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES('admin','Admin','setor@example.test',?,'sector_admin',?)",
    passwordHash(password), timestamp,
  );
  await dbRun(db, "INSERT INTO user_sectors VALUES('admin','sector')");
  const credentials = { email: "setor@example.test", password };
  const inactive = await api("/auth/login", "POST", credentials);
  assert.equal(inactive.status, 401);
  assert.equal(inactive.cookie, null);
  assert.equal((await dbGet(db, "SELECT COUNT(*)::int AS total FROM sessions")).total, 0);

  await dbRun(db, "UPDATE sectors SET active=1 WHERE id='sector'");
  const valid = await api("/auth/login", "POST", credentials);
  assert.equal(valid.status, 200);
  assert.equal(valid.body.user.id, "admin");
  assert.equal(valid.body.user.mustChangePassword, true);
  assert.deepEqual(valid.body.user.sectorIds, ["sector"]);
  assert.match(valid.cookie, /fhdod_session=/);
  assert.doesNotMatch(valid.cookie, /Max-Age=/);
  const defaultSession = await dbGet(
    db,
    "SELECT expires_at FROM sessions WHERE user_id='admin'",
  );
  assert.ok(Date.parse(defaultSession.expires_at) <= Date.now() + 8 * 60 * 60 * 1000 + 5_000);

  await dbRun(db, "DELETE FROM sessions WHERE user_id='admin'");
  const remembered = await api("/auth/login", "POST", {
    ...credentials,
    rememberMe: true,
  });
  assert.equal(remembered.status, 200);
  assert.match(remembered.cookie, /Max-Age=31536000/);
  const rememberedSession = await dbGet(
    db,
    "SELECT expires_at FROM sessions WHERE user_id='admin'",
  );
  assert.ok(
    Date.parse(rememberedSession.expires_at) >=
      Date.now() + 364 * 24 * 60 * 60 * 1000,
  );

  await dbRun(db, "INSERT INTO sectors VALUES('legacy','Legado','legado','',1,?)", timestamp);
  await dbRun(db, "INSERT INTO user_sectors VALUES('admin','legacy')");
  const invalid = await api("/auth/login", "POST", credentials);
  assert.equal(invalid.status, 409);
  assert.equal(invalid.cookie, null);
  assert.equal((await dbGet(db, "SELECT COUNT(*)::int AS total FROM sessions")).total, 1);
});

test("configurações iniciais simultâneas criam apenas um Super Admin", { skip: !hasTestDatabase }, async (t) => {
  const { db, api } = await start(t);
  const results = await Promise.all(["a", "b"].map((name) => api("/auth/setup", "POST", {
    name, email: `${name}@example.test`, password: "Senha-inicial-concorrente-2026",
  })));
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal((await dbGet(db, "SELECT COUNT(*)::int AS total FROM users")).total, 1);
  assert.equal((await dbGet(db, "SELECT COUNT(*)::int AS total FROM sessions")).total, 1);
});

test("envios simultâneos preservam uma conclusão e bloqueiam novas respostas", { skip: !hasTestDatabase }, async (t) => {
  const { db, api } = await start(t);
  const timestamp = new Date().toISOString();
  const questions = normalizeQuestions([{ id: "rating", text: "Atendimento", type: "rating" }]);
  await dbRun(db, "INSERT INTO sectors VALUES('sector','Setor','setor','',1,?)", timestamp);
  await dbRun(db, "INSERT INTO surveys VALUES('survey','sector','Pesquisa','',1,?,?,?)", JSON.stringify(questions), timestamp, timestamp);
  const started = await api("/public/responses", "POST", { sectorId: "sector" });
  assert.equal(started.status, 201);
  const { id, token } = started.body;
  assert.equal((await api(`/public/responses/${id}`, "PUT", { token, questionId: "rating", value: 5 })).status, 200);
  const submissions = [
    { token, nps: 9, comment: "Primeiro relato", wantsContact: true, phone: "(51) 99999-9999" },
    { token, nps: 1, comment: "Segundo relato", wantsContact: false },
  ];
  const results = await Promise.all(submissions.map((body) => api(`/public/responses/${id}/submit`, "POST", body)));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const expected = submissions[results.findIndex((result) => result.status === 200)];
  const response = await dbGet(db, "SELECT * FROM responses WHERE id=?", id);
  assert.equal(response.status, "submitted");
  assert.equal(response.nps, expected.nps);
  assert.equal(response.comment, expected.comment);
  assert.equal(response.phone, expected.phone || "");
  assert.equal(response.wants_contact, Number(expected.wantsContact));
  assert.ok(response.submitted_at);
  const npsQuestion = questions.find((question) => question.type === "nps");
  const npsAnswer = await dbGet(db, "SELECT value_json FROM answers WHERE response_id=? AND question_id=?", id, npsQuestion.id);
  assert.equal(JSON.parse(npsAnswer.value_json), expected.nps);
  assert.equal((await dbGet(db, "SELECT COUNT(*)::int AS total FROM manifestations WHERE response_id=?", id)).total, 1);
  assert.equal((await api(`/public/responses/${id}`, "PUT", { token, questionId: "rating", value: 1 })).status, 409);
  assert.equal(JSON.parse((await dbGet(db, "SELECT value_json FROM answers WHERE response_id=? AND question_id='rating'", id)).value_json), 5);
});
