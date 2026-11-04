import { randomUUID } from "node:crypto";
import { createApplication } from "../app.mjs";

export const hasTestDatabase = !!process.env.FHDOD_TEST_DATABASE_URL;
if (!hasTestDatabase) throw new Error("Configure FHDOD_TEST_DATABASE_URL com um PostgreSQL isolado para executar os testes.");
export const createTestApplication = () =>
  createApplication({
    databaseUrl: process.env.FHDOD_TEST_DATABASE_URL,
    schemaName: `test_${randomUUID().replaceAll("-", "")}`,
  });
const parameters = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};
export const dbGet = async (db, sql, ...values) =>
  (await db.query(parameters(sql), values)).rows[0];
export const dbRun = (db, sql, ...values) => db.query(parameters(sql), values);
