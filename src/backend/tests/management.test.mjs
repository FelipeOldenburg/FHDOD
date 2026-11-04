import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createTestApplication, dbGet, dbRun } from "./helpers.mjs";
import { createApiController } from "../controllers/api-controller.mjs";
import { createManagementController } from "../controllers/management-controller.mjs";
import { passwordHash } from "../services/auth-service.mjs";
import { normalizeQuestions } from "../services/survey-service.mjs";

const password = "Senha-teste-gestao-2026";

async function start(t) {
  const app = await createTestApplication();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const api = async (path, { method = "GET", body, cookie } = {}) => {
    const result = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: result.status, body: await result.json(), cookie: result.headers.get("set-cookie")?.split(";")[0] };
  };
  return { ...app, api, base };
}

async function seedSector(db, id) {
  const timestamp = new Date().toISOString();
  const questions = normalizeQuestions([{ id: "rating", text: "Atendimento", type: "rating" }]);
  await dbRun(db, "INSERT INTO sectors VALUES(?,?,?,'',1,?)", id, id, id, timestamp);
  await dbRun(db, "INSERT INTO surveys VALUES(?,?,?,'',1,?,?,?)", `survey-${id}`, id, id, JSON.stringify(questions), timestamp, timestamp);
  return questions;
}

async function seedUser(db, api, id, role, sectorId) {
  await dbRun(db,
    "INSERT INTO users(id,name,email,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,?,0,?)",
    id, id, `${id}@example.test`, passwordHash(password), role, new Date().toISOString(),
  );
  await dbRun(db, "INSERT INTO user_sectors VALUES(?,?)", id, sectorId);
  const login = await api("/auth/login", { method: "POST", body: { email: `${id}@example.test`, password } });
  assert.equal(login.status, 200);
  return login.cookie;
}

async function seedResponse(db, { id, sectorId, questions, timestamp, attendedOn, nps, rating, comment = "" }) {
  await dbRun(db,
    "INSERT INTO responses(id,survey_id,sector_id,token_hash,questions_json,attended_on,created_at) VALUES(?,?,?,?,?,?,?)",
    id, `survey-${sectorId}`, sectorId, id, JSON.stringify(questions), attendedOn, timestamp,
  );
  for (const question of questions) await dbRun(db, "INSERT INTO answers VALUES(?,?,?,?)",
    id, question.id, JSON.stringify(question.type === "nps" ? nps : rating), timestamp,
  );
  await dbRun(db,
    "UPDATE responses SET status='submitted',submitted_at=?,nps=?,comment=?,phone=?,wants_contact=? WHERE id=?",
    timestamp, nps, comment, comment ? "(51) 99999-9999" : "", Number(!!comment), id,
  );
  if (comment) await dbRun(db,
    "INSERT INTO manifestations(id,response_id,created_at,updated_at) VALUES(?,?,?,?)",
    `manifestation-${id}`, id, timestamp, timestamp,
  );
}

test("alterações simultâneas da ouvidoria preservam notas e histórico de ambos os atendentes", async (t) => {
  const { db, api } = await start(t);
  const questions = await seedSector(db, "sector");
  await seedResponse(db, {
    id: "response", sectorId: "sector", questions, timestamp: new Date().toISOString(),
    attendedOn: "2026-01-01", nps: 2, rating: 1, comment: "Relato original do paciente",
  });
  const cookies = await Promise.all(["atendente-a", "atendente-b"].map((id) => seedUser(db, api, id, "ombudsman", "sector")));
  const updates = [
    { status: "em_atendimento", internalNote: "Primeiro retorno registrado" },
    { status: "resolvida", internalNote: "Segundo retorno registrado" },
  ];
  const results = await Promise.all(updates.map((body, index) => api("/manifestations/manifestation-response", {
    method: "PATCH", cookie: cookies[index], body,
  })));
  assert.deepEqual(results.map((result) => result.status), [200, 200]);
  const row = await dbGet(db, "SELECT * FROM manifestations WHERE id='manifestation-response'");
  const history = JSON.parse(row.history_json);
  assert.equal(history.length, 2);
  assert.deepEqual(new Set(history.map((entry) => entry.note)), new Set(updates.map((entry) => entry.internalNote)));
  assert.deepEqual(new Set(history.map((entry) => entry.by)), new Set(["atendente-a", "atendente-b"]));
  assert.equal(row.internal_note, history.at(-1).note);
  assert.equal(row.status, history.at(-1).status);
  const original = await dbGet(db, "SELECT comment,phone FROM responses WHERE id='response'");
  assert.deepEqual(original, { comment: "Relato original do paciente", phone: "(51) 99999-9999" });
});

