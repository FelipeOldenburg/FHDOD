import { randomUUID } from "node:crypto";
import { manifestationTypes } from "../../shared/contracts.ts";
import { dateOnly, fail, parse, text } from "../middleware/validation.mjs";
import {
  authorized,
  demandPermission,
  demandSector,
  permissions,
} from "../middleware/permissions.mjs";
import { hospitalDay } from "./calendar.mjs";

const now = () => new Date().toISOString();

export function createReportService({ all }, { settings, audit }) {
  function scopedWhere(user, url, dateAlias = "r") {
    const params = [];
    const where = [];
    const sectorId = url.searchParams.get("sectorId");
    if (sectorId && sectorId !== "all") {
      demandSector(user, sectorId);
      where.push(`${dateAlias}.sector_id=?`);
      params.push(sectorId);
    } else if (user.role !== "superadmin") {
      where.push(
        `${dateAlias}.sector_id IN (${user.sectorIds.map(() => "?").join(",") || "NULL"})`,
      );
      params.push(...user.sectorIds);
    }
    const from = dateOnly(url.searchParams.get("from"), "Data inicial");
    const to = dateOnly(url.searchParams.get("to"), "Data final");
    if (from && to && from > to)
      fail(400, "A data inicial deve anteceder a data final.");
    const dateColumn =
      url.searchParams.get("dateBasis") === "attendance"
        ? `${dateAlias}.attended_on`
        : `hospital_day(COALESCE(${dateAlias}.submitted_at,${dateAlias}.created_at))`;
    if (from) {
      where.push(`${dateColumn}>=?`);
      params.push(from);
    }
    if (to) {
      where.push(`${dateColumn}<=?`);
      params.push(to);
    }
    return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
  }
  async function responseRows(user, url) {
    // shortcut: carrega o período em memória; paginar consultas/exportações se o volume afetar o tempo de resposta.
    const scope = scopedWhere(user, url);
    return all(
      `SELECT r.*,s.name AS sector_name,v.title AS survey_title,m.status AS manifestation_status FROM responses r JOIN sectors s ON s.id=r.sector_id JOIN surveys v ON v.id=r.survey_id LEFT JOIN manifestations m ON m.response_id=r.id ${scope.sql} ORDER BY COALESCE(r.submitted_at,r.created_at) DESC`,
      ...scope.params,
    );
  }
  function responseView(row, user, details = true, answers = []) {
    const view = {
      id: row.id,
      sectorId: row.sector_id,
      sectorName: row.sector_name,
      surveyId: row.survey_id,
      surveyTitle: row.survey_title,
      status: row.status,
      attendedOn: row.attended_on,
      attendedTime: row.attended_time || null,
      shift: row.shift,
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      nps: row.nps,
      manifestationStatus: row.manifestation_status || null,
    };
    if (!details) return view;
    const questions = parse(row.questions_json, []);
    return {
      ...view,
      comment: row.comment,
      manifestationType: row.manifestation_type,
      wantsContact: !!row.wants_contact,
      ...(permissions(user).canViewContacts ? { phone: row.phone } : {}),
      answers: answers.map((a) => {
        const question = questions.find((q) => q.id === a.question_id);
        return {
          questionId: a.question_id,
          questionText: question?.text || "",
          type: question?.type || "",
          category: question?.category || "",
          value: parse(a.value_json),
          answeredAt: a.answered_at,
        };
      }),
    };
  }
  function ratings(rows, byResponse) {
    const values = rows.flatMap((row) => byResponse.get(row.id) || []);
    return values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) /
          100
      : null;
  }
  function nps(rows) {
    const values = rows
      .filter((r) => r.status === "submitted" && Number.isInteger(r.nps))
      .map((r) => r.nps);
    return values.length
      ? Math.round(
          ((values.filter((v) => v >= 9).length -
            values.filter((v) => v <= 6).length) /
            values.length) *
            100,
        )
      : null;
  }

  async function dashboard(user, url) {
    demandPermission(user, "canViewDashboard");
    const rows = await responseRows(user, url);
    const submitted = rows.filter((r) => r.status === "submitted");
    const scope = scopedWhere(user, url);
    const ratingMap = new Map();
    const ratingValues = await all(
      `SELECT a.response_id,a.value_json FROM answers a JOIN responses r ON r.id=a.response_id JOIN LATERAL jsonb_array_elements(r.questions_json::jsonb) q(value) ON q.value->>'id'=a.question_id WHERE q.value->>'type'='rating' ${scope.sql.replace(/^WHERE/, "AND")}`,
      ...scope.params,
    );
    for (const answer of ratingValues) {
      const value = parse(answer.value_json);
      if (Number.isFinite(value))
        ratingMap.set(answer.response_id, [
          ...(ratingMap.get(answer.response_id) || []),
          value,
        ]);
    }
    const end =
      dateOnly(url.searchParams.get("to"), "Data final") || hospitalDay(now());
    const endMonth = new Date(`${end.slice(0, 7)}-01T12:00:00Z`);
    const monthlyUrl = new URL(url);
    monthlyUrl.searchParams.delete("from");
    monthlyUrl.searchParams.delete("to");
    const historyScope = scopedWhere(user, monthlyUrl);
    const monthColumn =
      url.searchParams.get("dateBasis") === "attendance"
        ? "substr(r.attended_on,1,7)"
        : "substr(hospital_day(r.submitted_at),1,7)";
    const monthCounts = new Map(
      (
        await all(
          `SELECT ${monthColumn} AS month,count(*) AS count FROM responses r WHERE r.status='submitted' ${historyScope.sql.replace(/^WHERE/, "AND")} GROUP BY month`,
          ...historyScope.params,
        )
      ).map((row) => [row.month, Number(row.count)]),
    );
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const day = new Date(
        Date.UTC(
          endMonth.getUTCFullYear(),
          endMonth.getUTCMonth() - 5 + i,
          1,
          12,
        ),
      );
      const month = day.toISOString().slice(0, 7);
      return {
        month,
        label: day
          .toLocaleDateString("pt-BR", {
            month: "short",
            timeZone: "UTC",
          })
          .replace(".", ""),
        count: monthCounts.get(month) || 0,
      };
    });
    const bySector = (await all("SELECT * FROM sectors ORDER BY name"))
      .filter(
        (s) =>
          authorized(user, s.id) &&
          (!url.searchParams.get("sectorId") ||
            url.searchParams.get("sectorId") === "all" ||
            url.searchParams.get("sectorId") === s.id),
      )
      .map((s) => {
        const selected = submitted.filter((r) => r.sector_id === s.id);
        return {
          id: s.id,
          name: s.name,
          count: selected.length,
          nps: nps(selected),
          satisfaction: ratings(selected, ratingMap),
        };
      });
    const manifestationCounts = Object.fromEntries(
      manifestationTypes.map((type) => [
        type,
        submitted.filter((r) => r.comment && r.manifestation_type === type)
          .length,
      ]),
    );
    const satisfaction = ratings(submitted, ratingMap);
    const submittedRatings = submitted.flatMap(
      (row) => ratingMap.get(row.id) || [],
    );
    const ratingDistribution = Array.from({ length: 5 }, (_, i) => ({
      score: i + 1,
      count: submittedRatings.filter((value) => value === i + 1).length,
    }));
    const lowScoreThreshold = (await settings()).lowScoreThreshold;
    const criticalCount = submitted.filter(
      (row) => row.nps <= lowScoreThreshold,
    ).length;
    const previous = monthly.at(-2)?.count || 0;
    return {
      nps: nps(submitted),
      satisfaction,
      responseCount: submitted.length,
      partialCount: rows.length - submitted.length,
      pendingCount: submitted.filter(
        (r) => r.manifestation_status && r.manifestation_status !== "resolvida",
      ).length,
      criticalCount,
      positivePercent: submitted.length
        ? Math.round(
            (submitted.filter((r) => r.nps >= 9).length / submitted.length) *
              100,
          )
        : null,
      monthly,
      recent: rows.slice(0, 8).map((row) => responseView(row, user, false)),
      bySector,
      distribution: Array.from({ length: 11 }, (_, score) => ({
        score,
        count: submitted.filter((r) => r.nps === score).length,
      })),
      ratingDistribution,
      manifestationCounts,
      comparison: {
        responsePercent: previous
          ? Math.round(((monthly.at(-1).count - previous) / previous) * 100)
          : null,
        satisfactionDelta: null,
      },
    };
  }

  async function responses(user, url) {
    demandPermission(user, "canViewResponses");
    const rows = await responseRows(user, url);
    if (!rows.length) return [];
    const answers = await all(
      "SELECT * FROM answers WHERE response_id=ANY(?::text[]) ORDER BY answered_at",
      rows.map((row) => row.id),
    );
    const byResponse = new Map();
    for (const answer of answers) {
      if (!byResponse.has(answer.response_id))
        byResponse.set(answer.response_id, []);
      byResponse.get(answer.response_id).push(answer);
    }
    return rows.map((row) =>
      responseView(row, user, true, byResponse.get(row.id) || []),
    );
  }
  async function recordExport(user, body) {
    if (!["summary", "detailed"].includes(body.mode))
      fail(400, "Selecione uma modalidade de exportação válida.");
    demandPermission(
      user,
      body.mode === "detailed" ? "canExportDetails" : "canViewDashboard",
    );
    const source = body.filters ?? {};
    if (!source || Array.isArray(source) || typeof source !== "object")
      fail(400, "Filtros de exportação inválidos.");
    const filters = {};
    const url = new URL("http://localhost");
    for (const key of ["sectorId", "from", "to", "dateBasis"]) {
      const value = text(source[key], "Filtro", 100, true);
      if (value) {
        filters[key] = value;
        url.searchParams.set(key, value);
      }
    }
    scopedWhere(user, url);
    await audit(user, "export_generated", "export", randomUUID(), {
      mode: body.mode,
      filters,
    });
    return { recorded: true };
  }
  return { dashboard, responses, scopedWhere, recordExport };
}
