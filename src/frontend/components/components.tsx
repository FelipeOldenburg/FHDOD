import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Eye, EyeOff, Inbox, X, LoaderCircle, RotateCw } from "lucide-react";

export function usePageTransition(view: string) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const animation = element.animate(
      [
        { transform: "translateY(6px)" },
        { transform: "none" },
      ],
      { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
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
const facePalette = [
  { start: "#d7b7ff", end: "#bb8df1", ink: "#50377e" },
  { start: "#c4d9ff", end: "#9dbcf0", ink: "#26466f" },
  { start: "#dddddd", end: "#bdbdbd", ink: "#303030" },
  { start: "#ffe29b", end: "#f7c96c", ink: "#5b4300" },
  { start: "#c9e3bd", end: "#a8cc99", ink: "#46613f" },
] as const;

function RatingFaceIcon({ index }: { index: number }) {
  const gradientId = `rating-face-${useId().replaceAll(":", "")}`;
  const palette = facePalette[index];

  return (
    <svg viewBox="0 0 100 100" width="72" height="72" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="18" y1="12" x2="82" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor={palette.start} />
          <stop offset="1" stopColor={palette.end} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#${gradientId})`} />
      {index === 0 ? (
        <path
          d="M28 39 C32 48 41 49 45 39 M55 39 C59 49 68 48 72 39"
          fill="none"
          stroke={palette.ink}
          strokeWidth="7"
          strokeLinecap="round"
        />
      ) : index === 4 ? (
        <path
          d="M28 42 C32 32 41 31 45 42 M55 42 C59 31 68 32 72 42"
          fill="none"
          stroke={palette.ink}
          strokeWidth="7"
          strokeLinecap="round"
        />
      ) : (
        <g fill={palette.ink}>
          <circle cx="35" cy="40" r="6" />
          <circle cx="65" cy="40" r="6" />
        </g>
      )}
      {index === 0 ? (
        <path
          d="M31 69 C31 57 39 50 50 50 C61 50 69 57 69 69 C69 71 68 72 66 72 H34 C32 72 31 71 31 69 Z"
          fill={palette.ink}
        />
      ) : index === 1 ? (
        <path
          d="M31 65 Q50 44 69 65"
          fill="none"
          stroke={palette.ink}
          strokeWidth="8"
          strokeLinecap="round"
        />
      ) : index === 2 ? (
        <path
          d="M33 61 H67"
          fill="none"
          stroke={palette.ink}
          strokeWidth="8"
          strokeLinecap="round"
        />
      ) : index === 3 ? (
        <path
          d="M31 57 Q50 76 69 57"
          fill="none"
          stroke={palette.ink}
          strokeWidth="8"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M31 55 H69 C68 68 61 75 50 75 C39 75 32 68 31 55 Z"
          fill={palette.ink}
        />
      )}
    </svg>
  );
}

export function RatingFaces({
  value,
  onChange,
  disabled = false,
}: {
  value?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
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
          <RatingFaceIcon index={index} />
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
export function FilterHeader({ title, onReset }: { title: string; onReset: () => void }) {
  return (
    <header className="filters-header">
      <h2>{title}</h2>
      <button type="button" className="text-button filters-reset" onClick={onReset}>
        <RotateCw size={16} aria-hidden="true" /> Limpar filtros
      </button>
    </header>
  );
}

export function PageTitle({
  title,
  description,
  mobileContext,
  mobileTitle,
  mobileDescription,
  action,
}: {
  title: string;
  description: string;
  mobileContext?: string;
  mobileTitle?: string;
  mobileDescription?: string;
  action?: ReactNode;
}) {
  return (
    <header className={`page-title${action ? " has-action" : ""}`}>
      <div className="page-title-copy">
        {mobileContext && (
          <span className="mobile-page-context">{mobileContext}</span>
        )}
        <h1>
          <span className={mobileTitle ? "desktop-page-title" : undefined}>
            {title}
          </span>
          {mobileTitle && <span className="mobile-page-title">{mobileTitle}</span>}
        </h1>
        <p>
          <span
            className={mobileDescription ? "desktop-page-title" : undefined}
          >
            {description}
          </span>
          {mobileDescription && (
            <span className="mobile-page-title">{mobileDescription}</span>
          )}
        </p>
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
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

export function PasswordField({
  label,
  hint,
  className = "input",
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  hint?: string;
}) {
  const generatedId = useId();
  const [visible, setVisible] = useState(false);
  const inputId = inputProps.id || generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-control">
        <input
          {...inputProps}
          id={inputId}
          type={visible ? "text" : "password"}
          className={className}
          aria-describedby={hintId || inputProps["aria-describedby"]}
        />
        <button
          type="button"
          className="password-visibility"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
      {hint && <small id={hintId}>{hint}</small>}
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
