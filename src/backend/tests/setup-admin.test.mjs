import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

for (const status of [201, 409]) {
  test(`configuração local do administrador: HTTP ${status}, senha não aparece na saída`, { timeout: 5000 }, async (t) => {
    let received;
    const server = createServer(async (req, res) => {
      assert.equal(req.url, "/api/auth/setup");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      received = JSON.parse(Buffer.concat(chunks).toString());
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status === 201 ? { user: { id: "admin" } } : { error: "Configuração inicial já realizada." }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../../scripts/setup-admin.mjs", import.meta.url))], {
      env: { ...process.env, PORT: String(server.address().port) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    t.after(() => child.kill());
    const credentials = { name: "Administrador de teste", email: "admin@example.test", password: "Senha-local@de-teste-890" };
    const answers = [
      ["Nome do Super Admin: ", credentials.name],
      ["E-mail: ", credentials.email],
      ["não será exibida): ", credentials.password],
    ];
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (answers.length && stdout.includes(answers[0][0])) child.stdin.write(`${answers.shift()[1]}\n`);
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const exitCode = await new Promise((resolve) => child.on("exit", resolve));
    assert.deepEqual(received, credentials);
    assert.equal(exitCode, status === 201 ? 0 : 1);
    assert.ok(!(stdout + stderr).includes(credentials.password));
    assert.match(status === 201 ? stdout : stderr, status === 201 ? /Super Admin criado/ : /Configuração inicial já realizada/);
  });
}
