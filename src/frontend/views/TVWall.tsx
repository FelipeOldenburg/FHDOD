import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Frown,
  Maximize2,
  Meh,
  Minimize2,
  QrCode,
  RefreshCw,
  Smile,
} from "lucide-react";
import { Brand } from "../components/components";
import { Evolution } from "../components/Evolution";
import { filterQuery } from "../controllers/api";
import type {
  Bootstrap,
  DashboardData,
  Filters,
  TVDevice,
  TVDisplayPayload,
  TVMetric,
} from "../models/types";
import { api } from "../services/api";

const REFRESH_INTERVAL = 30_000;
const ALL_METRICS: TVMetric[] = [
  "satisfaction",
  "responses",
  "nps",
  "pending",
  "trend",
  "sectors",
];

function formatMetric(value: number | null, decimals = 0) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPeriod(filters: Pick<Filters, "from" | "to">) {
  const format = (value: string) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
      new Date(`${value}T12:00:00Z`),
    );
  };
  if (!filters.from && !filters.to) return "Todo o período";
  if (filters.from && filters.to)
    return `${format(filters.from)} a ${format(filters.to)}`;
  return filters.from
    ? `Desde ${format(filters.from)}`
    : `Até ${format(filters.to)}`;
}

export function TVWall({
  bootstrap,
  filters,
  onExit,
  publicDisplay = false,
  onUnpaired,
}: {
  bootstrap?: Bootstrap;
  filters?: Filters;
  onExit?: () => void;
  publicDisplay?: boolean;
  onUnpaired?: (message?: string) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [device, setDevice] = useState<TVDevice | null>(null);
  const [publicSurveyTarget, setPublicSurveyTarget] = useState<
    TVDisplayPayload["surveyTarget"]
  >(null);
  const [qr, setQr] = useState({ href: "", dataUrl: "" });
  const [hospitalName, setHospitalName] = useState(
    bootstrap?.settings?.hospitalName || "FHDOD",
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    setError("");
    try {
      if (publicDisplay) {
        const response = await fetch("/api/public/tv/dashboard", {
          credentials: "same-origin",
        });
        const result = (await response.json().catch(() => ({}))) as
          | TVDisplayPayload
          | { error?: string };
        if (!response.ok) {
          if (response.status === 401) {
            onUnpaired?.(
              "A vinculação desta TV expirou ou foi revogada. Use um novo código.",
            );
            return;
          }
          throw new Error(
            "error" in result && result.error
              ? result.error
              : "Não foi possível atualizar os indicadores.",
          );
        }
        const payload = result as TVDisplayPayload;
        setData(payload.dashboard);
        setDevice(payload.device);
        setPublicSurveyTarget(payload.surveyTarget);
        setHospitalName(payload.settings.hospitalName);
      } else {
        if (!filters) throw new Error("Período do TV Wall não informado.");
        const next = await api<DashboardData>(
          `/api/dashboard${filterQuery(filters)}`,
        );
        setData(next);
      }
      setLastUpdated(new Date());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, onUnpaired, publicDisplay]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1_000);
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, (device?.refreshSeconds ?? REFRESH_INTERVAL / 1000) * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [device?.refreshSeconds, load]);

  const previewSurveyTarget = useMemo(() => {
    if (!bootstrap) return null;
    const available = bootstrap.sectors.filter((sector) =>
      sector.active && bootstrap.surveys.some(
        (survey) => survey.active && survey.sectorId === sector.id,
      ),
    );
    const selected = filters?.sectorId && filters.sectorId !== "all"
      ? available.find((sector) => sector.id === filters.sectorId)
      : available[0];
    return selected
      ? { id: selected.id, name: selected.name, slug: selected.slug }
      : null;
  }, [bootstrap, filters?.sectorId]);
  const surveyTarget = publicDisplay ? publicSurveyTarget : previewSurveyTarget;
  const qrHref = surveyTarget
    ? `${window.location.origin}/avaliar/${encodeURIComponent(surveyTarget.slug)}`
    : "";

  useEffect(() => {
    if (!qrHref) return;
    let active = true;
    void QRCode.toDataURL(qrHref, {
      width: 720,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#232429", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (active) setQr({ href: qrHref, dataUrl });
      })
      .catch(() => {
        if (active) setQr({ href: qrHref, dataUrl: "" });
      });
    return () => {
      active = false;
    };
  }, [qrHref]);
  const qrDataUrl = qr.href === qrHref ? qr.dataUrl : "";
  const metrics = device?.metrics ?? ALL_METRICS;
  const showSatisfaction = metrics.includes("satisfaction");
  const keyMetrics = metrics.filter((metric) =>
    ["responses", "nps", "pending"].includes(metric),
  );
  const showTrend = metrics.includes("trend");
  const showParticipation = metrics.includes("sectors");
  const hasIndicators = showSatisfaction || showTrend || keyMetrics.length > 0;
  const satisfaction = data?.satisfaction ?? null;
  const ratings = data?.ratingDistribution ?? [];
  const ratingCount = ratings.reduce((sum, item) => sum + item.count, 0);
  const positiveRatings = ratings.reduce((sum, item) => item.score >= 4 ? sum + item.count : sum, 0);
  const satisfactionTone = satisfaction == null || (satisfaction >= 2.5 && satisfaction < 3.5)
    ? "neutral"
    : satisfaction >= 3.5 ? "positive" : "negative";
  const SatisfactionIcon = satisfactionTone === "positive" ? Smile : satisfactionTone === "negative" ? Frown : Meh;
  const satisfactionLabel = satisfaction == null ? "Aguardando avaliações"
    : satisfaction >= 4.5 ? "Ótima satisfação"
    : satisfaction >= 3.5 ? "Boa satisfação"
    : satisfaction >= 2.5 ? "Satisfação regular" : "Satisfação baixa";
  const periodLabel = publicDisplay
    ? device?.periodRange ? formatPeriod(device.periodRange) : device?.periodLabel || "Período configurado"
    : filters
      ? formatPeriod(filters)
      : "Período configurado";
  const refreshLabel = `${device?.refreshSeconds ?? 30}s`;
  const clock = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(now);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  return (
    <div className="tv-wall">
      <a className="skip-link" href="#tv-wall-content">
        Ir para os indicadores
      </a>
      <header className="tv-wall-header">
        <div className="tv-wall-brand">
          <Brand />
          <div className="tv-wall-heading">
            <h1>Experiência do paciente</h1>
            <p>
              {hospitalName} · {device?.name || "TV Wall"}
            </p>
          </div>
        </div>
        <div className="tv-wall-status">
          <span className="tv-wall-live">
            Atualização automática
          </span>
          <span>{periodLabel} · a cada {refreshLabel}</span>
        </div>
        <div className="tv-wall-time" aria-label={`${date}, ${clock}`}>
          <strong>{clock}</strong>
          <span>{date}</span>
        </div>
        <div className="tv-wall-actions">
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            aria-label="Atualizar indicadores agora"
            title="Atualizar agora"
          >
            <RefreshCw className={refreshing ? "spin" : ""} size={22} />
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
            title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {fullscreen ? <Minimize2 size={22} /> : <Maximize2 size={22} />}
          </button>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              aria-label="Voltar ao painel"
              title="Voltar ao painel"
            >
              <ArrowLeft size={22} />
            </button>
          )}
        </div>
      </header>

      <main
        id="tv-wall-content"
        className={`tv-wall-content${data && hasIndicators && showParticipation ? " with-participation" : ""}`}
        tabIndex={-1}
      >
        {error && !data ? (
          <section className="tv-wall-message" role="alert">
            <h2>Não foi possível atualizar os indicadores</h2>
            <p>{error}</p>
            <button type="button" onClick={() => void load()}>
              Tentar novamente
            </button>
          </section>
        ) : loading ? (
          <section className="tv-wall-message" aria-live="polite">
            <RefreshCw className="spin" size={34} />
            <h2>Carregando indicadores…</h2>
          </section>
        ) : (
          <>
            {showParticipation && (
              <section className="tv-wall-participation" aria-labelledby="tv-wall-participation-title">
                {surveyTarget && <span className="tv-wall-sector-badge">{surveyTarget.name}</span>}
                <h2 id="tv-wall-participation-title">Sua experiência importa.</h2>
                {surveyTarget && qrDataUrl ? (
                  <a className="tv-wall-participation-code" href={qrHref}>
                    <img src={qrDataUrl} alt={`Abrir a pesquisa de ${surveyTarget.name}`} width={720} height={720} />
                  </a>
                ) : (
                  <div className="tv-wall-participation-placeholder">
                    <QrCode aria-hidden="true" />
                  </div>
                )}
                <div className="tv-wall-participation-copy">
                  <strong>
                    {qrDataUrl ? "Avalie seu atendimento" : surveyTarget && qr.href !== qrHref ? "Preparando QR Code…" : "QR Code indisponível"}
                  </strong>
                  <p>
                    {qrDataUrl
                      ? "Aponte a câmera do celular para participar."
                      : !surveyTarget
                        ? "Publique uma pesquisa e escolha o setor do QR Code nas configurações desta TV."
                        : qr.href === qrHref && <a href={qrHref}>Abrir a pesquisa</a>}
                  </p>
                </div>
              </section>
            )}
            {hasIndicators && (
              <div className="tv-wall-indicators">
                {showSatisfaction && (
                  <section className="tv-wall-satisfaction" data-tone={satisfactionTone}>
                    <h2>Satisfação geral</h2>
                    <div className="tv-wall-satisfaction-summary">
                      <div>
                        <p className="tv-wall-satisfaction-value">
                          <strong>{formatMetric(satisfaction, 1)}</strong>
                          <span>/ 5,0</span>
                        </p>
                        <p className="tv-wall-satisfaction-label">{satisfactionLabel}</p>
                      </div>
                      <span className="tv-wall-satisfaction-icon" aria-hidden="true">
                        <SatisfactionIcon strokeWidth={1.3} />
                      </span>
                    </div>
                    <div className="tv-wall-satisfaction-track" aria-hidden="true">
                      <span style={{ width: `${((satisfaction ?? 0) / 5) * 100}%` }} />
                    </div>
                    {ratingCount > 0 && (
                      <p className="tv-wall-satisfaction-note">
                        {formatMetric(Math.round((positiveRatings / ratingCount) * 100))}% das notas são positivas
                      </p>
                    )}
                  </section>
                )}
                {showTrend && (
                  <section className="tv-wall-trend">
                    <header>
                      <div>
                        <h2>Evolução das avaliações</h2>
                        <p>Histórico dos últimos seis meses</p>
                      </div>
                      <span className="tv-wall-sector-badge">Mensal</span>
                    </header>
                    <Evolution items={data?.monthly ?? []} />
                  </section>
                )}
                {keyMetrics.length > 0 && (
                  <dl className="tv-wall-key-metrics" aria-label="Indicadores do período">
                    {keyMetrics.includes("responses") && (
                      <div>
                        <dt>Respostas recebidas</dt>
                        <dd>{formatMetric(data?.responseCount ?? 0)}</dd>
                      </div>
                    )}
                    {keyMetrics.includes("nps") && (
                      <div className="tv-wall-nps">
                        <dt>NPS geral</dt>
                        <dd>{formatMetric(data?.nps ?? null)}</dd>
                      </div>
                    )}
                    {keyMetrics.includes("pending") && (
                      <div>
                        <dt>Manifestações pendentes</dt>
                        <dd>{formatMetric(data?.pendingCount ?? 0)}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="tv-wall-footer" aria-live="polite">
        <span>Dados consolidados, sem informações pessoais de pacientes.</span>
        <span>
          {error && data
            ? "A última atualização falhou; mantendo os dados anteriores."
            : lastUpdated
              ? `Atualizado às ${new Intl.DateTimeFormat("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZone: "America/Sao_Paulo",
                }).format(lastUpdated)}`
              : "Sincronizando dados…"}
        </span>
      </footer>
    </div>
  );
}
