import { randomUUID } from "node:crypto";
import { dateOnly, fail, text } from "../middleware/validation.mjs";
import {
  demandPermission,
  demandSector,
} from "../middleware/permissions.mjs";
import { hospitalDay } from "./calendar.mjs";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function time(value, label) {
  const result = text(value, label, 5);
  if (!timePattern.test(result)) fail(400, `${label} deve usar o formato HH:MM.`);
  return result;
}

function importView(row) {
  return {
    id: row.id,
    filename: row.filename,
    rowCount: Number(row.row_count),
    importedAt: row.imported_at,
    importedByName: row.imported_by_name || "Usuário removido",
  };
}

function professionalView(row) {
  return {
    id: row.id,
    name: row.professional_name,
    registration: row.registration,
    specialty: row.specialty,
    startsAt: `${row.shift_date}T${row.starts_at}:00`,
    endsAt: `${row.shift_date}T${row.ends_at}:00`,
  };
}

function hospitalTime(timestamp) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

export function createScheduleService(
  { get, all, run, transaction },
  { audit },
) {
  async function list(user) {
    demandPermission(user, "canManageSettings");
    return (
      await all(
        `SELECT i.*,u.name AS imported_by_name
         FROM schedule_imports i
         LEFT JOIN users u ON u.id=i.imported_by
         ORDER BY i.imported_at DESC`,
      )
    ).map(importView);
  }

  async function importRows(user, body) {
    demandPermission(user, "canManageSettings");
    const filename = text(body.filename, "Nome do arquivo", 180);
    if (!Array.isArray(body.rows) || !body.rows.length)
      fail(400, "A planilha não possui escalas para importar.");
    if (body.rows.length > 5000)
      fail(400, "Importe no máximo 5.000 linhas por arquivo.");

    const sectorIds = [...new Set(body.rows.map((row) => row?.sectorId))];
    const sectors = await all(
      "SELECT id FROM sectors WHERE id=ANY(?::text[]) AND active=1",
      sectorIds,
    );
    if (sectors.length !== sectorIds.length)
      fail(400, "A planilha contém um setor inexistente ou inativo.");

    const rows = body.rows.map((row, index) => {
      if (!row || typeof row !== "object")
        fail(400, `Linha ${index + 2}: conteúdo inválido.`);
      return {
        sectorId: text(row.sectorId, `Linha ${index + 2}: setor`, 100),
        shiftDate: dateOnly(row.shiftDate, `Linha ${index + 2}: data`, false),
        startsAt: time(row.startsAt, `Linha ${index + 2}: início`),
        endsAt: time(row.endsAt, `Linha ${index + 2}: fim`),
        professionalName: text(
          row.professionalName,
          `Linha ${index + 2}: profissional`,
          160,
        ),
        registration: text(
          row.registration,
          `Linha ${index + 2}: registro`,
          60,
          true,
        ),
        specialty: text(
          row.specialty,
          `Linha ${index + 2}: especialidade`,
          120,
          true,
        ),
      };
    });

    const importId = randomUUID();
    const importedAt = new Date().toISOString();
    await transaction(async () => {
      await run(
        "INSERT INTO schedule_imports(id,filename,row_count,imported_by,imported_at) VALUES(?,?,?,?,?)",
        importId,
        filename,
        rows.length,
        user.id,
        importedAt,
      );
      for (const row of rows)
        await run(
          `INSERT INTO medical_shifts(
            id,import_id,sector_id,shift_date,starts_at,ends_at,
            professional_name,registration,specialty,created_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
          randomUUID(),
          importId,
          row.sectorId,
          row.shiftDate,
          row.startsAt,
          row.endsAt,
          row.professionalName,
          row.registration,
          row.specialty,
          importedAt,
        );
    });
    await audit(user, "imported", "medical_schedule", importId, {
      filename,
      rowCount: rows.length,
    });
    const imported = await get(
      `SELECT i.*,u.name AS imported_by_name
       FROM schedule_imports i LEFT JOIN users u ON u.id=i.imported_by
       WHERE i.id=?`,
      importId,
    );
    return importView(imported);
  }

  async function remove(user, id) {
    demandPermission(user, "canManageSettings");
    const current = await get("SELECT * FROM schedule_imports WHERE id=?", id);
    if (!current) fail(404, "Importação de escala não encontrada.");
    await run("DELETE FROM schedule_imports WHERE id=?", id);
    await audit(user, "deleted", "medical_schedule", id, {
      filename: current.filename,
      rowCount: Number(current.row_count),
    });
    return { ok: true };
  }

  async function professionalsForResponse(user, responseId) {
    demandPermission(user, "canViewResponses");
    const response = await get(
      "SELECT id,sector_id,attended_on,attended_time,shift,created_at FROM responses WHERE id=?",
      responseId,
    );
    if (!response) fail(404, "Avaliação não encontrada.");
    demandSector(user, response.sector_id);
    if (!response.attended_on && !response.created_at)
      return { professionals: [], precision: "none", attendedAt: null };

    const effectiveDate = response.attended_on || hospitalDay(response.created_at);
    const previous = new Date(`${effectiveDate}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    const candidates = await all(
      `SELECT * FROM medical_shifts
       WHERE sector_id=? AND shift_date=ANY(?::text[])
       ORDER BY shift_date,starts_at,professional_name`,
      response.sector_id,
      [previous.toISOString().slice(0, 10), effectiveDate],
    );
    const responseTimeFallback =
      !response.attended_time &&
      response.created_at &&
      (!response.attended_on || hospitalDay(response.created_at) === response.attended_on)
        ? hospitalTime(response.created_at)
        : "";
    const matchTime = response.attended_time || responseTimeFallback;
    if (!matchTime)
      return {
        professionals: candidates
          .filter((row) => row.shift_date === effectiveDate)
          .map(professionalView),
        precision: "date",
        attendedAt: effectiveDate,
      };

    const attended = Date.parse(`${effectiveDate}T${matchTime}:00`);
    const matching = candidates.filter((row) => {
      const start = Date.parse(`${row.shift_date}T${row.starts_at}:00`);
      let end = Date.parse(`${row.shift_date}T${row.ends_at}:00`);
      if (end <= start) end += 24 * 60 * 60 * 1000;
      return attended >= start && attended < end;
    });
    return {
      professionals: matching.map(professionalView),
      precision: response.attended_time ? "time" : "response_time",
      attendedAt: `${effectiveDate}T${matchTime}:00`,
    };
  }

  return { list, importRows, remove, professionalsForResponse };
}

