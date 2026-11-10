import { Pool } from "pg";
import { migrateDatabase } from "./migrations/index.mjs";

export async function createDatabase({ connectionString, schemaName }) {
  if (!connectionString)
    throw new Error("Configure DATABASE_URL para conectar ao PostgreSQL.");
  if (schemaName && !/^[a-z_][a-z0-9_]*$/.test(schemaName))
    throw new Error("Nome de schema PostgreSQL inválido.");
  const options = {
    connectionString,
    max: Number(process.env.FHDOD_DATABASE_POOL_SIZE || 3),
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
  };
  if (schemaName) {
    const admin = new Pool(options);
    try {
      await admin.query(`CREATE SCHEMA "${schemaName}"`);
    } finally {
      await admin.end();
    }
  }
  const scopedUrl = schemaName ? new URL(connectionString) : null;
  if (schemaName) scopedUrl.searchParams.set("options", `-c search_path=${schemaName}`);
  const db = new Pool({ ...options, connectionString: scopedUrl?.toString() || connectionString });
  db.on("error", (error) =>
    console.error("Erro na conexão PostgreSQL ociosa:", error.message),
  );
  db.dispose = async () => {
    await db.end();
    if (schemaName) {
      const admin = new Pool(options);
      try {
        await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      } finally {
        await admin.end();
      }
    }
  };
  try {
    await migrateDatabase(db);
    return db;
  } catch (error) {
    await db.dispose();
    throw error;
  }
}
