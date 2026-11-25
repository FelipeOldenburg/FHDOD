import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Square, Volume2 } from "lucide-react";

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
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const supported = typeof window.speechSynthesis?.speak === "function"
    && typeof window.SpeechSynthesisUtterance === "function";

  const stop = useCallback(() => {
    const current = utterance.current;
    if (!current) return;
    utterance.current = null;
    current.onend = null;
    current.onerror = null;
    window.speechSynthesis.cancel();
    setReading(false);
  }, []);

  useEffect(() => stop, [stop]);

  function read() {
    if (utterance.current) return stop();
    if (!contentRef.current) return;
    const text = readingText(contentRef.current);
    if (!text) return;
    onRead?.();
    setError("");
    const current = new SpeechSynthesisUtterance(text);
    current.lang = "pt-BR";
    current.rate = 1.2;
    const voices = window.speechSynthesis.getVoices();
    const portugueseVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("pt"));
    const voice = portugueseVoices.find((voice) => voice.localService) ?? portugueseVoices[0];
    if (voice) current.voice = voice;
    current.onend = () => {
      if (utterance.current !== current) return;
      utterance.current = null;
      setReading(false);
    };
    const failed = () => {
      if (utterance.current !== current) return;
      stop();
      setError("Não foi possível iniciar a leitura. Tente novamente ou use o leitor de tela do seu dispositivo.");
    };
    current.onerror = failed;
    utterance.current = current;
    setReading(true);
    try {
      window.speechSynthesis.speak(current);
    } catch {
      failed();
    }
  }

  if (!supported) return null;

  return (
    <div className="patient-speech">
      <button className="patient-back" type="button" onClick={read}>
        {reading ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        {reading ? "Parar leitura" : "Ouvir esta tela"}
      </button>
      <p className="patient-question-hint" role="status">{error}</p>
    </div>
  );
}
