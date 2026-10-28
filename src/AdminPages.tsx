import { startTransition, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Eye,
  GripVertical,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { api, filterQuery } from "./api";
import {
  Card,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageTitle,
  RatingFaces,
  StatusBadge,
  formatDate,
  formatNumber,
} from "./components";
import type {
  Bootstrap,
  DashboardData,
  Filters,
  Question,
  QuestionType,
  ResponseRow,
  Survey,
} from "./types";

export interface AdminProps {
  data: Bootstrap;
  filters: Filters;
  onRefresh: () => Promise<void>;
  notify: (message: string) => void;
  onNavigate: (route: string) => void;
}
const types: Record<QuestionType, string> = {
  rating: "Escala de rostos (1 a 5)",
  nps: "NPS (0 a 10)",
  yes_no: "Sim / Não",
  choice: "Múltipla escolha",
  text: "Texto livre",
};

export function Evolution({ items }: { items: DashboardData["monthly"] }) {
  const safeItems = Array.isArray(items) ? items : [];
  const max = Math.max(1, ...safeItems.map((item) => item.count));
  return (
    <div
      className="evolution-chart"
      role="img"
      aria-label={safeItems
        .map((item) => `${item.label}: ${item.count} respostas`)
        .join(", ")}
    >
      {safeItems.map((item, index) => (
        <div className="chart-column" key={item.month}>
          <div className="bar-track">
            <span
              className={`chart-bar ${index === safeItems.length - 1 ? "current" : ""}`}
              style={{
                height: `${item.count ? Math.max(6, (item.count / max) * 100) : 0}%`,
              }}
              title={`${item.count} respostas`}
            >
              <span>{item.count}</span>
            </span>
          </div>
          <span>{item.label}</span>
        </div>
      ))}
      {!safeItems.some((item) => item.count) && (
        <p className="chart-empty">As respostas aparecerão aqui.</p>
      )}
    </div>
  );
}
export function ResponseTable({
  responses,
  onSelect,
}: {
  responses: ResponseRow[];
  onSelect?: (response: ResponseRow) => void;
}) {
  const safeResponses = Array.isArray(responses) ? responses : [];
  return safeResponses.length ? (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Setor</th>
            <th>Respondido em</th>
            <th>NPS</th>
            <th>Situação</th>
            {onSelect && (
              <th>
                <span className="sr-only">Detalhes</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {safeResponses.map((response) => (
            <tr key={response.id}>
              <td>{response.sectorName}</td>
              <td>{formatDate(response.submittedAt || response.createdAt)}</td>
              <td className="red-text">
                {response.nps ?? "—"}
                {response.nps != null && <small> / 10</small>}
              </td>
              <td>
                <StatusBadge
                  tone={response.status === "submitted" ? "green" : "amber"}
                >
                  {response.status === "submitted" ? "Recebida" : "Parcial"}
                </StatusBadge>
              </td>
              {onSelect && (
                <td>
                  <button
                    className="text-button"
                    onClick={() => onSelect(response)}
                    aria-label={`Ver avaliação de ${response.sectorName} em ${formatDate(response.createdAt)}`}
                  >
                    <Eye size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState
      title="Nenhuma resposta neste período"
      description="Compartilhe o link da pesquisa para começar a ouvir os pacientes."
    />
  );
}
export function ResponseDetail({
  response,
  onClose,
}: {
  response: ResponseRow;
  onClose: () => void;
}) {
  return (
    <Modal title="Detalhes da avaliação" onClose={onClose}>
      <p className="muted">
        {response.sectorName} ·{" "}
        {formatDate(response.submittedAt || response.createdAt, true)}
      </p>
      <div className="detail-summary">
        <span>
          NPS <strong>{response.nps ?? "—"} / 10</strong>
        </span>
        <span>
          Atendimento <strong>{formatDate(response.attendedOn)}</strong>
        </span>
        <span>
          Turno <strong>{response.shift || "Não informado"}</strong>
        </span>
      </div>
      <div className="answer-list">
        {response.answers?.map((answer) => (
          <div key={answer.questionId}>
            <strong>{answer.questionText}</strong>
            <p>
              {typeof answer.value === "boolean"
                ? answer.value
                  ? "Sim"
                  : "Não"
                : String(answer.value)}
            </p>
            <small className="muted">
              Respondido em {formatDate(answer.answeredAt, true)}
            </small>
          </div>
        ))}
      </div>
      {response.comment && (
        <div className="patient-original">
          <h3>Relato original do paciente</h3>
          <p>{response.comment}</p>
        </div>
      )}
      <p className="muted text-small">
        As respostas originais são preservadas e não podem ser editadas.
      </p>
    </Modal>
  );
}
export function Dashboard({ data, filters, onNavigate }: AdminProps) {
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      if (document.visibilityState === "hidden") return;
      api<DashboardData>(`/api/dashboard${filterQuery(filters)}`, {
        signal: controller.signal,
      })
        .then((result) => {
          startTransition(() => {
            setStats(result);
            setError("");
          });
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [filters, data]);
  if (error)
    return (
      <div className="error-banner" role="alert">
        {error}
      </div>
    );
  if (!stats) return <Loading />;
  const bySector = Array.isArray(stats.bySector) ? stats.bySector : [];
  const recent = Array.isArray(stats.recent) ? stats.recent : [];
  const responseCount = stats.responseCount ?? 0;
  const pendingCount = stats.pendingCount ?? 0;
  const largest = Math.max(1, ...bySector.map((s) => s.count));
  return (
    <div className="dashboard-grid">
      <Card
        title="NPS geral"
        subtitle="Recomendação dos pacientes"
        className="nps-card"
      >
        <div className="nps-value">
          <span>NPS</span>
          <strong>{formatNumber(stats.nps)}</strong>
          <small>
            {stats.nps == null
              ? "Aguardando avaliações"
              : "Promotores menos detratores"}
          </small>
        </div>
      </Card>
      <Card title="Respostas recebidas" className="responses-card">
        <div className="metric-line">
          <strong>{formatNumber(responseCount)}</strong>
        </div>
        <small className="metric-caption">
          {responseCount === 0
            ? "Nenhuma resposta no período"
            : "No período selecionado"}
        </small>
      </Card>
      <Card
        title="Evolução das avaliações"
        subtitle="Histórico dos últimos seis meses"
        className="evolution-card"
      >
        <span className="chart-period">Mensal</span>
        <Evolution items={stats.monthly} />
      </Card>
      <Card
        title="Satisfação geral"
        subtitle="Média das avaliações"
        className="satisfaction-card"
      >
        <div className="satisfaction-value">
          <strong className={stats.satisfaction == null ? "is-empty" : ""}>
            {stats.satisfaction == null
              ? "Sem dados"
              : formatNumber(stats.satisfaction, 1)}
          </strong>
          {stats.satisfaction != null && <span>/ 5,0</span>}
        </div>
        <p className="metric-note">
          {stats.positivePercent == null
            ? "Ainda não há avaliações no período selecionado."
            : `${formatNumber(stats.positivePercent)}% de promotores no NPS`}
        </p>
      </Card>
      <Card title="Manifestações pendentes" className="pending-card">
        <button
          className="metric-action"
          onClick={() => onNavigate("/ouvidoria")}
          disabled={!data.permissions.canViewManifestations}
        >
          <strong>{pendingCount}</strong>
          <span>Em aberto</span>
          <ArrowUpRight size={17} />
        </button>
      </Card>
      <Card title="Setores avaliados" className="mobile-sector-card">
        <strong>{bySector.length}</strong>
        <small>
          {bySector.length === 0
            ? "Nenhum no período"
            : "Com respostas no período"}
        </small>
      </Card>
      <Card
        title="Últimas avaliações"
        subtitle="Respostas recentes no período"
        className="recent-card"
      >
        <ResponseTable responses={recent.slice(0, 4)} />
      </Card>
      <Card
        title="Respostas por setor"
        subtitle="Distribuição no período"
        className="by-sector-card"
      >
        {bySector.length ? (
          <div className="sector-bars">
            {bySector.map((sector, index) => (
              <div key={sector.id}>
                <div>
                  <span>{sector.name}</span>
                  <small>{sector.count}</small>
                </div>
                <div className="progress-track">
                  <span
                    className={index === 0 ? "strong" : ""}
                    style={{ width: `${(sector.count / largest) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma resposta por setor"
            description="Os dados aparecerão aqui após as primeiras avaliações do período."
            action={
              data.permissions.canManageSectors && data.sectors.length === 0 && (
                <button
                  className="text-button"
                  onClick={() => onNavigate("/setores")}
                >
                  Cadastrar setor <ArrowUpRight size={14} />
                </button>
              )
            }
          />
        )}
      </Card>
    </div>
  );
}

export function Surveys({ data, onRefresh, notify, onNavigate }: AdminProps) {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState("");
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const surveys = data.surveys.filter(
    (s) =>
      (!sector || s.sectorId === sector) &&
      (!status || (status === "active" ? s.active : !s.active)) &&
      s.title
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ survey: Survey }>("/api/surveys", {
        method: "POST",
        body: {
          sectorId: form.get("sectorId"),
          title: form.get("title"),
          description: form.get("description"),
          active: false,
        },
      });
      await onRefresh();
      setCreate(false);
      notify("Pesquisa criada. Configure as perguntas antes de publicar.");
      onNavigate(`/pesquisas/${result.survey.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Pesquisas"
        description="Gerencie os questionários publicados para cada setor."
        action={
          data.permissions.canEditSurveys && (
            <button
              className="button"
              onClick={() => setCreate(true)}
              disabled={!data.sectors.length}
            >
              <Plus size={16} /> Nova pesquisa
            </button>
          )
        }
      />
      <div className="filter-card">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Buscar pesquisa"
            placeholder="Buscar pesquisa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className="input"
          aria-label="Filtrar setor da pesquisa"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
        >
          <option value="">Todos os setores</option>
          {data.sectors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Status da pesquisa"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="active">Ativas</option>
          <option value="inactive">Rascunhos / pausadas</option>
        </select>
      </div>
      <Card
        title="Pesquisas cadastradas"
        subtitle="Selecione uma pesquisa para editar suas perguntas, ordem e publicação."
      >
        {surveys.length ? (
          <div className="table-wrap">
            <table className="data-table roomy">
              <thead>
                <tr>
                  <th>Pesquisa</th>
                  <th>Setor</th>
                  <th>Perguntas</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {surveys.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>
                      {data.sectors.find((se) => se.id === s.sectorId)?.name}
                    </td>
                    <td>{s.questions.filter((q) => q.active).length}</td>
                    <td>
                      <StatusBadge tone={s.active ? "green" : "neutral"}>
                        {s.active ? "Ativa" : "Rascunho / pausada"}
                      </StatusBadge>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => onNavigate(`/pesquisas/${s.id}`)}
                      >
                        {data.permissions.canEditSurveys
                          ? "Editar"
                          : "Visualizar"}{" "}
                        <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nenhuma pesquisa encontrada"
            description={
              data.sectors.length
                ? "Crie uma pesquisa para começar a ouvir este setor."
                : "Cadastre primeiro os setores do hospital."
            }
            action={
              !data.sectors.length &&
              data.permissions.canManageSectors && (
                <button
                  className="button secondary"
                  onClick={() => onNavigate("/setores")}
                >
                  Cadastrar setor
                </button>
              )
            }
          />
        )}
      </Card>
      {create && (
        <Modal title="Nova pesquisa" onClose={() => setCreate(false)}>
          <form onSubmit={submit} className="stack-form">
            <Field label="Nome da pesquisa">
              <input
                className="input"
                name="title"
                maxLength={160}
                required
                autoFocus
                placeholder="Ex.: Pesquisa de satisfação"
              />
            </Field>
            <Field label="Setor">
              <select className="input" name="sectorId" required>
                {data.sectors
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Descrição (opcional)">
              <textarea className="input" name="description" maxLength={1000} />
            </Field>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <button className="button" disabled={busy}>
              {busy ? "Criando…" : "Criar pesquisa"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function QuestionEditor({
  data,
  surveyId,
  onRefresh,
  notify,
  onNavigate,
  onDirtyChange,
}: AdminProps & { surveyId: string; onDirtyChange: (dirty: boolean) => void }) {
  const original = data.surveys.find((s) => s.id === surveyId);
  const [draft, setDraft] = useState<Survey | undefined>(() =>
    original ? structuredClone(original) : undefined,
  );
  const [selected, setSelected] = useState(original?.questions[0]?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const question = draft?.questions.find((q) => q.id === selected);
  const editable = data.permissions.canEditSurveys;
  const [preview, setPreview] = useState<number>();
  function update(change: Partial<Question>) {
    if (!draft || !question || !editable) return;
    setDraft({
      ...draft,
      questions: draft.questions.map((q) =>
        q.id === question.id ? { ...q, ...change } : q,
      ),
    });
    onDirtyChange(true);
  }
  function move(id: string, offset: number) {
    if (!draft) return;
    const list = [...draft.questions];
    const idx = list.findIndex((q) => q.id === id);
    const next = idx + offset;
    if (
      idx < 0 ||
      next < 0 ||
      next >= list.length ||
      list[idx].type === "nps" ||
      list[next].type === "nps"
    )
      return;
    [list[idx], list[next]] = [list[next], list[idx]];
    setDraft({ ...draft, questions: list });
    onDirtyChange(true);
  }
  function add() {
    if (!draft) return;
    const item: Question = {
      id: crypto.randomUUID(),
      text: "Nova pergunta",
      type: "rating",
      category: "Atendimento",
      options: [],
      position: draft.questions.length - 1,
      active: true,
      version: 1,
    };
    setDraft({
      ...draft,
      questions: [
        ...draft.questions.filter((q) => q.type !== "nps"),
        item,
        ...draft.questions.filter((q) => q.type === "nps"),
      ],
    });
    setSelected(item.id);
    onDirtyChange(true);
  }
  async function publish(active: boolean) {
    if (!draft) return;
    if (
      !active &&
      draft.active &&
      !window.confirm(
        "Salvar as alterações e pausar a pesquisa? O link deixará de receber novas respostas até a próxima publicação.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/surveys/${draft.id}`, {
        method: "PUT",
        body: {
          title: draft.title,
          description: draft.description,
          active,
          questions: draft.questions,
        },
      });
      await onRefresh();
      setDraft({ ...draft, active });
      onDirtyChange(false);
      notify(
        active
          ? "Alterações publicadas. A pesquisa já está disponível."
          : "Pesquisa pausada. O link não recebe novas avaliações.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!draft || !original)
    return (
      <EmptyState
        title="Pesquisa não encontrada"
        action={
          <button className="button" onClick={() => onNavigate("/pesquisas")}>
            Voltar às pesquisas
          </button>
        }
      />
    );
  const sector = data.sectors.find((s) => s.id === draft.sectorId);
  return (
    <>
      <PageTitle
        title="Editor de perguntas"
        description={`${sector?.name} · ${draft.title}`}
        action={
          editable && (
            <>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void publish(false)}
              >
                {draft.active ? "Salvar e pausar" : "Salvar rascunho"}
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => void publish(true)}
              >
                <Check size={16} />
                {busy ? "Publicando…" : "Publicar alterações"}
              </button>
            </>
          )
        }
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="editor-layout">
        <Card
          title="Perguntas"
          subtitle="Arraste ou use as setas para reordenar."
        >
          {editable && (
            <button className="button secondary add-question" onClick={add}>
              <Plus size={15} />
              Adicionar pergunta
            </button>
          )}
          <ol className="question-list">
            {draft.questions.map((q, index) => (
              <li
                key={q.id}
                className={selected === q.id ? "active" : ""}
                draggable={editable && q.type !== "nps"}
                onDragStart={() => setDragged(q.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragged) {
                    const previous = draft.questions.findIndex(
                      (p) => p.id === dragged,
                    );
                    move(dragged, index - previous);
                    setDragged(null);
                  }
                }}
              >
                <button
                  className="question-select"
                  onClick={() => {
                    setSelected(q.id);
                    setPreview(undefined);
                  }}
                >
                  <GripVertical size={14} />
                  <span className="question-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{q.category}</strong>
                    <small>
                      {types[q.type]}
                      {q.type === "nps" ? " · obrigatória" : ""}
                    </small>
                  </span>
                </button>
                {editable && q.type !== "nps" && (
                  <div className="reorder-actions">
                    <button
                      aria-label={`Mover pergunta ${index + 1} para cima`}
                      className="icon-button"
                      disabled={index === 0}
                      onClick={() => move(q.id, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      aria-label={`Mover pergunta ${index + 1} para baixo`}
                      className="icon-button"
                      disabled={index >= draft.questions.length - 2}
                      onClick={() => move(q.id, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Card>
        <Card
          title={question?.text}
          subtitle={
            question
              ? `Pergunta ${String(draft.questions.indexOf(question) + 1).padStart(2, "0")} · Categoria: ${question.category}`
              : undefined
          }
        >
          {question && (
            <div className="question-fields">
              <Field label="Enunciado">
                <textarea
                  className="input"
                  value={question.text}
                  maxLength={500}
                  disabled={!editable || question.type === "nps"}
                  onChange={(e) => update({ text: e.target.value })}
                />
              </Field>
              <div className="form-grid">
                <Field label="Tipo de resposta">
                  <select
                    className="input"
                    value={question.type}
                    disabled={!editable || question.type === "nps"}
                    onChange={(e) =>
                      update({ type: e.target.value as QuestionType })
                    }
                  >
                    {Object.entries(types)
                      .filter(
                        ([key]) => key !== "nps" || question.type === "nps",
                      )
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Categoria">
                  <input
                    className="input"
                    list="categories"
                    value={question.category}
                    disabled={!editable || question.type === "nps"}
                    maxLength={80}
                    onChange={(e) => update({ category: e.target.value })}
                  />
                  <datalist id="categories">
                    {data.categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
              </div>
              {question.type === "choice" && (
                <Field label="Opções (uma por linha)">
                  <textarea
                    className="input"
                    value={question.options.join("\n")}
                    onChange={(e) =>
                      update({ options: e.target.value.split("\n") })
                    }
                    placeholder={
                      "Até 30 minutos\nDe 30 a 60 minutos\nMais de 60 minutos"
                    }
                  />
                </Field>
              )}
              <div>
                <h3 className="preview-title">Pré-visualização</h3>
                <div className="question-preview">
                  <p>{question.text}</p>
                  {question.type === "rating" ? (
                    <RatingFaces value={preview} onChange={setPreview} />
                  ) : question.type === "nps" ? (
                    <div className="nps-preview">
                      {Array.from({ length: 11 }, (_, n) => (
                        <span key={n}>{n}</span>
                      ))}
                    </div>
                  ) : question.type === "yes_no" ? (
                    <div className="preview-options">
                      <span>Sim</span>
                      <span>Não</span>
                    </div>
                  ) : question.type === "choice" ? (
                    <div className="preview-options">
                      {question.options.filter(Boolean).map((o, i) => (
                        <span key={i}>{o}</span>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      className="input"
                      placeholder="Digite sua resposta aqui…"
                      disabled
                    />
                  )}
                </div>
              </div>
              <div className="question-footer">
                <StatusBadge tone={question.type === "nps" ? "red" : "neutral"}>
                  {question.type === "nps" ? "Obrigatória" : "Opcional"}
                </StatusBadge>
                {editable && question.type !== "nps" && (
                  <button
                    className="text-button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Remover esta pergunta da nova versão da pesquisa? Respostas anteriores serão preservadas.",
                        )
                      )
                        return;
                      const rest = draft.questions.filter(
                        (q) => q.id !== question.id,
                      );
                      setDraft({ ...draft, questions: rest });
                      setSelected(rest[0]?.id);
                      onDirtyChange(true);
                    }}
                  >
                    <Trash2 size={15} />
                    Remover pergunta
                  </button>
                )}
                <span className="draft-hint">
                  <Save size={13} /> Publique para aplicar
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export function Results(props: AdminProps) {
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [selected, setSelected] = useState<ResponseRow | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    Promise.all([
      api<DashboardData>(`/api/dashboard${filterQuery(props.filters)}`, {
        signal: controller.signal,
      }),
      props.data.permissions.canViewResponses
        ? api<{ responses: ResponseRow[] }>(
            `/api/responses${filterQuery(props.filters)}`,
            { signal: controller.signal },
          )
        : Promise.resolve({ responses: [] }),
    ])
      .then(([d, r]) => {
        startTransition(() => {
          setStats(d);
          setResponses(r.responses);
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [props.filters, props.data]);
  if (error)
    return (
      <p className="error-banner" role="alert">
        {error}
      </p>
    );
  if (!stats) return <Loading />;
  const total = stats.ratingDistribution.reduce((sum, d) => sum + d.count, 0);
  return (
    <>
      <PageTitle
        title="Resultados"
        description="Analise as avaliações por setor e período."
        action={
          <button
            className="button"
            onClick={() => props.onNavigate("/relatorios")}
          >
            Exportar relatório
          </button>
        }
      />
      <div className="stats-row">
        {[
          ["Respostas", formatNumber(stats.responseCount)],
          ["Satisfação média", `${formatNumber(stats.satisfaction, 1)} / 5`],
          ["NPS", formatNumber(stats.nps)],
          ["Avaliações críticas", formatNumber(stats.criticalCount)],
        ].map(([label, value]) => (
          <Card title={label} key={label}>
            <strong
              className={`stat-value ${label === "NPS" ? "red-text" : ""}`}
            >
              {value}
            </strong>
          </Card>
        ))}
      </div>
      <div className="results-grid">
        <Card
          title="Evolução das respostas"
          subtitle="Quantidade recebida em cada mês"
        >
          <Evolution items={stats.monthly} />
        </Card>
        <Card
          title="Distribuição de avaliações"
          subtitle="Escala de satisfação de 1 a 5"
        >
          <div className="distribution-bars">
            {[...stats.ratingDistribution]
              .sort((a, b) => b.score - a.score)
              .map((d) => (
                <div key={d.score}>
                  <span>
                    {d.score} ·{" "}
                    {
                      ["Muito ruim", "Ruim", "Regular", "Bom", "Muito bom"][
                        d.score - 1
                      ]
                    }
                  </span>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${total ? (d.count / total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <small>{d.count}</small>
                </div>
              ))}
          </div>
        </Card>
      </div>
      {props.data.permissions.canViewResponses && (
        <Card
          title="Avaliações recebidas"
          subtitle="Abra uma avaliação para consultar as respostas originais."
        >
          <ResponseTable responses={responses} onSelect={setSelected} />
        </Card>
      )}
      {selected && (
        <ResponseDetail response={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
