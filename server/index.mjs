import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  autoResetSeconds: 15,
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
  if (databasePath !== ":memory:")
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.function("hospital_day", { deterministic: true }, hospitalDay);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sectors(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,description TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,must_change_password INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_sectors(user_id TEXT NOT NULL REFERENCES users(id),sector_id TEXT NOT NULL REFERENCES sectors(id),PRIMARY KEY(user_id,sector_id));
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS surveys(id TEXT PRIMARY KEY,sector_id TEXT NOT NULL REFERENCES sectors(id),title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,questions_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_survey ON surveys(sector_id) WHERE active=1;
    CREATE TABLE IF NOT EXISTS responses(id TEXT PRIMARY KEY,survey_id TEXT NOT NULL REFERENCES surveys(id),sector_id TEXT NOT NULL REFERENCES sectors(id),token_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'partial',questions_json TEXT NOT NULL,attended_on TEXT NOT NULL DEFAULT '',shift TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,submitted_at TEXT,nps INTEGER,comment TEXT NOT NULL DEFAULT '',manifestation_type TEXT NOT NULL DEFAULT 'outro',phone TEXT NOT NULL DEFAULT '',wants_contact INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS responses_sector_date ON responses(sector_id,submitted_at);
    CREATE TABLE IF NOT EXISTS answers(response_id TEXT NOT NULL REFERENCES responses(id),question_id TEXT NOT NULL,value_json TEXT NOT NULL,answered_at TEXT NOT NULL,PRIMARY KEY(response_id,question_id));
    CREATE TABLE IF NOT EXISTS manifestations(id TEXT PRIMARY KEY,response_id TEXT NOT NULL UNIQUE REFERENCES responses(id),status TEXT NOT NULL DEFAULT 'nova',internal_note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,history_json TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,details_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_responses BEFORE UPDATE ON responses WHEN OLD.status='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_responses_delete BEFORE DELETE ON responses WHEN OLD.status='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_answers_update BEFORE UPDATE ON answers WHEN (SELECT status FROM responses WHERE id=OLD.response_id)='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_answers_insert BEFORE INSERT ON answers WHEN (SELECT status FROM responses WHERE id=NEW.response_id)='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_answers_delete BEFORE DELETE ON answers WHEN (SELECT status FROM responses WHERE id=OLD.response_id)='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;`);
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
    return userView(row);
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
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(),microphone=(),geolocation=()",
    );
    res.setHeader("Cache-Control", "no-store");
    const send = (value, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname.replace(/\/$/, "") || "/";
      const method = req.method;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) csrf(req);
      if (path === "/api/health") return send({ ok: true });
      if (path === "/api/auth/setup" && method === "GET")
        return send({ needsSetup: !get("SELECT id FROM users LIMIT 1"), demo });
      if (path === "/api/auth/setup" && method === "POST") {
        const hostname = new URL(`http://${req.headers.host}`).hostname;
        if (
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress,
          ) ||
          !["127.0.0.1", "localhost", "[::1]"].includes(hostname)
        )
          fail(403, "A configuração inicial deve ser feita no servidor local.");
        rateLimit(req, "setup", 10);
        const body = await readBody(req);
        const name = text(body.name, "Nome", 120);
        const email = validEmail(body.email);
        const encoded = passwordHash(body.password);
        const id = uid();
        transaction(() => {
          if (get("SELECT id FROM users LIMIT 1"))
            fail(409, "O administrador inicial já foi configurado.");
          run(
            "INSERT INTO users(id,name,email,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,?,1,?)",
            id,
            name,
            email,
            encoded,
            "superadmin",
            now(),
          );
          audit({ id }, "setup", "user", id);
        });
        session(req, res, id);
        return send(
          { user: userView(get("SELECT * FROM users WHERE id=?", id)) },
          201,
        );
      }
      if (path === "/api/auth/login" && method === "POST") {
        rateLimit(req, "login");
        const body = await readBody(req);
        const email = validEmail(body.email);
        const user = get(
          "SELECT * FROM users WHERE email=? AND active=1",
          email,
        );
        // Faz a mesma derivação quando o e-mail não existe para evitar enumerar contas pelo tempo de resposta.
        const valid = passwordMatches(
          body.password,
          user?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`,
        );
        if (!valid || !user) fail(401, "E-mail ou senha incorretos.");
        session(req, res, user.id);
        return send({ user: userView(user) });
      }
      if (path === "/api/auth/logout" && method === "POST") {
        const token = (req.headers.cookie || "")
          .split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("fhdod_session="))
          ?.slice("fhdod_session=".length);
        if (token) run("DELETE FROM sessions WHERE token_hash=?", hash(token));
        res.setHeader(
          "Set-Cookie",
          "fhdod_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        return send({ loggedOut: true });
      }
      const publicSector = path.match(/^\/api\/public\/sectors\/([^/]+)$/);
      if (publicSector && method === "GET") {
        const sector = get(
          "SELECT * FROM sectors WHERE slug=? AND active=1",
          decodeURIComponent(publicSector[1]),
        );
        if (!sector) fail(404, "Este setor não está disponível.");
        const survey = get(
          "SELECT * FROM surveys WHERE sector_id=? AND active=1",
          sector.id,
        );
        if (!survey)
          fail(404, "Este setor ainda não tem uma pesquisa publicada.");
        const view = surveyView(survey);
        const publicSettings = settings();
        return send({
          sector: sectorView(sector),
          survey: {
            ...view,
            questions: view.questions.filter((q) => q.active),
          },
          questions: view.questions.filter((q) => q.active),
          settings: publicSettings,
          demo,
        });
      }
      if (path === "/api/public/responses" && method === "POST") {
        rateLimit(req, "survey-create", 300, 10 * 60 * 1000);
        const body = await readBody(req);
        const sector = get(
          "SELECT * FROM sectors WHERE id=? AND active=1",
          text(body.sectorId, "Setor", 100),
        );
        const survey =
          sector &&
          get(
            "SELECT * FROM surveys WHERE sector_id=? AND active=1",
            sector.id,
          );
        if (!survey) fail(404, "Não há pesquisa publicada para este setor.");
        const attendedOn = dateOnly(body.attendedOn, "Data do atendimento");
        if (attendedOn && attendedOn > hospitalDay(now()))
          fail(400, "A data do atendimento não pode estar no futuro.");
        const shift = text(body.shift, "Turno", 80, true);
        const id = uid();
        const token = randomBytes(32).toString("hex");
        const questions = parse(survey.questions_json, []).filter(
          (q) => q.active,
        );
        run(
          "INSERT INTO responses(id,survey_id,sector_id,token_hash,questions_json,attended_on,shift,created_at) VALUES(?,?,?,?,?,?,?,?)",
          id,
          survey.id,
          sector.id,
          hash(token),
          JSON.stringify(questions),
          attendedOn,
          shift,
          now(),
        );
        return send({ id, token, questions }, 201);
      }
      const publicAnswer = path.match(/^\/api\/public\/responses\/([^/]+)$/);
      if (publicAnswer && method === "PUT") {
        rateLimit(req, "survey-answer", 2000, 10 * 60 * 1000);
        const body = await readBody(req);
        const response = publicResponse(publicAnswer[1], body.token);
        const question = parse(response.questions_json, []).find(
          (q) => q.id === body.questionId,
        );
        if (!question)
          fail(400, "Esta pergunta não pertence à pesquisa iniciada.");
        let value = body.value;
        if (question.type === "rating")
          value = integer(value, 1, 5, "Avaliação");
        if (question.type === "nps") value = integer(value, 0, 10, "NPS");
        if (
          question.type === "yes_no" &&
          ![true, false, "Sim", "Não", "sim", "não"].includes(value)
        )
          fail(400, "Selecione sim ou não.");
        if (question.type === "choice" && !question.options.includes(value))
          fail(400, "Selecione uma das alternativas disponíveis.");
        if (question.type === "text")
          value = text(value, "Resposta", settings().commentLimit, true);
        run(
          "INSERT INTO answers VALUES(?,?,?,?) ON CONFLICT(response_id,question_id) DO UPDATE SET value_json=excluded.value_json,answered_at=excluded.answered_at",
          response.id,
          question.id,
          JSON.stringify(value),
          now(),
        );
        return send({ saved: true });
      }
      const publicSubmit = path.match(
        /^\/api\/public\/responses\/([^/]+)\/submit$/,
      );
      if (publicSubmit && method === "POST") {
        rateLimit(req, "survey-submit", 300, 10 * 60 * 1000);
        const body = await readBody(req);
        const response = publicResponse(publicSubmit[1], body.token);
        const value = integer(body.nps, 0, 10, "NPS");
        const comment = text(
          body.comment,
          "Comentário",
          settings().commentLimit,
          true,
        );
        const type =
          body.manifestationType ||
          (value <= settings().lowScoreThreshold ? "reclamacao" : "outro");
        if (!manifestationTypes.includes(type))
          fail(400, "Tipo de manifestação inválido.");
        const wantsContact = body.wantsContact === true;
        const phone = wantsContact ? text(body.phone, "Telefone", 30) : "";
        if (
          wantsContact &&
          (!comment ||
            !/^[+()\s\d.-]{8,30}$/.test(phone) ||
            phone.replace(/\D/g, "").length < 8)
        )
          fail(
            400,
            "Para receber retorno, descreva sua manifestação e informe um telefone válido.",
          );
        const timestamp = now();
        transaction(() => {
          const npsQuestion = parse(response.questions_json, []).find(
            (q) => q.type === "nps",
          );
          if (npsQuestion) {
            const priorAnswer = get(
              "SELECT * FROM answers WHERE response_id=? AND question_id=?",
              response.id,
              npsQuestion.id,
            );
            if (!priorAnswer || parse(priorAnswer.value_json) !== value)
              run(
                "INSERT INTO answers VALUES(?,?,?,?) ON CONFLICT(response_id,question_id) DO UPDATE SET value_json=excluded.value_json,answered_at=excluded.answered_at",
                response.id,
                npsQuestion.id,
                JSON.stringify(value),
                timestamp,
              );
          }
          run(
            "UPDATE responses SET status='submitted',submitted_at=?,nps=?,comment=?,manifestation_type=?,phone=?,wants_contact=? WHERE id=?",
            timestamp,
            value,
            comment,
            type,
            phone,
            Number(wantsContact),
            response.id,
          );
          if (comment)
            run(
              "INSERT INTO manifestations(id,response_id,created_at,updated_at) VALUES(?,?,?,?)",
              uid(),
              response.id,
              timestamp,
              timestamp,
            );
        });
        return send({ submitted: true, id: response.id });
      }
      if (path.startsWith("/api/")) {
        const user = authenticated(req);
        if (path === "/api/auth/me" && method === "GET") return send({ user });
        if (path === "/api/auth/password" && method === "POST") {
          rateLimit(req, `password:${user.id}`, 10);
          const body = await readBody(req);
          const row = get("SELECT * FROM users WHERE id=?", user.id);
          if (!passwordMatches(body.currentPassword, row.password_hash))
            fail(400, "A senha atual está incorreta.");
          if (body.currentPassword === body.newPassword)
            fail(400, "Escolha uma senha diferente da temporária ou atual.");
          const encoded = passwordHash(body.newPassword);
          transaction(() => {
            run(
              "UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?",
              encoded,
              user.id,
            );
            run("DELETE FROM sessions WHERE user_id=?", user.id);
            audit(user, "password_changed", "user", user.id);
          });
          session(req, res, user.id);
          return send({
            user: userView(get("SELECT * FROM users WHERE id=?", user.id)),
          });
        }
        if (user.mustChangePassword)
          fail(403, "Troque sua senha temporária antes de continuar.");
        if (path === "/api/bootstrap" && method === "GET") {
          const sectors = all("SELECT * FROM sectors ORDER BY name")
            .filter((s) => authorized(user, s.id))
            .map(sectorView);
          const surveys = all("SELECT * FROM surveys ORDER BY created_at DESC")
            .filter((s) => authorized(user, s.sector_id))
            .map(surveyView);
          return send({
            user,
            permissions: permissions(user),
            sectors,
            surveys,
            categories,
            users:
              user.role === "superadmin"
                ? all("SELECT * FROM users ORDER BY name").map(userView)
                : [],
            settings: settings(),
            demo,
          });
        }
        const sectorMatch = path.match(/^\/api\/sectors(?:\/([^/]+))?$/);
        if (sectorMatch) {
          if (method === "GET")
            return send({
              sectors: all("SELECT * FROM sectors ORDER BY name")
                .filter((s) => authorized(user, s.id))
                .map(sectorView),
            });
          demandPermission(user, "canManageSectors");
          if (method === "POST" || method === "PUT" || method === "PATCH") {
            const body = await readBody(req);
            const before =
              sectorMatch[1] &&
              get("SELECT * FROM sectors WHERE id=?", sectorMatch[1]);
            if (method !== "POST" && !before)
              fail(404, "Setor não encontrado.");
            const name = text(body.name ?? before?.name, "Nome do setor", 120);
            const slug = text(
              body.slug ?? before?.slug,
              "URL do setor",
              100,
            ).toLowerCase();
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
              fail(
                400,
                "A URL deve conter apenas letras minúsculas, números e hífens.",
              );
            if (
              get(
                "SELECT id FROM sectors WHERE slug=? AND id<>?",
                slug,
                before?.id || "",
              )
            )
              fail(409, "Esta URL já está sendo usada por outro setor.");
            const description = text(
              body.description ?? before?.description,
              "Descrição",
              500,
              true,
            );
            const active =
              body.active === undefined
                ? (before?.active ?? 1)
                : Number(body.active === true);
            const id = before?.id || uid();
            transaction(() => {
              if (before)
                run(
                  "UPDATE sectors SET name=?,slug=?,description=?,active=? WHERE id=?",
                  name,
                  slug,
                  description,
                  active,
                  id,
                );
              else
                run(
                  "INSERT INTO sectors VALUES(?,?,?,?,?,?)",
                  id,
                  name,
                  slug,
                  description,
                  active,
                  now(),
                );
              audit(user, before ? "updated" : "created", "sector", id, {
                name,
                slug,
                active: !!active,
              });
            });
            return send(
              {
                sector: sectorView(get("SELECT * FROM sectors WHERE id=?", id)),
              },
              before ? 200 : 201,
            );
          }
          if (method === "DELETE" && sectorMatch[1]) {
            run("UPDATE sectors SET active=0 WHERE id=?", sectorMatch[1]);
            audit(user, "deactivated", "sector", sectorMatch[1]);
            return send({ deactivated: true });
          }
        }
        const userMatch = path.match(/^\/api\/users(?:\/([^/]+))?$/);
        if (userMatch) {
          demandPermission(user, "canManageUsers");
          if (method === "GET")
            return send({
              users: all("SELECT * FROM users ORDER BY name").map(userView),
            });
          if (["POST", "PUT", "PATCH"].includes(method)) {
            const body = await readBody(req);
            const before =
              userMatch[1] &&
              get("SELECT * FROM users WHERE id=?", userMatch[1]);
            if (method !== "POST" && !before)
              fail(404, "Usuário não encontrado.");
            const name = text(body.name ?? before?.name, "Nome", 120);
            const email = validEmail(body.email ?? before?.email);
            if (
              get(
                "SELECT id FROM users WHERE email=? AND id<>?",
                email,
                before?.id || "",
              )
            )
              fail(409, "Já existe um usuário com este e-mail.");
            const role = body.role ?? before?.role ?? "sector_admin";
            if (!roles.includes(role)) fail(400, "Perfil inválido.");
            const previousSectorIds = before ? userView(before).sectorIds : [];
            const sectorIds = body.sectorIds ?? previousSectorIds;
            if (
              !Array.isArray(sectorIds) ||
              sectorIds.some(
                (id) =>
                  typeof id !== "string" ||
                  !get("SELECT id FROM sectors WHERE id=?", id),
              )
            )
              fail(400, "Selecione setores válidos.");
            if (role !== "superadmin" && !sectorIds.length)
              fail(400, "Selecione ao menos um setor para este perfil.");
            const active =
              body.active === undefined
                ? (before?.active ?? 1)
                : Number(body.active === true);
            if (before?.id === user.id && (!active || role !== "superadmin"))
              fail(
                400,
                "Você não pode remover seu próprio acesso de administrador.",
              );
            const temporaryPassword = body.temporaryPassword ?? body.password;
            const encoded = temporaryPassword
              ? passwordHash(temporaryPassword)
              : before?.password_hash;
            if (!encoded)
              fail(
                400,
                "Defina uma senha temporária com no mínimo 12 caracteres.",
              );
            const id = before?.id || uid();
            transaction(() => {
              if (before)
                run(
                  "UPDATE users SET name=?,email=?,role=?,active=?,password_hash=?,must_change_password=? WHERE id=?",
                  name,
                  email,
                  role,
                  active,
                  encoded,
                  temporaryPassword ? 1 : before.must_change_password,
                  id,
                );
              else
                run(
                  "INSERT INTO users(id,name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?,?)",
                  id,
                  name,
                  email,
                  encoded,
                  role,
                  active,
                  now(),
                );
              run("DELETE FROM user_sectors WHERE user_id=?", id);
              for (const sectorId of new Set(
                role === "superadmin" ? [] : sectorIds,
              ))
                run("INSERT INTO user_sectors VALUES(?,?)", id, sectorId);
              if (
                before &&
                (temporaryPassword ||
                  !active ||
                  role !== before.role ||
                  JSON.stringify(sectorIds) !==
                    JSON.stringify(previousSectorIds))
              )
                run("DELETE FROM sessions WHERE user_id=?", id);
              audit(user, before ? "updated" : "created", "user", id, {
                role,
                sectorIds,
                active: !!active,
              });
            });
            return send(
              { user: userView(get("SELECT * FROM users WHERE id=?", id)) },
              before ? 200 : 201,
            );
          }
        }
        const surveyMatch = path.match(/^\/api\/surveys(?:\/([^/]+))?$/);
        if (surveyMatch) {
          if (method === "GET")
            return send({
              surveys: all("SELECT * FROM surveys ORDER BY created_at DESC")
                .filter((s) => authorized(user, s.sector_id))
                .map(surveyView),
            });
          demandPermission(user, "canEditSurveys");
          if (["POST", "PUT", "PATCH"].includes(method)) {
            const body = await readBody(req);
            const before =
              surveyMatch[1] &&
              get("SELECT * FROM surveys WHERE id=?", surveyMatch[1]);
            if (method !== "POST" && !before)
              fail(404, "Pesquisa não encontrada.");
            const sectorId =
              before?.sector_id || text(body.sectorId, "Setor", 100);
            demandSector(user, sectorId);
            if (!get("SELECT id FROM sectors WHERE id=?", sectorId))
              fail(404, "Setor não encontrado.");
            const title = text(body.title ?? before?.title, "Título", 160);
            const description = text(
              body.description ?? before?.description,
              "Descrição",
              500,
              true,
            );
            const active =
              body.active === undefined
                ? (before?.active ?? 1)
                : Number(body.active === true);
            const questions = normalizeQuestions(
              body.questions ?? parse(before?.questions_json, []),
              parse(before?.questions_json, []),
            );
            const id = before?.id || uid();
            transaction(() => {
              if (active)
                run(
                  "UPDATE surveys SET active=0 WHERE sector_id=? AND id<>?",
                  sectorId,
                  id,
                );
              if (before)
                run(
                  "UPDATE surveys SET title=?,description=?,active=?,questions_json=?,updated_at=? WHERE id=?",
                  title,
                  description,
                  active,
                  JSON.stringify(questions),
                  now(),
                  id,
                );
              else
                run(
                  "INSERT INTO surveys VALUES(?,?,?,?,?,?,?,?)",
                  id,
                  sectorId,
                  title,
                  description,
                  active,
                  JSON.stringify(questions),
                  now(),
                  now(),
                );
              audit(user, before ? "updated" : "created", "survey", id, {
                title,
                active: !!active,
                questionCount: questions.length,
              });
            });
            return send(
              {
                survey: surveyView(get("SELECT * FROM surveys WHERE id=?", id)),
              },
              before ? 200 : 201,
            );
          }
          if (method === "DELETE" && surveyMatch[1]) {
            const survey = get(
              "SELECT * FROM surveys WHERE id=?",
              surveyMatch[1],
            );
            if (!survey) fail(404, "Pesquisa não encontrada.");
            demandSector(user, survey.sector_id);
            run(
              "UPDATE surveys SET active=0,updated_at=? WHERE id=?",
              now(),
              survey.id,
            );
            audit(user, "deactivated", "survey", survey.id);
            return send({ deactivated: true });
          }
        }
        if (path === "/api/responses" && method === "GET") {
          demandPermission(user, "canViewResponses");
          return send({
            responses: responseRows(user, url).map((row) =>
              responseView(row, user),
            ),
          });
        }
        if (path === "/api/dashboard" && method === "GET") {
          demandPermission(user, "canViewDashboard");
          const rows = responseRows(user, url);
          const submitted = rows.filter((r) => r.status === "submitted");
          const scope = scopedWhere(user, url);
          const ratingMap = new Map();
          const ratingValues = all(
            `SELECT a.response_id,a.value_json FROM answers a JOIN responses r ON r.id=a.response_id JOIN json_each(r.questions_json) q ON json_extract(q.value,'$.id')=a.question_id WHERE json_extract(q.value,'$.type')='rating' ${scope.sql.replace(/^WHERE/, "AND")}`,
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
            dateOnly(url.searchParams.get("to"), "Data final") ||
            hospitalDay(now());
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
            all(
              `SELECT ${monthColumn} AS month,count(*) AS count FROM responses r WHERE r.status='submitted' ${historyScope.sql.replace(/^WHERE/, "AND")} GROUP BY month`,
              ...historyScope.params,
            ).map((row) => [row.month, row.count]),
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
          const bySector = all("SELECT * FROM sectors ORDER BY name")
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
              submitted.filter(
                (r) => r.comment && r.manifestation_type === type,
              ).length,
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
          const lowScoreThreshold = settings().lowScoreThreshold;
          const criticalCount = submitted.filter(
            (row) => row.nps <= lowScoreThreshold,
          ).length;
          const previous = monthly.at(-2)?.count || 0;
          return send({
            nps: nps(submitted),
            satisfaction,
            responseCount: submitted.length,
            partialCount: rows.length - submitted.length,
            pendingCount: submitted.filter(
              (r) =>
                r.manifestation_status &&
                r.manifestation_status !== "resolvida",
            ).length,
            criticalCount,
            positivePercent: submitted.length
              ? Math.round(
                  (submitted.filter((r) => r.nps >= 9).length /
                    submitted.length) *
                    100,
                )
              : null,
            monthly,
            recent: rows.slice(0, 8).map((r) => responseView(r, user, false)),
            bySector,
            distribution: Array.from({ length: 11 }, (_, score) => ({
              score,
              count: submitted.filter((r) => r.nps === score).length,
            })),
            ratingDistribution,
            manifestationCounts,
            comparison: {
              responsePercent: previous
                ? Math.round(
                    ((monthly.at(-1).count - previous) / previous) * 100,
                  )
                : null,
              satisfactionDelta: null,
            },
          });
        }
        const manifestationMatch = path.match(
          /^\/api\/manifestations(?:\/([^/]+))?$/,
        );
        if (manifestationMatch) {
          demandPermission(user, "canViewManifestations");
          if (method === "GET") {
            const scope = scopedWhere(user, url);
            const rows = all(
              `SELECT m.*,r.sector_id,r.comment,r.phone,r.wants_contact,r.manifestation_type,s.name AS sector_name FROM manifestations m JOIN responses r ON r.id=m.response_id JOIN sectors s ON s.id=r.sector_id ${scope.sql} ORDER BY m.created_at DESC`,
              ...scope.params,
            );
            return send({
              manifestations: rows.map((row) => ({
                id: row.id,
                responseId: row.response_id,
                sectorId: row.sector_id,
                sectorName: row.sector_name,
                type: row.manifestation_type,
                comment: row.comment,
                ...(permissions(user).canViewContacts
                  ? { phone: row.phone }
                  : {}),
                wantsContact: !!row.wants_contact,
                status: row.status,
                internalNote: row.internal_note,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                history: parse(row.history_json, []),
              })),
            });
          }
          if (["PATCH", "PUT"].includes(method) && manifestationMatch[1]) {
            const before = get(
              "SELECT m.*,r.sector_id FROM manifestations m JOIN responses r ON r.id=m.response_id WHERE m.id=?",
              manifestationMatch[1],
            );
            if (!before) fail(404, "Manifestação não encontrada.");
            demandSector(user, before.sector_id);
            const body = await readBody(req);
            if (
              Object.keys(body).some(
                (key) => !["status", "internalNote"].includes(key),
              )
            )
              fail(400, "O relato original do paciente não pode ser alterado.");
            const status = body.status ?? before.status;
            if (!statuses.includes(status)) fail(400, "Situação inválida.");
            const note = text(
              body.internalNote ?? before.internal_note,
              "Observação interna",
              3000,
              true,
            );
            const timestamp = now();
            const history = [
              ...parse(before.history_json, []),
              { at: timestamp, by: user.name, status, note },
            ];
            transaction(() => {
              run(
                "UPDATE manifestations SET status=?,internal_note=?,updated_at=?,history_json=? WHERE id=?",
                status,
                note,
                timestamp,
                JSON.stringify(history),
                before.id,
              );
              audit(user, "updated", "manifestation", before.id, { status });
            });
            return send({ updated: true });
          }
        }
        if (path === "/api/settings") {
          demandPermission(user, "canManageSettings");
          if (method === "GET") return send({ settings: settings() });
          if (method === "PUT") {
            const body = await readBody(req);
            const input = body.settings || body;
            const current = settings();
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
            transaction(() => {
              for (const [key, value] of Object.entries(next))
                run(
                  "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json",
                  key,
                  JSON.stringify(value),
                );
              audit(user, "updated", "settings", "global", next);
            });
            return send({ settings: next });
          }
        }
        if (path === "/api/audit" && method === "GET") {
          demandPermission(user, "canManageSettings");
          const limit = integer(
            Number(url.searchParams.get("limit") || 100),
            1,
            500,
            "Limite",
          );
          const events = all(
            "SELECT a.*,u.name AS user_name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT ?",
            limit,
          );
          return send({
            events: events.map((row) => ({
              id: row.id,
              userId: row.user_id,
              userName: row.user_name || "Sistema",
              action: row.action,
              targetType: row.target_type,
              targetId: row.target_id,
              details: parse(row.details_json, {}),
              createdAt: row.created_at,
            })),
          });
        }
        if (path === "/api/exports" && method === "POST") {
          const body = await readBody(req);
          if (!["summary", "detailed"].includes(body.mode))
            fail(400, "Selecione uma modalidade de exportação válida.");
          demandPermission(
            user,
            body.mode === "detailed" ? "canExportDetails" : "canViewDashboard",
          );
          const sourceFilters = body.filters ?? {};
          if (
            !sourceFilters ||
            Array.isArray(sourceFilters) ||
            typeof sourceFilters !== "object"
          )
            fail(400, "Filtros de exportação inválidos.");
          const filters = {};
          const filterUrl = new URL("http://localhost");
          for (const key of ["sectorId", "from", "to"]) {
            const value = text(sourceFilters[key], "Filtro", 100, true);
            if (value) {
              filters[key] = value;
              filterUrl.searchParams.set(key, value);
            }
          }
          scopedWhere(user, filterUrl);
          audit(user, "export_generated", "export", uid(), {
            mode: body.mode,
            filters,
          });
          return send({ recorded: true });
        }
        fail(404, "Recurso não encontrado.");
      }
      if (!["GET", "HEAD"].includes(method)) fail(405, "Método não permitido.");
      const dist = resolve(root, "dist");
      const decoded = decodeURIComponent(path);
      const target = resolve(dist, `.${decoded}`);
      if (target !== dist && !target.startsWith(`${dist}${sep}`))
        fail(404, "Arquivo não encontrado.");
      const file =
        existsSync(target) && statSync(target).isFile()
          ? target
          : resolve(dist, "index.html");
      if (!existsSync(file)) {
        res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(
          "Interface ainda não compilada. Execute npm run dev para desenvolver ou npm run build para compilar.",
        );
      }
      const mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
        ".ico": "image/x-icon",
      };
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      if (extname(file) !== ".html")
        res.setHeader("Cache-Control", "public,max-age=3600");
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      });
      res.end(method === "HEAD" ? undefined : readFileSync(file));
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (!error.status) console.error("Erro interno da API:", error.message);
      send(
        {
          error: error.status
            ? error.message
            : "Não foi possível concluir a operação. Tente novamente.",
        },
        error.status || 500,
      );
    }
  });
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
