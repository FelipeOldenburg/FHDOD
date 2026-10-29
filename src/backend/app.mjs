import { createServer } from "node:http";
import { createApiController } from "./controllers/api-controller.mjs";
import { createDatabase } from "./models/database.mjs";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const roles = [
  "superadmin",
  "sector_admin",
  "management",
  "ombudsman",
  "viewer",
];
const questionTypes = ["rating", "nps", "yes_no", "choice", "text"];
const manifestationTypes = ["elogio", "reclamacao", "sugestao", "outro"];
const statuses = ["nova", "pendente", "em_atendimento", "resolvida"];
const categories = [
  "Recepção",
  "Triagem",
  "Enfermagem",
  "Médico",
  "Atendimento",
  "Higiene/Limpeza",
  "Estrutura",
  "Tempo de espera",
  "NPS",
];
const defaultSettings = {
  hospitalName: "Fundação Hospitalar Dr. Oswaldo Diesel",
  commentLimit: 1000,
  lowScoreThreshold: 6,
  autoResetSeconds: 10,
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const uid = () => randomUUID();
const now = () => new Date().toISOString();
const hospitalDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const hospitalDay = (timestamp) =>
  timestamp ? hospitalDateFormatter.format(new Date(timestamp)) : "";
const parse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function text(value, name, max = 200, optional = false) {
  if (optional && (value === undefined || value === null || value === ""))
    return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(400, `${name}: informe um texto de até ${max} caracteres.`);
  return value.trim();
}
function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max)
    fail(400, `${name}: use um número inteiro entre ${min} e ${max}.`);
  return value;
}
function passwordHash(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    fail(400, "A senha deve ter entre 12 e 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function passwordMatches(password, encoded) {
  if (typeof password !== "string" || password.length > 128 || !encoded)
    return false;
  const [salt, expected] = encoded.split(":");
  const actual = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, "hex");
  return target.length === actual.length && timingSafeEqual(target, actual);
}
function validEmail(value) {
  const email = text(value, "E-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(400, "Informe um e-mail válido.");
  return email;
}
function dateOnly(value, name, optional = true) {
  if (!value && optional) return "";
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T12:00:00Z`)) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    fail(400, `${name}: informe uma data válida.`);
  return value;
}
function permissions(user) {
  const privileged = ["superadmin", "sector_admin", "ombudsman"].includes(
    user.role,
  );
  return {
    canManageUsers: user.role === "superadmin",
    canManageSectors: user.role === "superadmin",
    canEditSurveys: ["superadmin", "sector_admin"].includes(user.role),
    canViewResponses: privileged,
    canViewManifestations: privileged,
    canViewContacts: ["superadmin", "ombudsman"].includes(user.role),
    canExportDetails: privileged,
    canViewDashboard: roles.includes(user.role),
    canManageSettings: user.role === "superadmin",
  };
}

export function createApplication({
  databasePath = process.env.FHDOD_DB ||
    resolve(
      root,
      "data",
      process.env.FHDOD_DEMO === "1" ? "demo.sqlite" : "fhdod.sqlite",
    ),
  demo = process.env.FHDOD_DEMO === "1",
} = {}) {
  const db = createDatabase({ databasePath, hospitalDay });
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = (action) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const audit = (user, action, targetType, targetId, details = {}) =>
    run(
      "INSERT INTO audit VALUES(?,?,?,?,?,?,?)",
      uid(),
      user?.id || null,
      action,
      targetType,
      targetId,
      JSON.stringify(details),
      now(),
    );
  const settings = () => ({
    ...defaultSettings,
    ...Object.fromEntries(
      all("SELECT * FROM settings").map((row) => [
        row.key,
        parse(row.value_json),
      ]),
    ),
  });
  const sectorView = (row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    active: !!row.active,
  });
  const userView = (row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: !!row.active,
    mustChangePassword: !!row.must_change_password,
    sectorIds: all(
      "SELECT sector_id FROM user_sectors WHERE user_id=?",
      row.id,
    ).map((s) => s.sector_id),
  });
  const sectorAdmins = (sectorId) =>
    all(
      "SELECT u.* FROM users u JOIN user_sectors us ON us.user_id=u.id WHERE us.sector_id=? AND u.role='sector_admin'",
      sectorId,
    );
  function fixedSectorAdmin(row) {
    if (row.role !== "sector_admin") return false;
    const sectorIds = userView(row).sectorIds;
    return sectorIds.length === 1 && sectorAdmins(sectorIds[0]).length === 1;
  }
  function sectorAccount(row) {
    const user = userView(row);
    if (user.role !== "sector_admin") return user;
    if (!fixedSectorAdmin(row))
      fail(
        409,
        "O acesso deste setor precisa ser corrigido pelo Admin Supremo em Usuários: mantenha um administrador por setor.",
      );
    if (
      !get("SELECT id FROM sectors WHERE id=? AND active=1", user.sectorIds[0])
    )
      fail(
        401,
        "O acesso deste setor está desativado. Contate o Admin Supremo.",
      );
    return user;
  }
  function revokeSectorSessions(sectorId) {
    run(
      "DELETE FROM sessions WHERE user_id IN (SELECT us.user_id FROM user_sectors us JOIN users u ON u.id=us.user_id WHERE us.sector_id=? AND u.role='sector_admin')",
      sectorId,
    );
  }
  const surveyView = (row) => ({
    id: row.id,
    sectorId: row.sector_id,
    title: row.title,
    description: row.description,
    active: !!row.active,
    questions: parse(row.questions_json, []),
    updatedAt: row.updated_at,
  });
  function authorized(user, sectorId) {
    return user.role === "superadmin" || user.sectorIds.includes(sectorId);
  }
  function demandSector(user, sectorId) {
    if (!authorized(user, sectorId))
      fail(403, "Você não tem acesso a este setor.");
  }
  function demandPermission(user, permission) {
    if (!permissions(user)[permission])
      fail(403, "Seu perfil não permite esta ação.");
  }
  function normalizeQuestions(input, previous = []) {
    if (!Array.isArray(input) || input.length > 50)
      fail(400, "A pesquisa deve ter no máximo 50 perguntas.");
    if (
      input.some(
        (q) => !q || typeof q !== "object" || !questionTypes.includes(q.type),
      )
    )
      fail(400, "Tipo de pergunta inválido.");
    const ids = new Set();
    const questions = input
      .filter((q) => q.type !== "nps")
      .map((q, position) => {
        if (!q || typeof q !== "object" || !questionTypes.includes(q.type))
          fail(400, "Tipo de pergunta inválido.");
        const id = q.id || uid();
        if (typeof id !== "string" || ids.has(id) || id.length > 100)
          fail(400, "Identificador de pergunta inválido ou duplicado.");
        ids.add(id);
        const options =
          q.type === "choice"
            ? Array.isArray(q.options)
              ? q.options.map((v) => text(v, "Alternativa", 120))
              : []
            : [];
        if (
          q.type === "choice" &&
          (options.length < 2 ||
            options.length > 10 ||
            new Set(options).size !== options.length)
        )
          fail(400, "Informe de 2 a 10 alternativas diferentes.");
        const question = {
          id,
          text: text(q.text, "Pergunta", 500),
          type: q.type,
          category: text(q.category || "Atendimento", "Categoria", 80),
          options,
          position,
          active: q.active !== false,
          version: 1,
        };
        const before = previous.find((p) => p.id === id);
        if (before)
          question.version =
            before.version +
            (["text", "type", "category"].some(
              (key) => before[key] !== question[key],
            ) || JSON.stringify(before.options) !== JSON.stringify(options)
              ? 1
              : 0);
        return question;
      });
    const suppliedNps = input.find((q) => q.type === "nps");
    const priorNps = previous.find((q) => q.type === "nps");
    const npsId = priorNps?.id || suppliedNps?.id || uid();
    if (typeof npsId !== "string" || npsId.length > 100 || ids.has(npsId))
      fail(400, "Identificador da pergunta NPS inválido ou duplicado.");
    questions.push({
      id: npsId,
      text: "De 0 a 10, o quanto você recomendaria o hospital a alguém?",
      type: "nps",
      category: "NPS",
      options: [],
      position: questions.length,
      active: true,
      version: priorNps?.version || 1,
    });
    return questions;
  }
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
  function responseRows(user, url) {
    // shortcut: carrega o período em memória; paginar consultas/exportações se o volume afetar o tempo de resposta.
    const scope = scopedWhere(user, url);
    return all(
      `SELECT r.*,s.name AS sector_name,v.title AS survey_title,m.status AS manifestation_status FROM responses r JOIN sectors s ON s.id=r.sector_id JOIN surveys v ON v.id=r.survey_id LEFT JOIN manifestations m ON m.response_id=r.id ${scope.sql} ORDER BY COALESCE(r.submitted_at,r.created_at) DESC`,
      ...scope.params,
    );
  }
  function responseView(row, user, details = true) {
    const view = {
      id: row.id,
      sectorId: row.sector_id,
      sectorName: row.sector_name,
      surveyId: row.survey_id,
      surveyTitle: row.survey_title,
      status: row.status,
      attendedOn: row.attended_on,
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
      answers: all(
        "SELECT * FROM answers WHERE response_id=? ORDER BY answered_at",
        row.id,
      ).map((a) => {
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
  // shortcut: limites em memória por processo; usar armazenamento compartilhado antes de operar várias instâncias.
  const rateBuckets = new Map();
  function rateLimit(req, scope, max = 30, interval = 15 * 60 * 1000) {
    const key = `${scope}:${req.socket.remoteAddress}`;
    const current = Date.now();
    for (const [k, b] of rateBuckets)
      if (b.until < current) rateBuckets.delete(k);
    const bucket = rateBuckets.get(key) || {
      count: 0,
      until: current + interval,
    };
    bucket.count++;
    rateBuckets.set(key, bucket);
    if (bucket.count > max)
      fail(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }
  async function readBody(req) {
    if (!(req.headers["content-type"] || "").startsWith("application/json"))
      fail(415, "Envie os dados como JSON.");
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536)
        fail(413, "O conteúdo enviado excede o limite permitido.");
      chunks.push(chunk);
    }
    const body = parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || Array.isArray(body) || typeof body !== "object")
      fail(400, "JSON inválido.");
    return body;
  }
  function authenticated(req) {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("fhdod_session="))
      ?.slice("fhdod_session=".length);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      fail(401, "Entre na sua conta para continuar.");
    run("DELETE FROM sessions WHERE expires_at<=?", now());
    const row = get(
      "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND u.active=1",
      hash(token),
    );
    if (!row) fail(401, "Sua sessão expirou. Entre novamente.");
    return sectorAccount(row);
  }
  function session(req, res, userId) {
    const token = randomBytes(32).toString("hex");
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      userId,
      new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    );
    res.setHeader(
      "Set-Cookie",
      `fhdod_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.FHDOD_COOKIE_SECURE === "1" || req.socket.encrypted ? "; Secure" : ""}`,
    );
  }
  function csrf(req) {
    if (req.headers["sec-fetch-site"] === "cross-site")
      fail(403, "Origem da solicitação não autorizada.");
    const origin = req.headers.origin;
    if (
      origin &&
      origin !== `http://${req.headers.host}` &&
      origin !== `https://${req.headers.host}` &&
      origin !== process.env.FHDOD_ORIGIN
    )
      fail(403, "Origem da solicitação não autorizada.");
  }
  function publicResponse(id, token) {
    const row = get("SELECT * FROM responses WHERE id=?", id);
    if (!row || typeof token !== "string" || hash(token) !== row.token_hash)
      fail(404, "Esta pesquisa não foi encontrada. Reabra o link do setor.");
    if (row.status === "submitted")
      fail(409, "Esta pesquisa já foi enviada e não pode ser alterada.");
    if (Date.now() - Date.parse(row.created_at) > 24 * 60 * 60 * 1000)
      fail(410, "Esta pesquisa expirou. Reabra o link do setor.");
    return row;
  }
  const server = createServer(createApiController({
      root,
      randomBytes,
      roles,
      questionTypes,
      manifestationTypes,
      statuses,
      categories,
      defaultSettings,
      hash,
      uid,
      now,
      hospitalDay,
      parse,
      fail,
      text,
      integer,
      passwordHash,
      passwordMatches,
      validEmail,
      dateOnly,
      permissions,
      db,
      get,
      all,
      run,
      transaction,
      audit,
      settings,
      sectorView,
      userView,
      sectorAdmins,
      fixedSectorAdmin,
      sectorAccount,
      revokeSectorSessions,
      surveyView,
      authorized,
      demandSector,
      demandPermission,
      normalizeQuestions,
      scopedWhere,
      responseRows,
      responseView,
      ratings,
      nps,
      rateLimit,
      readBody,
      authenticated,
      session,
      csrf,
      publicResponse,
      demo,
      existsSync,
      readFileSync,
      statSync,
      resolve,
      extname,
      sep,
  }));
  return {
    server,
    db,
    close: () =>
      new Promise((resolveClose) =>
        server.close(() => {
          db.close();
          resolveClose();
        }),
      ),
    seedDemo: () => seedDemo(db, normalizeQuestions),
  };
}