test("dashboard devolve contagens numéricas e respeita período, base de data e setores autorizados", async (t) => {
  const { db, api } = await start(t);
  const sectorA = await seedSector(db, "sector-a");
  const sectorB = await seedSector(db, "sector-b");
  await seedResponse(db, { id: "a-early", sectorId: "sector-a", questions: sectorA, timestamp: "2040-01-02T01:30:00.000Z", attendedOn: "2040-02-03", nps: 9, rating: 5, comment: "Comentário restrito" });
  await seedResponse(db, { id: "a-late", sectorId: "sector-a", questions: sectorA, timestamp: "2040-01-02T04:30:00.000Z", attendedOn: "2040-01-01", nps: 5, rating: 1 });
  await seedResponse(db, { id: "b-late", sectorId: "sector-b", questions: sectorB, timestamp: "2040-01-02T05:30:00.000Z", attendedOn: "2040-01-01", nps: 10, rating: 4 });
  const cookie = await seedUser(db, api, "viewer", "viewer", "sector-a");
  const selected = await api("/dashboard?from=2040-01-01&to=2040-01-01", { cookie });
  assert.equal(selected.status, 200);
  assert.equal(selected.body.responseCount, 1);
  assert.equal(selected.body.nps, 100);
  assert.equal(selected.body.satisfaction, 5);
  assert.deepEqual(selected.body.bySector.map((entry) => entry.id), ["sector-a"]);
  assert.equal(selected.body.monthly.at(-1).month, "2040-01");
  assert.equal(selected.body.monthly.at(-1).count, 2);
  assert.ok(selected.body.monthly.every((entry) => typeof entry.count === "number"));
  assert.equal(selected.body.recent[0].comment, undefined);
  assert.equal(selected.body.recent[0].phone, undefined);
  const attendance = await api("/dashboard?from=2040-01-01&to=2040-01-01&dateBasis=attendance", { cookie });
  assert.equal(attendance.status, 200);
  assert.equal(attendance.body.responseCount, 1);
  assert.equal(attendance.body.nps, -100);
  assert.equal(attendance.body.satisfaction, 1);
  assert.equal((await api("/dashboard?sectorId=sector-b", { cookie })).status, 403);
  assert.equal((await api("/responses", { cookie })).status, 403);
  assert.equal((await api("/manifestations", { cookie })).status, 403);
  assert.equal((await api("/dashboard?from=2040-02-01&to=2040-01-01", { cookie })).status, 400);
});

test("health responde 503 quando a consulta do banco falha sem expor o erro interno", async (t) => {
  let available = false;
  const management = createManagementController({ health: async () => {
    if (!available) throw new Error("Falha interna da conexão");
  } });
  const server = createServer(createApiController({
    root: process.cwd(),
    routes: [{ method: "GET", pattern: /^\/api\/health$/, handle: management.health, public: true }],
    authenticate: () => assert.fail("Health deve ser público"),
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  const unavailable = await fetch(url);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { ok: false });
  assert.match(unavailable.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  available = true;
  const healthy = await fetch(url);
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), { ok: true });
});

test("API rejeita métodos não permitidos, JSON inválido e corpos acima do limite", async (t) => {
  const { base } = await start(t);
  const method = await fetch(`${base}/auth/login`);
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "POST");
  assert.deepEqual(await method.json(), { error: "Método não permitido." });
  const invalid = await fetch(`${base}/public/responses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "JSON inválido." });
  const media = await fetch(`${base}/public/responses`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  assert.equal(media.status, 415);
  await media.json();
  const oversized = await fetch(`${base}/public/responses`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(70_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "O conteúdo enviado excede o limite permitido." });
});
