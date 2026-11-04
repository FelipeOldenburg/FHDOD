import { readFile } from "node:fs/promises";

const migrations = ["001-initial.sql", "002-response-integrity.sql"];

export async function migrateDatabase(db) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext(current_schema()), hashtext('fhdod-schema-migrations'))",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations(
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const applied = new Set(
      (await client.query("SELECT version FROM schema_migrations")).rows.map(
        (row) => row.version,
      ),
    );
    for (const [index, filename] of migrations.entries()) {
      const version = index + 1;
      if (applied.has(version)) continue;
      const sql = await readFile(new URL(filename, import.meta.url), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
