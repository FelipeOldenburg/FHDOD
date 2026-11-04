import { randomBytes, randomUUID } from "node:crypto";
import { questionTypes, manifestationTypes } from "../../shared/contracts.ts";
import {
  authorized,
  demandPermission,
  demandSector,
} from "../middleware/permissions.mjs";
import {
  dateOnly,
  fail,
  integer,
  parse,
  text,
} from "../middleware/validation.mjs";
import { hashToken } from "./auth-service.mjs";
import { hospitalDay } from "./calendar.mjs";

export const surveyView = (row) => ({
  id: row.id,
  sectorId: row.sector_id,
  title: row.title,
  description: row.description,
  active: !!row.active,
  questions: parse(row.questions_json, []),
  updatedAt: row.updated_at,
});

export function normalizeQuestions(input, previous = []) {
  if (!Array.isArray(input) || input.length > 50)
    fail(400, "A pesquisa deve ter no máximo 50 perguntas.");
  if (
    input.some(
      (question) =>
        !question ||
        typeof question !== "object" ||
        !questionTypes.includes(question.type),
    )
  )
    fail(400, "Tipo de pergunta inválido.");
  const ids = new Set();
  const questions = input
    .filter((question) => question.type !== "nps")
    .map((item, position) => {
      const id = item.id || randomUUID();
      if (typeof id !== "string" || ids.has(id) || id.length > 100)
        fail(400, "Identificador de pergunta inválido ou duplicado.");
      ids.add(id);
      const options =
        item.type === "choice" && Array.isArray(item.options)
          ? item.options.map((value) => text(value, "Alternativa", 120))
          : [];
      if (
        item.type === "choice" &&
        (options.length < 2 ||
          options.length > 10 ||
          new Set(options).size !== options.length)
      )
        fail(400, "Informe de 2 a 10 alternativas diferentes.");
      const question = {
        id,
        text: text(item.text, "Pergunta", 500),
        type: item.type,
        category: text(item.category || "Atendimento", "Categoria", 80),
        options,
        position,
        active: item.active !== false,
        version: 1,
      };
      const before = previous.find((entry) => entry.id === id);
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
  const suppliedNps = input.find((question) => question.type === "nps");
  const priorNps = previous.find((question) => question.type === "nps");
  const npsId = priorNps?.id || suppliedNps?.id || randomUUID();
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

export function createSurveyService(
  { get, all, run, transaction },
  { settings, audit, sectorView },
) {
  const list = async (user) =>
    (await all("SELECT * FROM surveys ORDER BY created_at DESC"))
      .filter((survey) => authorized(user, survey.sector_id))
      .map(surveyView);

  async function save(user, id, body) {
    demandPermission(user, "canEditSurveys");
    return transaction(async () => {
      let before = id && (await get("SELECT * FROM surveys WHERE id=?", id));
      if (id && !before) fail(404, "Pesquisa não encontrada.");
      const sectorId = before?.sector_id || text(body.sectorId, "Setor", 100);
      demandSector(user, sectorId);
      if (
        !(await get("SELECT id FROM sectors WHERE id=? FOR UPDATE", sectorId))
      )
        fail(404, "Setor não encontrado.");
      if (before)
        before = await get("SELECT * FROM surveys WHERE id=? FOR UPDATE", id);
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
      const surveyId = before?.id || randomUUID();
      if (active)
        await run(
          "UPDATE surveys SET active=0 WHERE sector_id=? AND id<>?",
          sectorId,
          surveyId,
        );
      const timestamp = new Date().toISOString();
      if (before)
        await run(
          "UPDATE surveys SET title=?,description=?,active=?,questions_json=?,updated_at=? WHERE id=?",
          title,
          description,
          active,
          JSON.stringify(questions),
          timestamp,
          surveyId,
        );
      else
        await run(
          "INSERT INTO surveys VALUES(?,?,?,?,?,?,?,?)",
          surveyId,
          sectorId,
          title,
          description,
          active,
          JSON.stringify(questions),
          timestamp,
          timestamp,
        );
      await audit(user, before ? "updated" : "created", "survey", surveyId, {
        title,
        active: !!active,
        questionCount: questions.length,
      });
      return {
        survey: surveyView(
          await get("SELECT * FROM surveys WHERE id=?", surveyId),
        ),
        created: !before,
      };
    });
  }
  async function deactivate(user, id) {
    demandPermission(user, "canEditSurveys");
    return transaction(async () => {
      const survey = await get("SELECT * FROM surveys WHERE id=?", id);
      if (!survey) fail(404, "Pesquisa não encontrada.");
      demandSector(user, survey.sector_id);
      await get(
        "SELECT id FROM sectors WHERE id=? FOR UPDATE",
        survey.sector_id,
      );
      await run(
        "UPDATE surveys SET active=0,updated_at=? WHERE id=?",
        new Date().toISOString(),
        id,
      );
      await audit(user, "deactivated", "survey", id);
      return { deactivated: true };
    });
  }
  async function loadPublicSector(slug) {
    const sector = await get(
      "SELECT * FROM sectors WHERE slug=? AND active=1",
      slug,
    );
    if (!sector) fail(404, "Este setor não está disponível.");
    const row = await get(
      "SELECT * FROM surveys WHERE sector_id=? AND active=1",
      sector.id,
    );
    if (!row) fail(404, "Este setor ainda não tem uma pesquisa publicada.");
    const survey = surveyView(row);
    const questions = survey.questions.filter((question) => question.active);
    return {
      sector: sectorView(sector),
      survey: { ...survey, questions },
      questions,
      settings: await settings(),
    };
  }
  async function startResponse(body) {
    const sector = await get(
      "SELECT * FROM sectors WHERE id=? AND active=1",
      text(body.sectorId, "Setor", 100),
    );
    const survey =
      sector &&
      (await get(
        "SELECT * FROM surveys WHERE sector_id=? AND active=1",
        sector.id,
      ));
    if (!survey) fail(404, "Não há pesquisa publicada para este setor.");
    const attendedOn = dateOnly(body.attendedOn, "Data do atendimento");
    const timestamp = new Date().toISOString();
    if (attendedOn && attendedOn > hospitalDay(timestamp))
      fail(400, "A data do atendimento não pode estar no futuro.");
    const shift = text(body.shift, "Turno", 80, true);
    const id = randomUUID();
    const token = randomBytes(32).toString("hex");
    const questions = parse(survey.questions_json, []).filter(
      (question) => question.active,
    );
    await run(
      "INSERT INTO responses(id,survey_id,sector_id,token_hash,questions_json,attended_on,shift,created_at) VALUES(?,?,?,?,?,?,?,?)",
      id,
      survey.id,
      sector.id,
      hashToken(token),
      JSON.stringify(questions),
      attendedOn,
      shift,
      timestamp,
    );
    return { id, token, questions };
  }
  async function publicResponse(id, token) {
    const row = await get("SELECT * FROM responses WHERE id=? FOR UPDATE", id);
    if (
      !row ||
      typeof token !== "string" ||
      hashToken(token) !== row.token_hash
    )
      fail(404, "Esta pesquisa não foi encontrada. Reabra o link do setor.");
    if (row.status === "submitted")
      fail(409, "Esta pesquisa já foi enviada e não pode ser alterada.");
    if (Date.now() - Date.parse(row.created_at) > 24 * 60 * 60 * 1000)
      fail(410, "Esta pesquisa expirou. Reabra o link do setor.");
    return row;
  }
  async function saveAnswer(id, body) {
    return transaction(async () => {
      const response = await publicResponse(id, body.token);
      const question = parse(response.questions_json, []).find(
        (entry) => entry.id === body.questionId,
      );
      if (!question)
        fail(400, "Esta pergunta não pertence à pesquisa iniciada.");
      let value = body.value;
      if (question.type === "rating") value = integer(value, 1, 5, "Avaliação");
      if (question.type === "nps") value = integer(value, 0, 10, "NPS");
      if (
        question.type === "yes_no" &&
        ![true, false, "Sim", "Não", "sim", "não"].includes(value)
      )
        fail(400, "Selecione sim ou não.");
      if (question.type === "choice" && !question.options.includes(value))
        fail(400, "Selecione uma das alternativas disponíveis.");
      if (question.type === "text")
        value = text(value, "Resposta", (await settings()).commentLimit, true);
      await run(
        "INSERT INTO answers VALUES(?,?,?,?) ON CONFLICT(response_id,question_id) DO UPDATE SET value_json=excluded.value_json,answered_at=excluded.answered_at",
        response.id,
        question.id,
        JSON.stringify(value),
        new Date().toISOString(),
      );
      return { saved: true };
    });
  }
  async function submitResponse(id, body) {
    const value = integer(body.nps, 0, 10, "NPS");
    const config = await settings();
    const comment = text(body.comment, "Comentário", config.commentLimit, true);
    const type =
      body.manifestationType ||
      (value <= config.lowScoreThreshold ? "reclamacao" : "outro");
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
    return transaction(async () => {
      const response = await publicResponse(id, body.token);
      const timestamp = new Date().toISOString();
      const npsQuestion = parse(response.questions_json, []).find(
        (question) => question.type === "nps",
      );
      if (npsQuestion) {
        const prior = await get(
          "SELECT * FROM answers WHERE response_id=? AND question_id=?",
          id,
          npsQuestion.id,
        );
        if (!prior || parse(prior.value_json) !== value)
          await run(
            "INSERT INTO answers VALUES(?,?,?,?) ON CONFLICT(response_id,question_id) DO UPDATE SET value_json=excluded.value_json,answered_at=excluded.answered_at",
            id,
            npsQuestion.id,
            JSON.stringify(value),
            timestamp,
          );
      }
      await run(
        "UPDATE responses SET status='submitted',submitted_at=?,nps=?,comment=?,manifestation_type=?,phone=?,wants_contact=? WHERE id=?",
        timestamp,
        value,
        comment,
        type,
        phone,
        Number(wantsContact),
        id,
      );
      if (comment)
        await run(
          "INSERT INTO manifestations(id,response_id,created_at,updated_at) VALUES(?,?,?,?)",
          randomUUID(),
          id,
          timestamp,
          timestamp,
        );
      return { submitted: true, id };
    });
  }

  return {
    list,
    save,
    deactivate,
    loadPublicSector,
    startResponse,
    saveAnswer,
    submitResponse,
    normalizeQuestions,
    surveyView,
  };
}
