import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Link2,
  MonitorUp,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Brand, Loading } from "../components/components";
import { TVWall } from "./TVWall";

type PairingState = "checking" | "unpaired" | "paired" | "unavailable";

export function TVPairing() {
  const [state, setState] = useState<PairingState>("checking");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const checkPairing = useCallback(async (signal?: AbortSignal) => {
    setState("checking");
    try {
      const response = await fetch("/api/public/tv/dashboard", {
        credentials: "same-origin",
        signal,
      });
      if (response.ok) setState("paired");
      else if (response.status === 401) setState("unpaired");
      else setState("unavailable");
    } catch {
      if (!signal?.aborted) setState("unavailable");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkPairing(controller.signal);
    return () => controller.abort();
  }, [checkPairing]);

  const unpair = useCallback((message?: string) => {
    setNotice(message || "Esta TV precisa ser vinculada novamente.");
    setCode("");
    setState("unpaired");
  }, []);

  async function pair(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/public/tv/pair", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Não foi possível vincular esta TV.");
      setState("paired");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível vincular esta TV.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state === "paired")
    return <TVWall publicDisplay onUnpaired={unpair} />;

  if (state === "checking")
    return (
      <div className="tv-pairing-page tv-pairing-checking">
        <Brand />
        <Loading label="Verificando esta TV…" />
      </div>
    );

  if (state === "unavailable")
    return (
      <div className="tv-pairing-page tv-pairing-unavailable">
        <header className="tv-pairing-header">
          <Brand />
        </header>
        <main>
          <span className="tv-pairing-mark" aria-hidden="true">
            <MonitorUp size={34} />
          </span>
          <h1>Não foi possível verificar esta TV</h1>
          <p>
            A conexão pode estar instável. A vinculação foi preservada e será
            verificada novamente quando você tentar.
          </p>
          <button className="button" onClick={() => void checkPairing()}>
            <RefreshCw size={17} />
            Tentar novamente
          </button>
        </main>
      </div>
    );

  return (
    <div className="tv-pairing-page">
      <header className="tv-pairing-header">
        <Brand />
        <span>
          <ShieldCheck size={17} />
          Conexão protegida
        </span>
      </header>
      <main className="tv-pairing-main">
        <div className="tv-pairing-copy">
          <span className="tv-pairing-mark" aria-hidden="true">
            <MonitorUp size={38} />
          </span>
          <h1>Vincule esta televisão</h1>
          <p>
            Cada tela recebe acesso próprio e somente de leitura. Nenhuma conta
            administrativa fica salva neste dispositivo.
          </p>
          <ol>
            <li>Abra Configurações no painel administrativo.</li>
            <li>Acesse Dispositivos TV Wall e cadastre esta tela.</li>
            <li>Digite abaixo o código gerado.</li>
          </ol>
        </div>
        <form className="tv-pairing-card" onSubmit={pair}>
          <div>
            <Link2 size={24} aria-hidden="true" />
            <h2>Código de vinculação</h2>
            <p>O código tem 6 dígitos e funciona uma única vez.</p>
          </div>
          {notice && <p className="tv-pairing-notice">{notice}</p>}
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <label htmlFor="tv-pairing-code">Código exibido no painel</label>
          <input
            id="tv-pairing-code"
            className="tv-pairing-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000 000"
            required
            autoFocus
          />
          <button className="button" disabled={busy || code.length !== 6}>
            {busy ? "Vinculando…" : "Vincular e abrir TV Wall"}
            {!busy && <ArrowRight size={18} />}
          </button>
          <small>
            Se o código expirar, gere outro no painel. Isso não afeta as demais TVs.
          </small>
        </form>
      </main>
      <footer>FHDOD · Experiência do paciente</footer>
    </div>
  );
}
