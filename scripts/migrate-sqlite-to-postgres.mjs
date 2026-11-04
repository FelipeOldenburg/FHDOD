import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../src/backend/models/database.mjs";

const tables = [
  "sectors",
  "users",
  "user_sectors",
  "sessions",
  "surveys",
  "responses",
  "answers",
  "manifestations",
  "settings",
  "audit",
];

export async function migrateSqliteToPostgres({
  sourcePath = "data/fhdod.sqlite",
  connectionString = process.env.FHDOD_DEMO === "1"
    ? process.env.FHDOD_DEMO_DATABASE_URL
    : process.env.DATABASE_URL,
} = {}) {
  if (!connectionString)
    throw new Error(
      `Configure ${process.env.FHDOD_DEMO === "1" ? "FHDOD_DEMO_DATABASE_URL" : "DATABASE_URL"} com o PostgreSQL de destino.`,
    );
  const source = new DatabaseSync(resolve(sourcePath), { readOnly: true });
  let db;
  let client;
  try {
    source.exec("BEGIN");
    db = await createDatabase({ connectionString });
    client = await db.connect();
    await client.query("BEGIN");
    await client.query(`LOCK TABLE ${tables.join(",")} IN ACCESS EXCLUSIVE MODE`);
    for (const table of tables) {
      if ((await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)
        throw new Error(`A tabela ${table} no PostgreSQL já contém dados; migração cancelada.`);
    }
    await client.query("ALTER TABLE responses DISABLE TRIGGER preserve_submitted_responses");
    await client.query("ALTER TABLE answers DISABLE TRIGGER preserve_submitted_answers");
    const counts = {};
    for (const table of tables) {
      const rows = source.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        const columns = Object.keys(row);
        const identifiers = columns.map((column) => `"${column.replaceAll('"', '""')}"`);
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
        await client.query(
          `INSERT INTO ${table}(${identifiers.join(",")}) VALUES(${placeholders})`,
          columns.map((column) => row[column]),
        );
      }
      counts[table] = rows.length;
    }
    await client.query("ALTER TABLE responses ENABLE TRIGGER preserve_submitted_responses");
    await client.query("ALTER TABLE answers ENABLE TRIGGER preserve_submitted_answers");
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
    source.close();
    if (db) await db.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const counts = await migrateSqliteToPostgres({
    sourcePath: process.argv[2] || (process.env.FHDOD_DEMO === "1" ? "data/demo.sqlite" : "data/fhdod.sqlite"),
  });
  for (const [table, count] of Object.entries(counts)) console.log(`${table}: ${count}`);
}
