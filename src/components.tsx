import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { Inbox, X, LoaderCircle } from "lucide-react";

export function usePageTransition(view: string) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const animation = element.animate(
      [
        { opacity: 0.35, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    return () => animation.cancel();
  }, [view]);
  return ref;
}

export function Brand({ patient = false }: { patient?: boolean }) {
  return (
    <a
      href="/"
      className={`brand ${patient ? "brand-patient" : ""}`}
      aria-label="FHDOD — início"
    >
      <span className="brand-symbol" aria-hidden="true">
        <img src="/assets/fhdod-logo.png" alt="" width="450" height="150" />
      </span>
      <span className="brand-word">FHDOD</span>
      <span className="brand-institution">
        Fundação Hospitalar
        <br />
        Dr. Oswaldo Diesel
      </span>
    </a>
  );
}

const faceLabels = ["Muito ruim", "Ruim", "Regular", "Bom", "Muito bom"];
export function RatingFaces({
  value,
  onChange,
  disabled = false,
}: {
  value?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const colors = ["#b77bea", "#f39732", "#ae845b", "#f6c51b", "#91ad51"];
  const inks = ["#641d8f", "#8b3914", "#512d20", "#88430c", "#344d19"];
  return (
    <div className="rating-faces" role="group" aria-label="Avaliação de 1 a 5">
      {faceLabels.map((label, index) => (
        <button
          key={label}
          type="button"
          className={`rating-face ${value === index + 1 ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => onChange(index + 1)}
          aria-pressed={value === index + 1}
          aria-label={`${index + 1} — ${label}`}
        >
          <svg viewBox="0 0 100 100" width="72" height="72" aria-hidden="true">
            <circle cx="50" cy="50" r="49" fill={colors[index]} />
            {index === 0 ? (
              <path
                d="M30 39 Q36 48 43 39 M57 39 Q64 48 70 39"
                fill="none"
                stroke={inks[index]}
                strokeWidth="7"
                strokeLinecap="round"
              />
            ) : index === 4 ? (
              <path
                d="M30 42 Q36 32 43 42 M57 42 Q64 32 70 42"
                fill="none"
                stroke={inks[index]}
                strokeWidth="7"
                strokeLinecap="round"
              />
            ) : (
              <g fill={inks[index]}>
                <circle cx="36" cy="41" r="6" />
                <circle cx="64" cy="41" r="6" />
              </g>
            )}
            {index === 0 ? (
              <path
                d="M33 62 Q50 46 67 62 Q73 70 64 70 H36 Q27 70 33 62 Z"
                fill={inks[index]}
              />
            ) : index === 1 ? (
              <path
                d="M35 63 Q50 49 65 63"
                fill="none"
                stroke={inks[index]}
                strokeWidth="8"
                strokeLinecap="round"
              />
            ) : index === 2 ? (
              <path
                d="M35 60 Q50 75 65 60"
                fill="none"
                stroke={inks[index]}
                strokeWidth="8"
                strokeLinecap="round"
              />
            ) : index === 3 ? (
              <path
                d="M35 59 Q50 75 65 59"
                fill="none"
                stroke={inks[index]}
                strokeWidth="8"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M35 55 H65 Q72 55 67 63 Q61 72 50 72 Q39 72 33 63 Q28 55 35 55 Z"
                fill={inks[index]}
              />
            )}
          </svg>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="card-heading">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Inbox size={30} strokeWidth={1.3} aria-hidden="true" />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const generatedId = useId();
  const fields = Children.toArray(children);
  const control = fields.find(
    (child) =>
      isValidElement(child) &&
      typeof child.type === "string" &&
      ["input", "select", "textarea"].includes(child.type),
  );
  const controlId = isValidElement<{ id?: string }>(control)
    ? control.props.id || generatedId
    : generatedId;
  return (
    <div className="field">
      <label htmlFor={controlId}>{label}</label>
      {fields.map((child) =>
        child === control &&
        isValidElement<{ id?: string; "aria-describedby"?: string }>(child)
          ? cloneElement(child, {
              id: controlId,
              "aria-describedby": hint
                ? `${controlId}-hint`
                : child.props["aria-describedby"],
            })
          : child,
      )}
      {hint && <small id={`${controlId}-hint`}>{hint}</small>}
    </div>
  );
}
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "red" | "green" | "neutral" | "amber";
}) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}
export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={22} />
      {label}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function formatNumber(value: number | null | undefined, decimals = 0) {
  return value == null
    ? "—"
    : value.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
}
export function formatDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      });
}
