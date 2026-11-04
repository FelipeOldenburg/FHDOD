import { statuses } from "../../shared/contracts.ts";
import { fail, parse, text } from "../middleware/validation.mjs";
import {
  demandPermission,
  demandSector,
  permissions,
} from "../middleware/permissions.mjs";

export function createManifestationService(
  { all, get, run, transaction },
  { scopedWhere, audit },
) {
  return {
    async list(user, url) {
      demandPermission(user, "canViewManifestations");
      const scope = scopedWhere(user, url);
      const rows = await all(
        `SELECT m.*,r.sector_id,r.comment,r.phone,r.wants_contact,r.manifestation_type,s.name AS sector_name FROM manifestations m JOIN responses r ON r.id=m.response_id JOIN sectors s ON s.id=r.sector_id ${scope.sql} ORDER BY m.created_at DESC`,
        ...scope.params,
      );
      return rows.map((row) => ({
        id: row.id,
        responseId: row.response_id,
        sectorId: row.sector_id,
        sectorName: row.sector_name,
        type: row.manifestation_type,
        comment: row.comment,
        ...(permissions(user).canViewContacts ? { phone: row.phone } : {}),
        wantsContact: !!row.wants_contact,
        status: row.status,
        internalNote: row.internal_note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        history: parse(row.history_json, []),
      }));
    },
    async update(user, id, body) {
      demandPermission(user, "canViewManifestations");
      if (
        Object.keys(body).some(
          (key) => !["status", "internalNote"].includes(key),
        )
      )
        fail(400, "O relato original do paciente não pode ser alterado.");
      return transaction(async () => {
        const before = await get(
          "SELECT m.*,r.sector_id FROM manifestations m JOIN responses r ON r.id=m.response_id WHERE m.id=? FOR UPDATE OF m",
          id,
        );
        if (!before) fail(404, "Manifestação não encontrada.");
        demandSector(user, before.sector_id);
        const status = body.status ?? before.status;
        if (!statuses.includes(status)) fail(400, "Situação inválida.");
        const note = text(
          body.internalNote ?? before.internal_note,
          "Observação interna",
          3000,
          true,
        );
        const timestamp = new Date().toISOString();
        const history = [
          ...parse(before.history_json, []),
          { at: timestamp, by: user.name, status, note },
        ];
        await run(
          "UPDATE manifestations SET status=?,internal_note=?,updated_at=?,history_json=? WHERE id=?",
          status,
          note,
          timestamp,
          JSON.stringify(history),
          id,
        );
        await audit(user, "updated", "manifestation", id, { status });
        return { updated: true };
      });
    },
  };
}
