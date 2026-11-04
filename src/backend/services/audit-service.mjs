import { randomUUID } from "node:crypto";
import { integer, parse } from "../middleware/validation.mjs";
import { demandPermission } from "../middleware/permissions.mjs";

export function createAuditService({ run, all }) {
  return {
    record: (user, action, targetType, targetId, details = {}) =>
      run(
        "INSERT INTO audit VALUES(?,?,?,?,?,?,?)",
        randomUUID(),
        user?.id || null,
        action,
        targetType,
        targetId,
        JSON.stringify(details),
        new Date().toISOString(),
      ),
    async list(user, limit = 100) {
      demandPermission(user, "canManageSettings");
      integer(limit, 1, 500, "Limite");
      const events = await all(
        "SELECT a.*,u.name AS user_name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT ?",
        limit,
      );
      return events.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name || "Sistema",
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        details: parse(row.details_json, {}),
        createdAt: row.created_at,
      }));
    },
  };
}
