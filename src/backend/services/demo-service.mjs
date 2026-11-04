import { randomUUID, createHash } from "node:crypto";
const uid = () => randomUUID();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();

export async function seedDemo({ all, run, transaction, normalizeQuestions }) {
  if ((await all("SELECT id FROM sectors LIMIT 1")).length) return;
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
  await transaction(async () => {
    for (const [index, [name, slug]] of sectors.entries()) {
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
      await run(
        "INSERT INTO sectors VALUES(?,?,?,?,1,?)",
        sectorId,
        name,
        slug,
        "Setor de demonstração — dados fictícios.",
        now(),
      );
      await run(
        "INSERT INTO surveys VALUES(?,?,?,?,1,?,?,?)",
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
        await run(
          "INSERT INTO responses(id,survey_id,sector_id,token_hash,status,questions_json,attended_on,shift,created_at) VALUES(?,?,?,?,'partial',?,?,?,?)",
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
          await run(
            "INSERT INTO answers VALUES(?,?,?,?)",
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
        await run(
          "UPDATE responses SET status='submitted',submitted_at=?,nps=?,comment=?,manifestation_type=? WHERE id=?",
          timestamp,
          score,
          comment,
          pair[0],
          id,
        );
        if (comment)
          await run(
            "INSERT INTO manifestations(id,response_id,created_at,updated_at) VALUES(?,?,?,?)",
            uid(),
            id,
            timestamp,
            timestamp,
          );
      }
    }
  });
}
