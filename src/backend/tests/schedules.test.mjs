import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestApplication, dbRun } from "./helpers.mjs";

async function start(t) {
  const app = await createTestApplication();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const api = async (path, { method = "GET", body, cookie } = {}) => {
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
  };
  return { ...app, api };
}

test("importa escalas e cruza profissionais pelo setor, data e horário", async (t) => {
  const { db, api } = await start(t);
  const setup = await api("/auth/setup", {
    method: "POST",
    body: {
      name: "Admin",
      email: "admin@example.test",
      password: "Senha-segura-escalas-2026",
    },
  });
  const cookie = setup.cookie;
  const timestamp = "2026-11-12T12:00:00.000Z";
  await dbRun(
    db,
    "INSERT INTO sectors VALUES('pa','Pronto Atendimento','pa','',1,?)",
    timestamp,
  );
  await dbRun(
    db,
    "INSERT INTO surveys VALUES('survey-pa','pa','Pesquisa PA','',1,'[]',?,?)",
    timestamp,
    timestamp,
  );
  await dbRun(
    db,
    "INSERT INTO responses(id,survey_id,sector_id,token_hash,status,questions_json,attended_on,attended_time,shift,created_at) VALUES('response-estimated','survey-pa','pa','hash-2','submitted','[]','','','',?)",
    timestamp,
  );
  await dbRun(
    db,
    "INSERT INTO responses(id,survey_id,sector_id,token_hash,status,questions_json,attended_on,attended_time,shift,created_at) VALUES('response-pa','survey-pa','pa','hash','submitted','[]','2026-11-12','10:30','manha',?)",
    timestamp,
  );

  const imported = await api("/schedules", {
    method: "POST",
    cookie,
    body: {
      filename: "escala-novembro.xlsx",
      rows: [
        {
          sectorId: "pa",
          shiftDate: "2026-11-12",
          startsAt: "08:00",
          endsAt: "14:00",
          professionalName: "Dra. Ana",
          registration: "CRM 123",
          specialty: "Clínica médica",
        },
        {
          sectorId: "pa",
          shiftDate: "2026-11-12",
          startsAt: "14:00",
          endsAt: "20:00",
          professionalName: "Dr. Bruno",
          registration: "CRM 456",
          specialty: "Clínica médica",
        },
      ],
    },
  });
  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported.rowCount, 2);

  const matched = await api(
    "/responses/response-pa/scheduled-professionals",
    { cookie },
  );
  assert.equal(matched.status, 200);
  assert.equal(matched.body.precision, "time");
  assert.deepEqual(
    matched.body.professionals.map((item) => item.name),
    ["Dra. Ana"],
  );
  const estimated = await api(
    "/responses/response-estimated/scheduled-professionals",
    { cookie },
  );
  assert.equal(estimated.body.precision, "response_time");
  assert.deepEqual(
    estimated.body.professionals.map((item) => item.name),
    ["Dra. Ana"],
  );

  const removed = await api(`/schedules/${imported.body.imported.id}`, {
    method: "DELETE",
    cookie,
  });
  assert.equal(removed.status, 200);
  assert.deepEqual(
    (await api("/responses/response-pa/scheduled-professionals", { cookie })).body
      .professionals,
    [],
  );
});
