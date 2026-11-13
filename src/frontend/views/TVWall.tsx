import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  QrCode,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { Brand } from "../components/components";
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

function formatPeriod(filters: Filters) {
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
  const [qrDataUrl, setQrDataUrl] = useState("");
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
      bootstrap.surveys.some(
        (survey) => survey.active && survey.sectorId === sector.id,
      ),
    );
    const selected = filters?.sectorId
      ? available.find((sector) => sector.id === filters.sectorId)
      : available[0];
    return selected
      ? { id: selected.id, name: selected.name, slug: selected.slug }
      : null;
  }, [bootstrap, filters?.sectorId]);
  const surveyTarget = publicDisplay ? publicSurveyTarget : previewSurveyTarget;

  useEffect(() => {
    let active = true;
    if (!surveyTarget) {
      setQrDataUrl("");
      return () => {
        active = false;
      };
    }
    void QRCode.toDataURL(
      `${window.location.origin}/avaliar/${surveyTarget.slug}`,
      {
        width: 360,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#232429", light: "#ffffff" },
      },
    )
      .then((value) => {
        if (active) setQrDataUrl(value);
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [surveyTarget]);
  const monthly = data?.monthly ?? [];
  const monthlyMax = Math.max(1, ...monthly.map((item) => item.count));
  const metrics = device?.metrics ?? ALL_METRICS;
  const showSatisfaction = metrics.includes("satisfaction");
  const keyMetrics = metrics.filter((metric) =>
    ["responses", "nps", "pending"].includes(metric),
  );
  const showTrend = metrics.includes("trend");
  const showSectors = metrics.includes("sectors");
  const hasOverview = showSatisfaction || keyMetrics.length > 0;
  const periodLabel = publicDisplay
    ? device?.periodLabel || "Período configurado"
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
          <div className="tv-wall-mobile-context">
            <strong>{device?.name || "TV Wall"}</strong>
            <span>{periodLabel} · atualiza a cada {refreshLabel}</span>
          </div>
          <div className="tv-wall-heading">
            <h1>Experiência do paciente</h1>
            <p>
              {hospitalName} · {device?.name || "TV Wall"}
            </p>
          </div>
        </div>
        <div className="tv-wall-status">
          <span className="tv-wall-live">
            <Wifi size={16} aria-hidden="true" />
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
        className={`tv-wall-content${!showTrend && !showSectors ? " without-details" : ""}${!hasOverview ? " without-overview" : ""}`}
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
            {hasOverview && <section
              className={`tv-wall-overview${!showSatisfaction ? " without-satisfaction" : ""}${!keyMetrics.length ? " without-key-metrics" : ""}`}
              aria-label="Indicadores principais"
            >
              {showSatisfaction && (
                <article className="tv-wall-satisfaction">
                  <div>
                    <h2>Satisfação geral</h2>
                    <p>Média das avaliações recebidas</p>
                  </div>
                  <strong>
                    {formatMetric(data?.satisfaction ?? null, 1)}
                    <small>/5</small>
                  </strong>
                  <p className="tv-wall-satisfaction-note">
                    {data?.positivePercent == null
                      ? "Aguardando novas avaliações"
                      : `${formatMetric(data.positivePercent)}% das avaliações são positivas`}
                  </p>
                </article>
              )}

              {!!keyMetrics.length && (
                <div
                  className="tv-wall-key-metrics"
                  style={{
                    gridTemplateColumns: `repeat(${keyMetrics.length}, minmax(0, 1fr))`,
                  }}
                >
                  {keyMetrics.includes("responses") && (
                    <article>
                      <h2>Respostas</h2>
                      <strong>{formatMetric(data?.responseCount ?? 0)}</strong>
                      <p>No período selecionado</p>
                    </article>
                  )}
                  {keyMetrics.includes("nps") && (
                    <article>
                      <h2>NPS geral</h2>
                      <strong>{formatMetric(data?.nps ?? null)}</strong>
                      <p>Recomendação dos pacientes</p>
                    </article>
                  )}
                  {keyMetrics.includes("pending") && (
                    <article>
                      <h2>Atenção necessária</h2>
                      <strong>{formatMetric(data?.pendingCount ?? 0)}</strong>
                      <p>Manifestações pendentes</p>
                    </article>
                  )}
                </div>
              )}
            </section>}

            {(showTrend || showSectors) && (
            <section className={`tv-wall-details${showTrend !== showSectors ? " single-detail" : ""}`}>
              {showTrend && <article className="tv-wall-trend">
                <header>
                  <div>
                    <h2>Respostas ao longo dos meses</h2>
                    <p>Volume mensal de avaliações concluídas</p>
                  </div>
                  {data?.comparison.responsePercent != null && (
                    <span>
                      {data.comparison.responsePercent >= 0 ? "+" : ""}
                      {formatMetric(data.comparison.responsePercent)}% no mês
                    </span>
                  )}
                </header>
                <div
                  className="tv-wall-chart"
                  role="img"
                  aria-label={monthly
                    .map((item) => `${item.label}: ${item.count} respostas`)
                    .join(", ")}
                >
                  {monthly.some((item) => item.count) ? (
                    monthly.map((item, index) => (
                      <div className="tv-wall-chart-column" key={item.month}>
                        <div className="tv-wall-chart-track">
                          <span
                            className={index === monthly.length - 1 ? "current" : ""}
                            style={{
                              height: `${item.count ? Math.max(8, (item.count / monthlyMax) * 100) : 0}%`,
                            }}
                          >
                            <b>{item.count}</b>
                          </span>
                        </div>
                        <small>{item.label}</small>
                      </div>
                    ))
                  ) : (
                    <p className="tv-wall-chart-empty">
                      As respostas aparecerão aqui assim que forem recebidas.
                    </p>
                  )}
                </div>
              </article>}

              {showSectors && (
                <article
                  className={`tv-wall-participation${qrDataUrl && surveyTarget ? "" : " is-empty"}`}
                  aria-label="Participação na pesquisa de satisfação"
                >
                  <div className="tv-wall-participation-code">
                    {qrDataUrl && surveyTarget ? (
                      <img
                        src={qrDataUrl}
                        alt={`QR Code da pesquisa de ${surveyTarget.name}`}
                      />
                    ) : (
                      <QrCode aria-hidden="true" />
                    )}
                  </div>
                  <div className="tv-wall-participation-copy">
                    <h2>
                      {surveyTarget
                        ? "Avalie seu atendimento"
                        : "QR Code indisponível"}
                    </h2>
                    <p>
                      {surveyTarget
                        ? "Aponte a câmera do celular para o código e conte como foi sua experiência."
                        : "Publique uma pesquisa e escolha o setor do QR Code nas configurações desta TV."}
                    </p>
                    {surveyTarget && <strong>{surveyTarget.name}</strong>}
                  </div>
                </article>
              )}
            </section>
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
