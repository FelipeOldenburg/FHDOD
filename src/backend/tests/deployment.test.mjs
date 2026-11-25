import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { createTestApplication } from "./helpers.mjs";

test("servidor aceita HOST do contêiner, mantém saúde e encerra ao receber SIGTERM", { timeout: 10000 }, async (t) => {
  const app = await createTestApplication();
  t.after(() => app.close());
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../app.mjs", import.meta.url))], {
    env: { ...process.env, DATABASE_URL: app.db.options.connectionString, HOST: "0.0.0.0", PORT: String(port), FHDOD_DEMO: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => { if (String(chunk).includes(`http://0.0.0.0:${port}`)) resolve(); });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Servidor encerrou: ${code}; ${stderr}`)));
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status, 200);
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await exited;
});
