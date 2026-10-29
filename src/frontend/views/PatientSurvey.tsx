import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { api } from "../controllers/api";
import { Brand, RatingFaces, usePageTransition } from "../components/components";
import type { Question, Sector, Survey } from "../models/types";
import "../styles/patient.css";

type Value = string | number;
type Stage = "welcome" | "context" | "question" | "comment" | "thanks";
type PublicSurvey = {
  sector: Sector;
  survey: Survey;
  questions: Question[];
  demo?: boolean;
  settings?: {
    commentLimit?: number;
    autoResetSeconds?: number;
    lowScoreThreshold?: number;
  };
};
type ResponseSession = { id: string; token: string; questions?: Question[] };

function dayBeforeToday(offset = 0) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export default function PatientSurvey({ slug }: { slug: string }) {
  const [context, setContext] = useState<PublicSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>("welcome");
  const [session, setSession] = useState<ResponseSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [values, setValues] = useState<Record<string, Value>>({});
  const [draftText, setDraftText] = useState("");
  const [dateMode, setDateMode] = useState("");
  const [otherDate, setOtherDate] = useState("");
  const [shift, setShift] = useState("");
  const [comment, setComment] = useState("");
  const [manifestationType, setManifestationType] = useState("outro");
  const [wantsContact, setWantsContact] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failedAnswer, setFailedAnswer] = useState<Value | undefined>();
  const contentRef = usePageTransition(
    `${loading ? "loading" : stage}:${questionIndex}`,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestInFlight = useRef(false);
  const currentQuestion = questions[questionIndex];
  const npsQuestion = questions.find((item) => item.type === "nps");
  const nps = npsQuestion ? values[npsQuestion.id] : undefined;
  const commentLimit = context?.settings?.commentLimit ?? 1000;
  const autoResetSeconds = context?.settings?.autoResetSeconds ?? 10;
  const isLowNps =
    typeof nps === "number" &&
    nps <= (context?.settings?.lowScoreThreshold ?? 6);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const result = await api<PublicSurvey>(
        `/api/public/sectors/${encodeURIComponent(slug)}`,
        { signal },
      );
      if (signal?.aborted) return;
      setContext(result);
      setQuestions(result.questions ?? result.survey.questions ?? []);
    } catch (failure) {
      if (!signal?.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Não foi possível carregar a pesquisa.",
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
    setError("");
    setFailedAnswer(undefined);
    setDraftText(
      currentQuestion && typeof values[currentQuestion.id] === "string"
        ? String(values[currentQuestion.id])
        : "",
    );
  }, [stage, questionIndex]);

  useEffect(() => {
    if (stage !== "thanks") return;
    const timeout = window.setTimeout(reset, autoResetSeconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [stage, autoResetSeconds]);

  function reset() {
    setSession(null);
    setValues({});
    setQuestionIndex(0);
    setDateMode("");
    setOtherDate("");
    setShift("");
    setComment("");
    setManifestationType("outro");
    setWantsContact(false);
    setPhone("");
    setDraftText("");
    setError("");
    setFailedAnswer(undefined);
    setStage("welcome");
  }

  function nextQuestion() {
    setFailedAnswer(undefined);
    setError("");
    if (questionIndex + 1 < questions.length)
      setQuestionIndex((index) => index + 1);
    else setStage("comment");
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context || requestInFlight.current) return;
    if (dateMode === "other" && !otherDate) {
      setError("Escolha a data do atendimento ou selecione “Não sei”.");
      return;
    }
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const attendedOn =
        dateMode === "today"
          ? dayBeforeToday()
          : dateMode === "yesterday"
            ? dayBeforeToday(1)
            : dateMode === "other"
              ? otherDate
              : undefined;
      const result = await api<ResponseSession>("/api/public/responses", {
        method: "POST",
        body: {
          sectorId: context.sector.id,
          attendedOn,
          shift: shift || undefined,
        },
      });
      setSession(result);
      if (result.questions) setQuestions(result.questions);
      setQuestionIndex(0);
      setStage("question");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível iniciar. Tente novamente.",
      );
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  async function answer(value: Value) {
    if (!session || !currentQuestion || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    setFailedAnswer(undefined);
    try {
      await api(`/api/public/responses/${encodeURIComponent(session.id)}`, {
        method: "PUT",
        body: { token: session.token, questionId: currentQuestion.id, value },
      });
      setValues((previous) => ({ ...previous, [currentQuestion.id]: value }));
      if (currentQuestion.type === "nps" && typeof value === "number") {
        setManifestationType(
          value <= (context?.settings?.lowScoreThreshold ?? 6)
            ? "reclamacao"
            : "outro",
        );
      }
      nextQuestion();
    } catch (failure) {
      setFailedAnswer(value);
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível salvar a resposta. Tente novamente.",
      );
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  function back() {
    if (busy) return;
    if (stage === "comment") {
      setQuestionIndex(questions.length - 1);
      setStage("question");
    } else if (questionIndex > 0) setQuestionIndex((index) => index - 1);
    else reset();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || requestInFlight.current) return;
    if (typeof nps !== "number") {
      setError("Responda à pergunta de recomendação antes de enviar.");
      return;
    }
    if (wantsContact && !comment.trim()) {
      setError(
        "Escreva um comentário para que a ouvidoria possa ajudar com o retorno.",
      );
      return;
    }
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/public/responses/${encodeURIComponent(session.id)}/submit`,
        {
          method: "POST",
          body: {
            token: session.token,
            nps,
            comment: comment.trim(),
            manifestationType,
            wantsContact,
            phone: wantsContact ? phone.trim() : undefined,
          },
        },
      );
      setValues({});
      setSession(null);
      setComment("");
      setPhone("");
      setWantsContact(false);
      setDraftText("");
      setStage("thanks");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível enviar sua pesquisa. Suas respostas foram mantidas; tente novamente.",
      );
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  const errorMessage = error && (
    <div className="patient-error" role="alert">
      <span>{error}</span>
      {failedAnswer !== undefined && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void answer(failedAnswer)}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );

  return (
    <div
      className={`patient-app ${stage === "question" ? "patient-app--question" : ""}`}
    >
      {context?.demo && (
        <div className="patient-demo-banner">
          Demonstração · dados fictícios
        </div>
      )}
      <header className="patient-header">
        <Brand patient />
        {context && (
          <span className="patient-sector">
            {context.sector.name}
            {stage === "question" && currentQuestion && (
              <>
                {" "}
                <span aria-hidden="true">·</span> {currentQuestion.category}
              </>
            )}
          </span>
        )}
      </header>

      {loading ? (
        <main ref={contentRef} className="patient-status" aria-live="polite">
          <LoaderCircle className="spinner" size={28} />
          <p>Carregando pesquisa…</p>
        </main>
      ) : !context ? (
        <main ref={contentRef} className="patient-status">
          <h1 ref={headingRef} tabIndex={-1}>
            Pesquisa indisponível
          </h1>
          {errorMessage}
          <p>Confira o link ou procure a equipe do hospital.</p>
          <button className="btn" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </main>
      ) : stage === "welcome" ? (
        <main ref={contentRef} className="patient-hero">
          <span className="patient-watermark" aria-hidden="true">
            <img src="/assets/fhdod-logo.png" alt="" />
          </span>
          <div className="patient-hero-copy">
            <span className="patient-rule" aria-hidden="true" />
            <h1 ref={headingRef} tabIndex={-1}>
              Sua opinião
              <br />
              faz a diferença.
            </h1>
            <p>
              Esta pesquisa é rápida e ajuda a melhorar o atendimento da
              Fundação Hospitalar Dr. Oswaldo Diesel.
            </p>
            <button
              className="patient-primary"
              type="button"
              onClick={() => setStage(session ? "question" : "context")}
            >
              {session ? "Continuar pesquisa" : "Iniciar pesquisa"}
              <ArrowRight aria-hidden="true" />
            </button>
            <small>Você pode responder de forma anônima.</small>
          </div>
        </main>
      ) : stage === "context" ? (
        <main ref={contentRef} className="patient-context">
          <h1 ref={headingRef} tabIndex={-1}>
            Sobre seu atendimento
          </h1>
          <p>
            Essas informações ajudam a entender sua experiência. Se não lembrar,
            pode continuar sem informar.
          </p>
          <form onSubmit={(event) => void start(event)}>
            <fieldset disabled={busy}>
              <legend>Quando você foi atendido?</legend>
              <div className="patient-date-options">
                {[
                  ["today", "Hoje"],
                  ["yesterday", "Ontem"],
                  ["other", "Outra data"],
                  ["unknown", "Não sei"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={dateMode === value ? "selected" : ""}
                    aria-pressed={dateMode === value}
                    onClick={() => setDateMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {dateMode === "other" && (
                <label className="patient-field">
                  Data do atendimento
                  <input
                    type="date"
                    value={otherDate}
                    max={dayBeforeToday()}
                    required
                    onChange={(event) => setOtherDate(event.target.value)}
                  />
                </label>
              )}
              <label className="patient-field">
                Em qual turno?
                <select
                  value={shift}
                  onChange={(event) => setShift(event.target.value)}
                >
                  <option value="">Não sei informar</option>
                  <option value="manha">Manhã</option>
                  <option value="tarde">Tarde</option>
                  <option value="noite">Noite</option>
                </select>
              </label>
            </fieldset>
            {errorMessage}
            <div className="patient-actions">
              <button
                className="patient-back"
                type="button"
                disabled={busy}
                onClick={() => setStage("welcome")}
              >
                <ArrowLeft aria-hidden="true" />
                Voltar
              </button>
              <button className="patient-primary" type="submit" disabled={busy}>
                {busy ? "Iniciando…" : "Continuar"}
                {busy ? (
                  <LoaderCircle className="spinner" aria-hidden="true" />
                ) : (
                  <ArrowRight aria-hidden="true" />
                )}
              </button>
            </div>
          </form>
        </main>
      ) : stage === "question" && currentQuestion ? (
        <main ref={contentRef} className="patient-question">
          <div
            className="patient-progress"
            role="progressbar"
            aria-label="Progresso da pesquisa"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              ((questionIndex + 1) / (questions.length + 1)) * 100,
            )}
          >
            <span
              style={{
                width: `${((questionIndex + 1) / (questions.length + 1)) * 100}%`,
              }}
            />
          </div>
          <h1 ref={headingRef} tabIndex={-1}>
            {currentQuestion.text}
          </h1>
          {currentQuestion.type === "nps" && (
            <p className="patient-question-hint">
              Escolha uma nota de 0 a 10. Esta é a única pergunta obrigatória.
            </p>
          )}
          <div className="patient-answer-area" aria-busy={busy}>
            {currentQuestion.type === "rating" ? (
              <RatingFaces
                value={
                  typeof values[currentQuestion.id] === "number"
                    ? Number(values[currentQuestion.id])
                    : undefined
                }
                disabled={busy}
                onChange={(value: number) => void answer(value)}
              />
            ) : currentQuestion.type === "nps" ? (
              <div className="patient-nps">
                <div className="patient-nps-options">
                  {Array.from({ length: 11 }, (_, score) => (
                    <button
                      key={score}
                      type="button"
                      disabled={busy}
                      className={
                        values[currentQuestion.id] === score ? "selected" : ""
                      }
                      aria-label={`Nota ${score}`}
                      aria-pressed={values[currentQuestion.id] === score}
                      onClick={() => void answer(score)}
                    >
                      {score}
                    </button>
                  ))}
                </div>
                <div className="patient-nps-labels">
                  <span>Nada provável</span>
                  <span>Muito provável</span>
                </div>
              </div>
            ) : currentQuestion.type === "text" ? (
              <form
                className="patient-text-answer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draftText.trim()) void answer(draftText.trim());
                  else nextQuestion();
                }}
              >
                <label className="sr-only" htmlFor="patient-question-text">
                  Sua resposta
                </label>
                <textarea
                  id="patient-question-text"
                  maxLength={commentLimit}
                  placeholder="Escreva sua resposta, se quiser…"
                  value={draftText}
                  disabled={busy}
                  onChange={(event) => setDraftText(event.target.value)}
                />
                <small>
                  {draftText.length}/{commentLimit}
                </small>
                <button
                  className="patient-primary"
                  disabled={busy}
                  type="submit"
                >
                  Continuar
                  <ArrowRight aria-hidden="true" />
                </button>
              </form>
            ) : (
              <div className="patient-choice-options">
                {(currentQuestion.type === "yes_no"
                  ? ["Sim", "Não"]
                  : currentQuestion.options
                ).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={
                      values[currentQuestion.id] === option ? "selected" : ""
                    }
                    aria-pressed={values[currentQuestion.id] === option}
                    disabled={busy}
                    onClick={() => void answer(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="patient-save-state" aria-live="polite">
            {busy ? (
              <>
                <LoaderCircle size={18} className="spinner" />
                Salvando sua resposta…
              </>
            ) : (
              <span>&nbsp;</span>
            )}
          </div>
          {errorMessage}
          <div className="patient-question-actions">
            <button
              className="patient-back"
              disabled={busy}
              type="button"
              onClick={back}
            >
              <ArrowLeft aria-hidden="true" />
              Voltar
            </button>
            {currentQuestion.type !== "nps" && (
              <button
                className="patient-skip"
                type="button"
                disabled={busy}
                onClick={nextQuestion}
              >
                {values[currentQuestion.id] !== undefined
                  ? "Manter resposta e avançar"
                  : "Pular pergunta"}
                <ArrowRight aria-hidden="true" />
              </button>
            )}
          </div>
        </main>
      ) : stage === "comment" ? (
        <main ref={contentRef} className="patient-comment">
          <span className="patient-watermark" aria-hidden="true">
            <img src="/assets/fhdod-logo.png" alt="" />
          </span>
          <span className="patient-rule" aria-hidden="true" />
          <h1 ref={headingRef} tabIndex={-1}>
            {isLowNps ? (
              <>
                Conte o que
                <br />
                podemos melhorar
              </>
            ) : (
              <>
                Gostaria de deixar
                <br />
                algum comentário?
              </>
            )}
          </h1>
          <p>
            {isLowNps
              ? "Se quiser, conte à ouvidoria o que aconteceu no seu atendimento. Seu comentário é opcional e ajuda a identificar o que precisa melhorar."
              : "Use este espaço para compartilhar sugestões, elogios ou qualquer observação sobre seu atendimento."}
          </p>
          <form onSubmit={(event) => void submit(event)}>
            <label className="sr-only" htmlFor="patient-comment-text">
              Seu comentário (opcional)
            </label>
            <div className="patient-comment-input">
              <textarea
                id="patient-comment-text"
                maxLength={commentLimit}
                disabled={busy}
                placeholder="Digite seu comentário aqui…"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <small>
                {comment.length}/{commentLimit}
              </small>
            </div>
            {comment.trim() && (
              <label className="patient-field patient-comment-kind">
                Como você descreve seu comentário?
                <select
                  value={manifestationType}
                  disabled={busy}
                  onChange={(event) => setManifestationType(event.target.value)}
                >
                  <option value="outro">Outro</option>
                  <option value="elogio">Elogio</option>
                  <option value="reclamacao">Reclamação</option>
                  <option value="sugestao">Sugestão</option>
                </select>
              </label>
            )}
            <label className="patient-contact-toggle">
              <input
                type="checkbox"
                checked={wantsContact}
                disabled={busy}
                onChange={(event) => {
                  setWantsContact(event.target.checked);
                  if (!event.target.checked) setPhone("");
                }}
              />
              Quero receber um retorno da ouvidoria.
            </label>
            {wantsContact ? (
              <label className="patient-field patient-phone">
                Telefone para retorno
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={25}
                  minLength={8}
                  required
                  value={phone}
                  disabled={busy}
                  placeholder="DDD e telefone"
                  onChange={(event) => setPhone(event.target.value)}
                />
                <small>
                  Seu telefone será usado para o retorno e ficará restrito às
                  pessoas autorizadas.
                </small>
              </label>
            ) : (
              <small className="patient-anonymous">
                Sem telefone, sua participação permanece anônima. Evite incluir
                nomes ou dados pessoais no comentário.
              </small>
            )}
            {errorMessage}
            <div className="patient-actions">
              <button
                className="patient-back"
                disabled={busy}
                type="button"
                onClick={back}
              >
                <ArrowLeft aria-hidden="true" />
                Voltar
              </button>
              <button className="patient-primary" disabled={busy} type="submit">
                {busy ? "Enviando…" : "Enviar"}
                {busy ? (
                  <LoaderCircle className="spinner" aria-hidden="true" />
                ) : (
                  <ArrowRight aria-hidden="true" />
                )}
              </button>
            </div>
          </form>
        </main>
      ) : stage === "thanks" ? (
        <main ref={contentRef} className="patient-hero patient-thanks">
          <span className="patient-watermark" aria-hidden="true">
            <img src="/assets/fhdod-logo.png" alt="" />
          </span>
          <div className="patient-hero-copy">
            <span className="patient-rule" aria-hidden="true" />
            <h1 ref={headingRef} tabIndex={-1}>
              Obrigado por
              <br />
              sua participação!
            </h1>
            <p>
              <Check size={22} aria-hidden="true" /> Sua opinião foi registrada
              com sucesso.
              <br />
              Ela contribui para a melhoria do atendimento da Fundação
              Hospitalar Dr. Oswaldo Diesel.
            </p>
            <button className="patient-primary" type="button" onClick={reset}>
              Finalizar
              <ArrowRight aria-hidden="true" />
            </button>
            <small>
              Esta tela volta ao início automaticamente em {autoResetSeconds}{" "}
              segundos.
            </small>
          </div>
        </main>
      ) : (
        <main ref={contentRef} className="patient-status">
          <h1>Pesquisa sem perguntas</h1>
          <p>
            Procure a equipe do hospital para verificar a pesquisa deste setor.
          </p>
        </main>
      )}
      <footer className="patient-footer">
        Fundação Hospitalar Dr. Oswaldo Diesel <span aria-hidden="true">·</span>{" "}
        Pesquisa de satisfação
      </footer>
    </div>
  );
}
