import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDatabase } from "../models/database.mjs";
import { migrateSqliteToPostgres } from "../../../scripts/migrate-sqlite-to-postgres.mjs";

const connectionString = process.env.FHDOD_TEST_DATABASE_URL;
const run = promisify(execFile);
const script = fileURLToPath(new URL("../../../scripts/migrate-sqlite-to-postgres.mjs", import.meta.url));

async function destination(t) {
  const schemaName = `test_${randomUUID().replaceAll("-", "")}`;
  const db = await createDatabase({ connectionString, schemaName });
  t.after(() => db.dispose());
  const url = new URL(connectionString);
  url.searchParams.set("options", `-c search_path=${schemaName}`);
  return { db, url: url.toString() };
}

function fixture(t, invalid = false) {
  const root = resolve("tmp");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "migration-"));
  t.after(() => {
    assert.ok(resolve(directory).startsWith(`${root}${sep}`));
    rmSync(directory, { recursive: true });
  });
  const filename = join(directory, "source.sqlite");
  const source = new DatabaseSync(filename);
  if (invalid) source.exec("PRAGMA foreign_keys=OFF");
  source.exec(readFileSync(new URL("../models/migrations/001-initial.sql", import.meta.url), "utf8"));
  source.exec(`
    INSERT INTO sectors VALUES('s','Setor','setor','',1,'2026-01-01T00:00:00Z');
    INSERT INTO users VALUES('u','Admin','admin@example.test','hash','superadmin',0,1,'2026-01-01T00:00:00Z');
    INSERT INTO user_sectors VALUES('${invalid ? "missing" : "u"}','s');
    INSERT INTO sessions VALUES('token','u','2026-01-01T00:00:00Z');
    INSERT INTO surveys VALUES('v','s','Pesquisa','',1,'[]','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
    INSERT INTO responses(id,survey_id,sector_id,token_hash,status,questions_json,created_at,nps,comment)
    VALUES('r','v','s','hash','submitted','[]','2026-01-01T00:00:00Z',9,'Comentário original');
    INSERT INTO answers VALUES('r','q','4','2026-01-01T00:00:00Z');
    INSERT INTO manifestations(id,response_id,created_at,updated_at) VALUES('m','r','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
    INSERT INTO settings VALUES('hospitalName','"Hospital de teste"');
    INSERT INTO audit VALUES('a','u','created','sector','s','{}','2026-01-01T00:00:00Z');
  `);
  source.close();
  return filename;
}

test("migra os dados SQLite completos e mantém a origem e a imutabilidade", { skip: !connectionString }, async (t) => {
  const { db, url } = await destination(t);
  const filename = fixture(t);
  const original = readFileSync(filename);
  const counts = await migrateSqliteToPostgres({ sourcePath: filename, connectionString: url });
  assert.ok(Object.values(counts).every((count) => count === 1));
  const source = new DatabaseSync(filename, { readOnly: true });
  try {
    for (const table of Object.keys(counts)) {
      const expected = source.prepare(`SELECT * FROM ${table}`).all().map((row) => ({ ...row }));
      const columns = expected[0] ? Object.keys(expected[0]) : [];
      const actual = (await db.query(`SELECT * FROM ${table}`)).rows.map((row) =>
        Object.fromEntries(columns.map((column) => [column, row[column]])),
      );
      assert.deepEqual(actual, expected);
    }
  } finally { source.close(); }
  assert.deepEqual(readFileSync(filename), original);
  await assert.rejects(db.query("UPDATE responses SET comment='Alterado' WHERE id='r'"), /imutáveis/);
  await assert.rejects(db.query("DELETE FROM answers WHERE response_id='r'"), /imutáveis/);
  await assert.rejects(
    migrateSqliteToPostgres({ sourcePath: filename, connectionString: url }),
    /já contém dados/,
  );
  assert.equal((await db.query("SELECT comment FROM responses WHERE id='r'")).rows[0].comment, "Comentário original");
});

test("reverte importação inválida sem dados parciais ou triggers desativados", { skip: !connectionString }, async (t) => {
  const { db, url } = await destination(t);
  const filename = fixture(t, true);
  await assert.rejects(
    migrateSqliteToPostgres({ sourcePath: filename, connectionString: url }),
    /foreign key/,
  );
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM sectors")).rows[0].count, 0);
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM users")).rows[0].count, 0);
  const triggers = (await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname IN ('preserve_submitted_responses','preserve_submitted_answers') AND tgrelid IN ('responses'::regclass,'answers'::regclass)")).rows;
  assert.equal(triggers.length, 2);
  assert.ok(triggers.every((trigger) => trigger.tgenabled === "O"));
});

test("CLI escolhe o destino demo explicitamente e nunca usa o principal como fallback", { skip: !connectionString }, async (t) => {
  const main = await destination(t);
  const demo = await destination(t);
  const filename = fixture(t);
  const env = { ...process.env, DATABASE_URL: main.url, FHDOD_DEMO_DATABASE_URL: demo.url, FHDOD_DEMO: "1" };
  await run(process.execPath, [script, filename], { env });
  assert.equal((await main.db.query("SELECT count(*)::integer AS count FROM sectors")).rows[0].count, 0);
  assert.equal((await demo.db.query("SELECT count(*)::integer AS count FROM sectors")).rows[0].count, 1);
  await assert.rejects(
    run(process.execPath, [script, filename], { env: { ...env, FHDOD_DEMO_DATABASE_URL: "" } }),
    (error) => /Configure FHDOD_DEMO_DATABASE_URL/.test(error.stderr),
  );
  assert.equal((await main.db.query("SELECT count(*)::integer AS count FROM sectors")).rows[0].count, 0);
  await run(process.execPath, [script, filename], { env: { ...env, FHDOD_DEMO: "0" } });
  assert.equal((await main.db.query("SELECT count(*)::integer AS count FROM sectors")).rows[0].count, 1);
});