function seedDemo(db, normalizeQuestions) {
  if (db.prepare("SELECT id FROM sectors LIMIT 1").get()) return;
  const sectors = [
    ["Pronto Atendimento", "pronto-atendimento"],
    ["Internação", "internacao"],
    ["Bloco Cirúrgico", "bloco-cirurgico"],
    ["Saúde Mental", "saude-mental"],
  ];
  const comments = [
    ["elogio", "Fui muito bem acolhido pela equipe. Obrigado pelo cuidado."],
    ["reclamacao", "O tempo de espera poderia ser melhor informado."],
    ["sugestao", "Seria útil sinalizar melhor a recepção."],
  ];
  db.exec("BEGIN");
  try {
    sectors.forEach(([name, slug], index) => {
      const sectorId = uid();
      const surveyId = uid();
      const questions = normalizeQuestions([
        {
          text: "Como você avalia o atendimento na recepção?",
          type: "rating",
          category: "Recepção",
        },
        {
          text: "Como você avalia o cuidado da equipe?",
          type: "rating",
          category: "Atendimento",
        },
        {
          text: "O ambiente estava limpo e organizado?",
          type: "yes_no",
          category: "Higiene/Limpeza",
        },
      ]);
      db.prepare("INSERT INTO sectors VALUES(?,?,?,?,1,?)").run(
        sectorId,
        name,
        slug,
        "Setor de demonstração — dados fictícios.",
        now(),
      );
      db.prepare("INSERT INTO surveys VALUES(?,?,?,?,1,?,?,?)").run(
        surveyId,
        sectorId,
        `Pesquisa de satisfação — ${name}`,
        "Sua opinião faz a diferença. Este ambiente contém apenas dados de demonstração.",
        JSON.stringify(questions),
        now(),
        now(),
      );
      for (let i = 0; i < 18 - index * 3; i++) {
        const id = uid();
        const date = new Date();
        date.setUTCMonth(date.getUTCMonth() - (i % 6));
        date.setUTCDate(Math.min(20, date.getUTCDate()));
        const timestamp = date.toISOString();
        const score = [10, 9, 8, 10, 6, 9, 10, 7, 4][(i + index) % 9];
        const pair = comments[(i + index) % comments.length];
        const comment = i % 4 === 0 ? pair[1] : "";
        db.prepare(
          "INSERT INTO responses(id,survey_id,sector_id,token_hash,status,questions_json,attended_on,shift,created_at) VALUES(?,?,?,?,'partial',?,?,?,?)",
        ).run(
          id,
          surveyId,
          sectorId,
          hash(uid()),
          JSON.stringify(questions),
          timestamp.slice(0, 10),
          ["Manhã", "Tarde", "Noite"][i % 3],
          timestamp,
        );
        for (const [qIndex, question] of questions.entries())
          db.prepare("INSERT INTO answers VALUES(?,?,?,?)").run(
            id,
            question.id,
            JSON.stringify(
              question.type === "nps"
                ? score
                : question.type === "yes_no"
                  ? true
                  : 3 + ((i + qIndex) % 3),
            ),
            timestamp,
          );
        db.prepare(
          "UPDATE responses SET status='submitted',submitted_at=?,nps=?,comment=?,manifestation_type=? WHERE id=?",
        ).run(timestamp, score, comment, pair[0], id);
        if (comment)
          db.prepare(
            "INSERT INTO manifestations(id,response_id,created_at,updated_at) VALUES(?,?,?,?)",
          ).run(uid(), id, timestamp, timestamp);
      }
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApplication();
  if (process.env.FHDOD_DEMO === "1") app.seedDemo();
  const port = Number(process.env.PORT || 3001);
  app.server.listen(port, "127.0.0.1", () =>
    console.log(
      `FHDOD API: http://127.0.0.1:${port}${process.env.FHDOD_DEMO === "1" ? " (demonstração: dados fictícios)" : ""}`,
    ),
  );
  const stop = () => {
    app.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}