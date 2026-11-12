import { useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Clock3,
  Copy,
  Link2,
  MonitorUp,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "../services/api";
import {
  Card,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageTitle,
  StatusBadge,
} from "../components/components";
import type {
  Bootstrap,
  TVDevice,
  TVMetric,
} from "../models/types";

interface TVDevicesProps {
  data: Bootstrap;
  notify: (message: string) => void;
}

type Draft = {
  name: string;
  allSectors: boolean;
  sectorIds: string[];
  qrSectorId: string;
  metrics: TVMetric[];
  period: TVDevice["period"];
  refreshSeconds: number;
};

const allMetrics: { id: TVMetric; label: string; description: string }[] = [
  { id: "satisfaction", label: "Satisfação geral", description: "Média das avaliações" },
  { id: "responses", label: "Respostas", description: "Volume no período" },
  { id: "nps", label: "NPS geral", description: "Recomendação dos pacientes" },
  { id: "pending", label: "Atenção necessária", description: "Manifestações pendentes" },
  { id: "trend", label: "Evolução mensal", description: "Gráfico dos últimos meses" },
  { id: "sectors", label: "Setores", description: "Participação por setor" },
];

const statusInfo: Record<
  TVDevice["status"],
  { label: string; tone: "green" | "amber" | "neutral" | "red"; icon: typeof Wifi }
> = {
  online: { label: "Online", tone: "green", icon: Wifi },
  offline: { label: "Offline", tone: "neutral", icon: WifiOff },
  awaiting_pairing: { label: "Aguardando vínculo", tone: "amber", icon: Link2 },
  pairing_expired: { label: "Código expirado", tone: "amber", icon: Clock3 },
  revoked: { label: "Revogada", tone: "red", icon: Unplug },
};

const emptyDraft = (): Draft => ({
  name: "",
  allSectors: true,
  sectorIds: [],
  qrSectorId: "",
  metrics: allMetrics.map((metric) => metric.id),
  period: "current_month",
  refreshSeconds: 30,
});

const toDraft = (device: TVDevice): Draft => ({
  name: device.name,
  allSectors: device.allSectors,
  sectorIds: device.sectorIds,
  qrSectorId: device.qrSectorId || "",
  metrics: device.metrics,
  period: device.period,
  refreshSeconds: device.refreshSeconds,
});

const dateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Nunca conectou";

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";

export function TVDevices({ data, notify }: TVDevicesProps) {
  const [devices, setDevices] = useState<TVDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TVDevice | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pairing, setPairing] = useState<{
    device: TVDevice;
    code: string;
    expiresAt: string;
  } | null>(null);

  async function load() {
    setError("");
    try {
      const result = await api<{ devices: TVDevice[] }>("/api/tv-devices");
      setDevices(result.devices);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function openEditor(device: TVDevice | "new") {
    setError("");
    setEditing(device);
    const next = device === "new" ? emptyDraft() : toDraft(device);
    if (device === "new" && data.sectors.length)
      next.qrSectorId = data.sectors.find((sector) => sector.active)?.id || "";
    setDraft(next);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.allSectors && !draft.sectorIds.length) {
      setError("Selecione ao menos um setor para esta TV.");
      return;
    }
    if (!draft.metrics.length) {
      setError("Selecione ao menos um indicador para esta TV.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing === "new") {
        const result = await api<{
          device: TVDevice;
          pairingCode: string;
          pairingExpiresAt: string;
        }>("/api/tv-devices", { method: "POST", body: draft });
        setPairing({
          device: result.device,
          code: result.pairingCode,
          expiresAt: result.pairingExpiresAt,
        });
        notify("TV cadastrada. Use o código para vinculá-la.");
      } else if (editing) {
        await api(`/api/tv-devices/${editing.id}`, {
          method: "PUT",
          body: draft,
        });
        notify("Configuração da TV atualizada.");
      }
      setEditing(null);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function newCode(device: TVDevice) {
    if (
      device.status === "online" &&
      !window.confirm(
        `Gerar outro código desconectará agora a ${device.name}. Continuar?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        device: TVDevice;
        pairingCode: string;
        pairingExpiresAt: string;
      }>(`/api/tv-devices/${device.id}/pairing-code`, { method: "POST" });
      setPairing({
        device: result.device,
        code: result.pairingCode,
        expiresAt: result.pairingExpiresAt,
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(device: TVDevice) {
    if (
      !window.confirm(
        `Revogar o acesso da ${device.name}? Ela deixará de exibir os indicadores.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/tv-devices/${device.id}`, { method: "DELETE" });
      notify("Acesso da TV revogado.");
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        title="Dispositivos TV Wall"
        description="Vincule, configure e acompanhe cada tela do hospital sem compartilhar contas administrativas."
        action={
          <button className="button" onClick={() => openEditor("new")}>
            <Plus size={16} />
            Cadastrar TV
          </button>
        }
      />

      <section className="tv-device-guide" aria-labelledby="tv-device-guide-title">
        <div>
          <MonitorUp size={28} aria-hidden="true" />
          <div>
            <h2 id="tv-device-guide-title">Como vincular uma tela</h2>
            <p>
              Abra <strong>{window.location.origin}/tv</strong> na televisão e
              informe o código de 6 dígitos gerado aqui.
            </p>
          </div>
        </div>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${window.location.origin}/tv`);
              notify("Endereço da TV copiado.");
            } catch {
              notify("Não foi possível copiar o endereço.");
            }
          }}
        >
          <Copy size={15} />
          Copiar endereço
        </button>
      </section>

      {error && !editing && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}

      <Card
        title="Telas cadastradas"
        subtitle="Cada dispositivo mantém sua própria vinculação, setores e indicadores."
        className="tv-devices-card"
      >
        {loading ? (
          <Loading label="Carregando dispositivos…" />
        ) : devices.length ? (
          <div className="tv-device-list">
            {devices.map((device) => {
              const status = statusInfo[device.status];
              const StatusIcon = status.icon;
              return (
                <article className="tv-device-row" key={device.id}>
                  <div className="tv-device-identity">
                    <span className="tv-device-icon" aria-hidden="true">
                      <MonitorUp size={21} />
                    </span>
                    <div>
                      <h3>{device.name}</h3>
                      <span>{device.sectorNames.join(", ")}</span>
                    </div>
                  </div>
                  <div className="tv-device-status">
                    <StatusBadge tone={status.tone}>
                      <StatusIcon size={12} />
                      {status.label}
                    </StatusBadge>
                    <small>Última conexão: {dateTime(device.lastSeenAt)}</small>
                  </div>
                  <div className="tv-device-summary">
                    <span>
                      {device.period === "current_month"
                        ? "Este mês"
                        : device.period === "last_7_days"
                          ? "Últimos 7 dias"
                          : "Últimos 30 dias"}
                    </span>
                    <span>Atualiza a cada {device.refreshSeconds}s</span>
                    <span>{device.metrics.length} indicadores</span>
                    <span>
                      {device.qrSectorName
                        ? `QR: ${device.qrSectorName}`
                        : "QR Code desativado"}
                    </span>
                  </div>
                  <div className="tv-device-actions">
                    <button
                      className="icon-button"
                      onClick={() => openEditor(device)}
                      aria-label={`Editar ${device.name}`}
                      title="Editar configuração"
                      disabled={busy}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => void newCode(device)}
                      aria-label={`Gerar código para ${device.name}`}
                      title="Gerar novo código"
                      disabled={busy}
                    >
                      <RefreshCw size={16} />
                    </button>
                    {device.status !== "revoked" && (
                      <button
                        className="icon-button danger-icon-button"
                        onClick={() => void revoke(device)}
                        aria-label={`Revogar ${device.name}`}
                        title="Revogar acesso"
                        disabled={busy}
                      >
                        <Unplug size={16} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma TV cadastrada"
            description="Cadastre a primeira tela para gerar um código de vinculação."
            action={
              <button className="button" onClick={() => openEditor("new")}>
                <Plus size={16} />
                Cadastrar primeira TV
              </button>
            }
          />
        )}
      </Card>

      {editing && (
        <Modal
          title={editing === "new" ? "Cadastrar TV" : `Editar ${editing.name}`}
          onClose={() => !busy && setEditing(null)}
        >
          <form className="tv-device-form" onSubmit={save}>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <Field label="Nome da tela" hint="Use um nome fácil de reconhecer no hospital.">
              <input
                className="input"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: TV Recepção"
                maxLength={80}
                required
              />
            </Field>

            <div className="form-grid">
              <Field label="Período exibido">
                <select
                  className="input"
                  value={draft.period}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      period: event.target.value as Draft["period"],
                    }))
                  }
                >
                  <option value="current_month">Este mês</option>
                  <option value="last_7_days">Últimos 7 dias</option>
                  <option value="last_30_days">Últimos 30 dias</option>
                </select>
              </Field>
              <Field label="Atualização automática">
                <select
                  className="input"
                  value={draft.refreshSeconds}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      refreshSeconds: Number(event.target.value),
                    }))
                  }
                >
                  <option value={15}>A cada 15 segundos</option>
                  <option value={30}>A cada 30 segundos</option>
                  <option value={60}>A cada 1 minuto</option>
                  <option value={120}>A cada 2 minutos</option>
                  <option value={300}>A cada 5 minutos</option>
                </select>
              </Field>
            </div>

            <fieldset className="tv-device-options">
              <legend>Setores exibidos</legend>
              <label className="tv-option-row">
                <input
                  type="checkbox"
                  checked={draft.allSectors}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      allSectors: event.target.checked,
                      sectorIds: event.target.checked ? [] : current.sectorIds,
                    }))
                  }
                />
                <span>
                  <strong>Todos os setores</strong>
                  <small>Inclui automaticamente setores ativos.</small>
                </span>
              </label>
              {!draft.allSectors && (
                <>
                  <div className="tv-checkbox-grid">
                    {data.sectors.map((sector) => (
                      <label key={sector.id}>
                        <input
                          type="checkbox"
                          checked={draft.sectorIds.includes(sector.id)}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              sectorIds: event.target.checked
                                ? [...current.sectorIds, sector.id]
                                : current.sectorIds.filter((id) => id !== sector.id),
                              qrSectorId:
                                !event.target.checked && current.qrSectorId === sector.id
                                  ? ""
                                  : current.qrSectorId,
                            }))
                          }
                        />
                        {sector.name}
                      </label>
                    ))}
                  </div>
                  {!draft.sectorIds.length && (
                    <small className="tv-field-error" role="alert">
                      Selecione ao menos um setor.
                    </small>
                  )}
                </>
              )}
            </fieldset>

            <Field
              label="Pesquisa do QR Code"
              hint="A TV mostrará um QR Code para a pesquisa ativa deste setor."
            >
              <select
                className="input"
                value={draft.qrSectorId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    qrSectorId: event.target.value,
                  }))
                }
              >
                <option value="">Não exibir QR Code</option>
                {data.sectors
                  .filter(
                    (sector) =>
                      sector.active &&
                      (draft.allSectors || draft.sectorIds.includes(sector.id)),
                  )
                  .map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name}
                    </option>
                  ))}
              </select>
            </Field>

            <fieldset className="tv-device-options">
              <legend>Indicadores exibidos</legend>
              <div className="tv-metric-grid">
                {allMetrics.map((metric) => (
                  <label key={metric.id} className="tv-metric-option">
                    <input
                      type="checkbox"
                      checked={draft.metrics.includes(metric.id)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          metrics: event.target.checked
                            ? [...current.metrics, metric.id]
                            : current.metrics.filter((id) => id !== metric.id),
                        }))
                      }
                    />
                    <span>
                      <strong>{metric.label}</strong>
                      <small>{metric.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className="button"
                disabled={
                  busy ||
                  !draft.metrics.length ||
                  (!draft.allSectors && !draft.sectorIds.length)
                }
              >
                <Check size={16} />
                {busy ? "Salvando…" : editing === "new" ? "Cadastrar e gerar código" : "Salvar configuração"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pairing && (
        <Modal title={`Vincular ${pairing.device.name}`} onClose={() => setPairing(null)}>
          <div className="tv-pairing-result">
            <div className="tv-pairing-shield" aria-hidden="true">
              <ShieldCheck size={28} />
            </div>
            <p>
              Na televisão, acesse <strong>{window.location.origin}/tv</strong> e
              digite este código. Ele funciona uma única vez.
            </p>
            <output aria-label="Código de vinculação">
              {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
            </output>
            <small>
              Válido até {dateTime(pairing.expiresAt)}. Depois disso, gere outro código.
            </small>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(pairing.code);
                    notify("Código copiado.");
                  } catch {
                    notify("Não foi possível copiar o código.");
                  }
                }}
              >
                <Copy size={15} />
                Copiar código
              </button>
              <button className="button" onClick={() => setPairing(null)}>
                Concluir
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
