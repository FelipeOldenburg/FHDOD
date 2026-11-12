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

test("vincula várias TVs, isola configurações e revoga apenas um dispositivo", async (t) => {
  const { db, api } = await start(t);
  const setup = await api("/auth/setup", {
    method: "POST",
    body: {
      name: "Admin",
      email: "admin@example.test",
      password: "Senha-segura-tv-wall-2026",
    },
  });
  assert.equal(setup.status, 201);
  const adminCookie = setup.cookie;
  const timestamp = new Date().toISOString();
  await dbRun(
    db,
    "INSERT INTO sectors VALUES('recepcao','Recepção','recepcao','',1,?)",
    timestamp,
  );
  await dbRun(
    db,
    "INSERT INTO sectors VALUES('internacao','Internação','internacao','',1,?)",
    timestamp,
  );

  const first = await api("/tv-devices", {
    method: "POST",
    cookie: adminCookie,
    body: {
      name: "TV Recepção",
      allSectors: false,
      sectorIds: ["recepcao"],
      metrics: ["satisfaction", "responses", "nps", "trend"],
      period: "last_7_days",
      refreshSeconds: 30,
    },
  });
  const second = await api("/tv-devices", {
    method: "POST",
    cookie: adminCookie,
    body: {
      name: "TV Diretoria",
      allSectors: true,
      sectorIds: [],
      metrics: ["satisfaction", "responses", "nps", "pending", "trend", "sectors"],
      period: "current_month",
      refreshSeconds: 60,
    },
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.match(first.body.pairingCode, /^\d{6}$/);
  assert.notEqual(first.body.pairingCode, second.body.pairingCode);
  const devices = await api("/tv-devices", { cookie: adminCookie });
  assert.equal(devices.status, 200);
  assert.equal(devices.body.devices.length, 2);

  const pairedFirst = await api("/public/tv/pair", {
    method: "POST",
    body: { code: first.body.pairingCode },
  });
  assert.equal(pairedFirst.status, 200);
  assert.match(pairedFirst.cookie, /^fhdod_tv=/);
  const displayFirst = await api("/public/tv/dashboard", {
    cookie: pairedFirst.cookie,
  });
  assert.equal(displayFirst.status, 200);
  assert.equal(displayFirst.body.device.name, "TV Recepção");
  assert.equal(displayFirst.body.device.periodLabel, "Últimos 7 dias");
  assert.deepEqual(displayFirst.body.device.metrics, [
    "satisfaction",
    "responses",
    "nps",
    "trend",
  ]);
  assert.deepEqual(
    displayFirst.body.dashboard.bySector.map((sector) => sector.id),
    ["recepcao"],
  );

  const revoked = await api(`/tv-devices/${first.body.device.id}`, {
    method: "DELETE",
    cookie: adminCookie,
  });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.device.status, "revoked");
  assert.equal(
    (await api("/public/tv/dashboard", { cookie: pairedFirst.cookie })).status,
    401,
  );

  const pairedSecond = await api("/public/tv/pair", {
    method: "POST",
    body: { code: second.body.pairingCode },
  });
  assert.equal(pairedSecond.status, 200);
  const displaySecond = await api("/public/tv/dashboard", {
    cookie: pairedSecond.cookie,
  });
  assert.equal(displaySecond.status, 200);
  assert.equal(displaySecond.body.device.name, "TV Diretoria");
  assert.equal(displaySecond.body.dashboard.bySector.length, 2);

  const renewed = await api(
    `/tv-devices/${first.body.device.id}/pairing-code`,
    { method: "POST", cookie: adminCookie },
  );
  assert.equal(renewed.status, 200);
  assert.match(renewed.body.pairingCode, /^\d{6}$/);
  assert.equal(renewed.body.device.status, "awaiting_pairing");
});
