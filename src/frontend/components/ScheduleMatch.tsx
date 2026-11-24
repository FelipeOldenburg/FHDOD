import { useEffect, useId, useState } from "react";
import { api } from "../services/api";
import type { ScheduledProfessional } from "../models/types";
import { formatDate } from "./components";

type Match = {
  professionals: ScheduledProfessional[];
  precision: "time" | "response_time" | "date" | "none";
  attendedAt: string | null;
};

const precisionLabels: Record<Match["precision"], string> = {
  time: "Setor, data e horário informados no atendimento.",
  response_time: "Horário estimado pelo início da avaliação.",
  date: "Plantões do dia. O horário do atendimento não foi informado.",
  none: "A avaliação não tem data de atendimento para consultar.",
};

export function ScheduleMatch({ responseId, canOpenSchedule = false }: {
  responseId: string;
  canOpenSchedule?: boolean;
}) {
  const titleId = useId();
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<Match>(`/api/responses/${encodeURIComponent(responseId)}/scheduled-professionals`, {
      signal: controller.signal,
    }).then(setMatch).catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Não foi possível consultar a escala.");
    });
    return () => controller.abort();
  }, [responseId, retry]);

  const importIds = [...new Set(match?.professionals.map(({ importId }) => importId).filter(Boolean))];
  const time = match?.attendedAt?.slice(11, 16);
  return (
    <section className="schedule-match" aria-labelledby={titleId}>
      <div>
        <h3 id={titleId}>Profissionais em escala</h3>
        {match?.attendedAt && (
          <p>{formatDate(match.attendedAt.slice(0, 10))}{time && ` às ${time}`}</p>
        )}
      </div>
      {match && <p>{precisionLabels[match.precision]}</p>}
      {error ? (
        <div>
          <p className="text-small" role="alert">{error}</p>
          <button type="button" className="text-button" onClick={() => {
            setError("");
            setRetry((count) => count + 1);
          }}>Tentar novamente</button>
        </div>
      ) : !match ? (
        <p className="text-small" role="status">Consultando escala…</p>
      ) : match.professionals.length ? (
        <>
          <ul>
            {match.professionals.map((professional) => (
              <li key={professional.id}>
                <strong>{professional.name}</strong>
                <span>{[professional.registration, professional.specialty].filter(Boolean).join(" · ") || "Registro não informado"}</span>
                <small>
                  {professional.startsAt.slice(11, 16)} a {professional.endsAt.slice(11, 16)}
                  {professional.startsAt.slice(0, 10) !== professional.endsAt.slice(0, 10) && " do dia seguinte"}
                </small>
              </li>
            ))}
          </ul>
          <small>O cruzamento indica presença em plantão. A avaliação da responsabilidade é feita pela equipe.</small>
          {canOpenSchedule && importIds.map((id, index) => (
            <a key={id} className="text-action" href={`/escalas?import=${encodeURIComponent(id)}`} target="_blank" rel="noopener">
              Ver escala importada{importIds.length > 1 && ` ${index + 1}`}
            </a>
          ))}
        </>
      ) : match.precision !== "none" && (
        <p className="text-small">Nenhuma escala importada corresponde a este atendimento.</p>
      )}
    </section>
  );
}
