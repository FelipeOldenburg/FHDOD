import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Square, Volume2 } from "lucide-react";

const START_TIMEOUT_MS = 24000;
const speechError = "Não foi possível reproduzir a leitura. Tente novamente ou use o leitor de tela do seu dispositivo.";

function readingText(element: HTMLElement) {
  const content = element.cloneNode(true) as HTMLElement;
  content.querySelectorAll(".patient-speech, input, textarea, [aria-hidden='true'], [hidden], .sr-only, [role='alert'], [data-speech-ignore]")
    .forEach((node) => node.remove());
  content.querySelectorAll("br").forEach((node) => node.replaceWith(" "));
  content.querySelectorAll("button[aria-label]").forEach((node) => {
    node.textContent = node.getAttribute("aria-label");
  });
  Array.from(content.querySelectorAll("h1, h2, h3, p, legend, label, button, option, small, li"))
    .reverse().forEach((node) => node.append(/[.!?]\s*$/.test(node.textContent ?? "") ? " " : ". "));
  return content.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export function ReadAloud({ contentRef, onRead }: {
  contentRef: RefObject<HTMLElement | null>;
  onRead?: () => void;
}) {
  const pending = useRef<{ audio: HTMLAudioElement; timeout: number } | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "reading">("idle");
  const [error, setError] = useState("");
  const clearSpeech = useCallback(() => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    window.clearTimeout(current.timeout);
    current.audio.onplaying = null;
    current.audio.onended = null;
    current.audio.onerror = null;
    current.audio.pause();
    current.audio.removeAttribute("src");
    current.audio.load();
  }, []);

  useEffect(() => clearSpeech, [clearSpeech]);

  function read() {
    if (pending.current) {
      clearSpeech();
      setState("idle");
      return;
    }
    if (!contentRef.current) return;
    const text = readingText(contentRef.current);
    if (!text) return;
    onRead?.();
    setError("");

    try {
      const audio = new Audio();
      function finish(message = "") {
        if (pending.current?.audio !== audio) return;
        clearSpeech();
        setState("idle");
        setError(message);
      }
      audio.onplaying = () => {
        if (pending.current?.audio !== audio) return;
        window.clearTimeout(pending.current.timeout);
        setState("reading");
      };
      audio.onended = () => finish();
      audio.onerror = () => finish(speechError);
      pending.current = {
        audio,
        timeout: window.setTimeout(() => finish(speechError), START_TIMEOUT_MS),
      };
      audio.preload = "none";
      audio.src = `/api/public/survey-speech?${new URLSearchParams({ text })}`;
      setState("starting");
      // Keep play() in the tap handler, even though the audio comes from the server.
      void audio.play().catch(() => finish(speechError));
    } catch {
      clearSpeech();
      setState("idle");
      setError(speechError);
    }
  }

  if (typeof window.Audio !== "function") return null;

  return (
    <>
      <button className="patient-speech" type="button" data-active={state !== "idle"} onClick={read}>
        {state === "idle" ? <Volume2 aria-hidden="true" /> : <Square aria-hidden="true" />}
        {state === "reading" ? "Parar leitura" : state === "starting" ? "Cancelar leitura" : "Ouvir tela"}
      </button>
      <p className="patient-speech-status" role="status" data-speech-ignore>{error}</p>
    </>
  );
}
