import { AsyncLocalStorage } from "node:async_hooks";

export function createStore(db) {
  const transactions = new AsyncLocalStorage();
  const query = (sql, args) => {
    let index = 0;
    return (transactions.getStore() || db).query(
      sql.replace(/\?/g, () => `$${++index}`),
      args,
    );
  };
  return {
    get: async (sql, ...args) => (await query(sql, args)).rows[0],
    all: async (sql, ...args) => (await query(sql, args)).rows,
    run: (sql, ...args) => query(sql, args),
    transaction: async (action) => {
      if (transactions.getStore()) return action();
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const result = await transactions.run(client, action);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
