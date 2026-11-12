import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { createDatabase } from "../models/database.mjs";
import { migrateDatabase } from "../models/migrations/index.mjs";
import { Pool } from "pg";

const connectionString = process.env.FHDOD_TEST_DATABASE_URL;
test("schema de teste prevalece sobre options da URL e preserva o schema public", { skip: !connectionString }, async (t) => {
  const url = new URL(connectionString);
  url.searchParams.set("options", "-c search_path=public");
  const admin = new Pool({ connectionString: url.toString() });
  t.after(() => admin.end());
  const publicTables = () => admin.query("SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY oid");
  const before = (await publicTables()).rows;
  const schemaName = `test_${randomUUID().replaceAll("-", "")}`;
  const db = await createDatabase({ connectionString: url.toString(), schemaName });
  t.after(() => db.dispose());
  assert.equal((await db.query("SELECT current_schema() AS name")).rows[0].name, schemaName);
  assert.deepEqual((await publicTables()).rows, before);
});

async function database(t) {
  const db = await createDatabase({
    connectionString,
    schemaName: `test_${randomUUID().replaceAll("-", "")}`,
  });
  t.after(() => db.dispose());
  await db.query(`
    INSERT INTO sectors VALUES('s','Setor','setor','',1,'2026-01-01T00:00:00Z');
    INSERT INTO surveys VALUES('v','s','Pesquisa','',1,'[]','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
    INSERT INTO responses(id,survey_id,sector_id,token_hash,questions_json,created_at)
    VALUES('r','v','s','hash','[]','2026-01-01T00:00:00Z');
    INSERT INTO answers VALUES('r','q','4','2026-01-01T00:00:00Z');
  `);
  return db;
}

test("persiste o envio e impede alterar, mover ou excluir respostas enviadas", { skip: !connectionString }, async (t) => {
  const db = await database(t);
  await db.query("UPDATE responses SET status='submitted',nps=9,comment='Original',phone='51999999999',wants_contact=1 WHERE id='r'");
  assert.deepEqual(
    (await db.query("SELECT status,nps,comment,phone,wants_contact FROM responses WHERE id='r'")).rows[0],
    { status: "submitted", nps: 9, comment: "Original", phone: "51999999999", wants_contact: 1 },
  );
  for (const sql of [
    "UPDATE responses SET comment='Alterado' WHERE id='r'",
    "DELETE FROM responses WHERE id='r'",
    "UPDATE answers SET value_json='1' WHERE response_id='r'",
    "DELETE FROM answers WHERE response_id='r'",
    "INSERT INTO answers VALUES('r','outra','3','2026-01-01T00:00:00Z')",
  ]) await assert.rejects(db.query(sql), /imutáveis/);
  await db.query("INSERT INTO responses(id,survey_id,sector_id,token_hash,questions_json,created_at) VALUES('partial','v','s','hash2','[]','2026-01-01T00:00:00Z')");
  await assert.rejects(
    db.query("UPDATE answers SET response_id='partial' WHERE response_id='r'"),
    /imutáveis/,
  );
});

test("uma gravação concorrente aguarda o envio e preserva a resposta original", { skip: !connectionString }, async (t) => {
  const db = await database(t);
  const submit = await db.connect();
  const answer = await db.connect();
  try {
    await submit.query("BEGIN");
    await answer.query("BEGIN");
    const answerPid = (await answer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await submit.query("UPDATE responses SET status='submitted',nps=9 WHERE id='r'");
    const rejected = assert.rejects(
      answer.query("UPDATE answers SET value_json='1' WHERE response_id='r'"),
      /imutáveis/,
    );
    let blocked = false;
    for (let attempt = 0; attempt < 50 && !blocked; attempt++) {
      blocked = (await db.query("SELECT cardinality(pg_blocking_pids($1))>0 AS blocked", [answerPid])).rows[0].blocked;
      if (!blocked) await setTimeout(10);
    }
    assert.equal(blocked, true, "A gravação deve aguardar a trava da submissão.");
    await submit.query("COMMIT");
    await rejected;
    await answer.query("ROLLBACK");
    assert.equal((await db.query("SELECT value_json FROM answers WHERE response_id='r'")).rows[0].value_json, "4");
  } finally {
    await submit.query("ROLLBACK");
    await answer.query("ROLLBACK");
    submit.release();
    answer.release();
  }
});

test("atualiza schema legado sem perder dados e não recria triggers em novos boots", { skip: !connectionString }, async (t) => {
  const db = await database(t);
  await db.query(`
    DROP TABLE schema_migrations;
    CREATE OR REPLACE FUNCTION preserve_submitted_response() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF OLD.status='submitted' THEN RAISE EXCEPTION 'Respostas enviadas são imutáveis'; END IF; RETURN OLD; END
    $$;
  `);
  await migrateDatabase(db);
  await db.query("UPDATE responses SET status='submitted',nps=10 WHERE id='r'");
  assert.equal((await db.query("SELECT status FROM responses WHERE id='r'")).rows[0].status, "submitted");
  assert.deepEqual(
    (await db.query("SELECT version FROM schema_migrations ORDER BY version")).rows,
    [{ version: 1 }, { version: 2 }, { version: 3 }],
  );
  const triggers = (await db.query("SELECT oid FROM pg_trigger WHERE tgrelid IN ('responses'::regclass,'answers'::regclass) ORDER BY oid")).rows;
  await Promise.all([migrateDatabase(db), migrateDatabase(db)]);
  assert.deepEqual((await db.query("SELECT oid FROM pg_trigger WHERE tgrelid IN ('responses'::regclass,'answers'::regclass) ORDER BY oid")).rows, triggers);
  assert.equal((await db.query("SELECT value_json FROM answers WHERE response_id='r'")).rows[0].value_json, "4");
});
