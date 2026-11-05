import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dev = resolve(root, "scripts/dev.mjs");
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);

test("desenvolvimento sem conexão configurada encerra antes de iniciar os servidores", () => {
  for (const demo of [false, true]) {
    const result = spawnSync(
      process.execPath,
      [dev, ...(demo ? ["--demo"] : [])],
      {
        cwd: root,
        env: {
          ...process.env,
          DATABASE_URL: demo ? "postgresql://principal.invalid/fhdod" : "",
          FHDOD_DEMO_DATABASE_URL: "",
          FHDOD_DEMO: "",
        },
        encoding: "utf8",
        timeout: 2500,
      },
    );
    assert.equal(
      result.error,
      undefined,
      "A inicialização deve encerrar sem aguardar o watcher.",
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      new RegExp(
        `Configure ${demo ? "FHDOD_DEMO_DATABASE_URL" : "DATABASE_URL"}.*\\.env`,
      ),
    );
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /VITE|Waiting for file changes/,
    );
  }
});

test("comandos carregam .env nativamente e preservam a precedência do ambiente", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "fhdod-env-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    resolve(directory, ".env"),
    "DATABASE_URL=postgresql://arquivo.invalid/fhdod\n",
  );
  const run = (command, value) => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    if (value) env.DATABASE_URL = value;
    return spawnSync(
      process.execPath,
      [
        ...(packageJson.scripts[command] || "")
          .split(" ")
          .filter((argument) => argument.startsWith("--env-file")),
        "--input-type=module",
        "-e",
        "process.stdout.write(process.env.DATABASE_URL)",
      ],
      { cwd: directory, env, encoding: "utf8" },
    );
  };
  for (const command of ["dev", "dev:demo", "start", "test", "db:migrate"]) {
    assert.equal(
      run(command).stdout,
      "postgresql://arquivo.invalid/fhdod",
      command,
    );
    assert.equal(
      run(command, "postgresql://ambiente.invalid/fhdod").stdout,
      "postgresql://ambiente.invalid/fhdod",
      command,
    );
  }
});
