import { defaultSettings } from "../../shared/contracts.ts";
import { fail, integer, parse, text } from "../middleware/validation.mjs";
import { demandPermission } from "../middleware/permissions.mjs";

export function createSettingsService({ all, run, transaction }, { audit }) {
  const get = async () => ({
    ...defaultSettings,
    ...Object.fromEntries(
      (await all("SELECT * FROM settings")).map((row) => [
        row.key,
        parse(row.value_json),
      ]),
    ),
  });
  return {
    get,
    async update(user, body) {
      demandPermission(user, "canManageSettings");
      const input = body.settings ?? body;
      if (!input || Array.isArray(input) || typeof input !== "object")
        fail(400, "Configurações inválidas.");
      return transaction(async () => {
        await run(
          "SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext('fhdod-settings'))",
        );
        const current = await get();
        const next = {
          hospitalName: text(
            input.hospitalName ?? current.hospitalName,
            "Nome da instituição",
            160,
          ),
          commentLimit: integer(
            input.commentLimit ?? current.commentLimit,
            100,
            5000,
            "Limite de comentário",
          ),
          lowScoreThreshold: integer(
            input.lowScoreThreshold ?? current.lowScoreThreshold,
            0,
            10,
            "Limite de nota baixa",
          ),
          autoResetSeconds: integer(
            input.autoResetSeconds ?? current.autoResetSeconds,
            5,
            120,
            "Tempo de reinício",
          ),
        };
        for (const [key, value] of Object.entries(next))
          await run(
            "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json",
            key,
            JSON.stringify(value),
          );
        await audit(user, "updated", "settings", "global", next);
        return next;
      });
    },
  };
}
