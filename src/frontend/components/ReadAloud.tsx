import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Square, Volume2 } from "lucide-react";

const START_TIMEOUT_MS = 5000;
const speechError = "A leitura em voz alta não funcionou. Tente novamente ou use o leitor de tela do seu dispositivo.";

function readingText(element: HTMLElement) {
  const content = element.cloneNode(true) as HTMLElement;
  content.querySelectorAll(".patient-speech, input, textarea, [aria-hidden='true'], [hidden], .sr-only, [data-speech-ignore]")
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
  const pending = useRef<{ utterance: SpeechSynthesisUtterance; timeout: number } | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "reading">("idle");
  const [error, setError] = useState("");
  const synthesis = window.speechSynthesis;
  const supported = typeof synthesis?.speak === "function"
    && typeof synthesis.cancel === "function"
    && typeof window.SpeechSynthesisUtterance === "function";

  const clearSpeech = useCallback((cancel: boolean) => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    window.clearTimeout(current.timeout);
    current.utterance.onstart = null;
    current.utterance.onend = null;
    current.utterance.onerror = null;
    if (cancel) synthesis.cancel();
  }, [synthesis]);

  useEffect(() => () => clearSpeech(true), [clearSpeech]);

  function read() {
    if (pending.current) {
      clearSpeech(true);
      setState("idle");
      return;
    }
    if (!supported || !contentRef.current) return;
    const text = readingText(contentRef.current);
    if (!text) return;
    onRead?.();
    setError("");

    try {
      const current = new SpeechSynthesisUtterance(text);
      current.lang = "pt-BR";
      current.rate = 1.2;
      let started = false;
      function finish(message = "", cancel = false) {
        if (pending.current?.utterance !== current) return;
        clearSpeech(cancel);
        setState("idle");
        setError(message);
      }
      current.onstart = () => {
        if (pending.current?.utterance !== current) return;
        started = true;
        window.clearTimeout(pending.current.timeout);
        setState("reading");
      };
      current.onend = () => finish(started ? "" : speechError);
      current.onerror = (event) => finish(event.error === "not-allowed"
        ? "O navegador bloqueou a leitura. Abra a pesquisa no Safari ou no Chrome e tente novamente."
        : speechError);
      pending.current = {
        utterance: current,
        timeout: window.setTimeout(() => finish(speechError, true), START_TIMEOUT_MS),
      };
      setState("starting");
      // Keep this synchronous with the tap. iOS can block speech started later.
      if (synthesis.paused) synthesis.resume();
      synthesis.speak(current);
    } catch {
      clearSpeech(false);
      setState("idle");
      setError(speechError);
    }
  }

  if (!supported) return null;

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
