import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { Inbox, X, LoaderCircle } from "lucide-react";

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
  const colors = ["#c7a4ed", "#afd0f7", "#cacbc9", "#ffdc8b", "#bddfae"];
  const inks = ["#503e67", "#284e77", "#40413f", "#634915", "#385e2c"];
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
                d="M26 40 Q34 52 42 40 M58 40 Q66 52 74 40"
                fill="none"
                stroke={inks[index]}
                strokeWidth="5"
                strokeLinecap="round"
              />
            ) : index === 4 ? (
              <path
                d="M25 42 Q34 29 43 42 M57 42 Q66 29 75 42"
                fill="none"
                stroke={inks[index]}
                strokeWidth="5"
                strokeLinecap="round"
              />
            ) : (
              <g fill={inks[index]}>
                <circle cx="35" cy="41" r="5" />
                <circle cx="65" cy="41" r="5" />
              </g>
            )}
            {index === 0 ? (
              <path d="M32 77 Q50 40 68 77 Z" fill={inks[index]} />
            ) : index === 1 ? (
              <path
                d="M30 72 Q50 45 70 72"
                fill="none"
                stroke={inks[index]}
                strokeWidth="5"
                strokeLinecap="round"
              />
            ) : index === 2 ? (
              <path
                d="M33 68 H67"
                stroke={inks[index]}
                strokeWidth="5"
                strokeLinecap="round"
              />
            ) : index === 3 ? (
              <path
                d="M29 63 Q50 88 71 63"
                fill="none"
                stroke={inks[index]}
                strokeWidth="5"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M29 61 H71 Q70 87 50 87 Q30 87 29 61"
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
