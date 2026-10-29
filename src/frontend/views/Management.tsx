import {
  startTransition,
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Copy,
  KeyRound,
  Plus,
  QrCode,
  Save,
  ShieldCheck,
} from "lucide-react";
import QRCode from "qrcode";
import { api, filterQuery } from "../controllers/api";
import {
  Card,
  EmptyState,
  Modal,
  StatusBadge,
  PageTitle,
  Field,
  PasswordField,
} from "../components/components";
import type {
  Bootstrap,
  DashboardData,
  Filters,
  Manifestation,
  Role,
  Sector,
  Settings,
  User,
} from "../models/types";
import "../styles/management.css";

export interface CommonProps {
  data: Bootstrap;
  filters: Filters;
  onRefresh: () => Promise<void>;
  notify: (message: string) => void;
  onNavigate: (route: string) => void;
}
const roleNames: Record<Role, string> = {
  superadmin: "Super Admin",
  sector_admin: "Admin de Setor",
  management: "Gestão",
  ombudsman: "Ouvidoria",
  viewer: "Visualizador",
};
const statusNames: Record<string, string> = {
  nova: "Nova",
  pendente: "Pendente",
  em_atendimento: "Em atendimento",
  resolvida: "Resolvida",
};
const typeNames: Record<string, string> = {
  elogio: "Elogio",
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
  outro: "Outro",
};
const dateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
const localDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FormError({ value }: { value: string }) {
  return value ? (
    <div className="error-banner" role="alert">
      {value}
    </div>
  ) : null;
}
function SaveButton({
  busy,
  children = "Salvar alterações",
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <button className="button" disabled={busy} type="submit">
      <Save size={16} />
      {busy ? "Salvando…" : children}
    </button>
  );
}

type TemporaryCredential = { name: string; email: string; password: string };
function generateTemporaryPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function CredentialModal({
  credential,
  onClose,
  notify,
}: {
  credential: TemporaryCredential;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  return (
    <Modal title="Senha temporária criada" onClose={onClose}>
      <div className="credential-result">
        <KeyRound size={30} />
        <p>
          Compartilhe este acesso com <strong>{credential.name}</strong> por um
          canal seguro. A senha será exibida apenas agora e deverá ser trocada
          no primeiro login.
        </p>
        <dl>
          <dt>Endereço de login</dt>
          <dd>{window.location.origin}</dd>
          <dt>E-mail</dt>
          <dd>{credential.email}</dd>
          <dt>Senha temporária</dt>
          <dd>
            <code>{credential.password}</code>
          </dd>
        </dl>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(credential.password);
              notify("Senha copiada.");
            } catch {
              notify("Não foi possível copiar. Selecione a senha exibida.");
            }
          }}
        >
          <Copy size={15} />
          Copiar senha
        </button>
        <button className="button" onClick={onClose}>
          Concluir
        </button>
      </div>
    </Modal>
  );
}

export function Sectors({ data, onRefresh, notify, onNavigate }: CommonProps) {
  const [selectedId, setSelectedId] = useState(data.sectors[0]?.id ?? "");
  const [editing, setEditing] = useState<Sector | "new" | null>(null);
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<TemporaryCredential | null>(
    null,
  );
  const adminsFor = (id: string) =>
    data.users.filter(
      (user) => user.role === "sector_admin" && user.sectorIds.includes(id),
    );
  const editingAdmins =
    editing && editing !== "new" ? adminsFor(editing.id) : [];
  const legacyAccess =
    editingAdmins.length > 1 ||
    editingAdmins.some((user) => user.sectorIds.length !== 1);
  const editingAdmin = legacyAccess ? undefined : editingAdmins[0];
  const selected =
    data.sectors.find((s) => s.id === selectedId) ?? data.sectors[0];
  const link = selected
    ? `${window.location.origin}/avaliar/${selected.slug}`
    : "";
  const selectedAdmins = selected ? adminsFor(selected.id) : [];
  const selectedAdmin =
    selectedAdmins.length === 1 && selectedAdmins[0].sectorIds.length === 1
      ? selectedAdmins[0]
      : undefined;
  useEffect(() => {
    let active = true;
    setQr("");
    setQrError("");
    if (link)
      QRCode.toDataURL(link, {
        width: 256,
        margin: 2,
        color: { dark: "#292a30", light: "#ffffff" },
      })
        .then((value) => {
          if (active) setQr(value);
        })
        .catch(() => {
          if (active) setQrError("Não foi possível gerar o QR Code.");
        });
    return () => {
      active = false;
    };
  }, [link]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const password =
        !legacyAccess && (!editingAdmin || form.get("resetPassword") === "on")
          ? generateTemporaryPassword()
          : undefined;
      const result = await api<{ sector: Sector; user?: User }>(
        `/api/sectors${editing && editing !== "new" ? `/${editing.id}` : ""}`,
        {
          method: editing === "new" ? "POST" : "PUT",
          body: {
            name: form.get("name"),
            slug: form.get("slug"),
            description: form.get("description"),
            active: form.get("active") === "on",
            ...(!legacyAccess
              ? {
                  admin: {
                    email: form.get("adminEmail"),
                    ...(password ? { temporaryPassword: password } : {}),
                  },
                }
              : {}),
          },
        },
      );
      setSelectedId(result.sector.id);
      setEditing(null);
      if (password && result.user)
        setCredential({
          name: result.sector.name,
          email: result.user.email,
          password,
        });
      notify("Setor e acesso administrativo salvos.");
      await onRefresh().catch((err) => notify(errorMessage(err)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function exportQr() {
    try {
      const svg = await QRCode.toString(link, { type: "svg", margin: 2 });
      download(
        new Blob([svg], { type: "image/svg+xml" }),
        `qr-${selected?.slug}.svg`,
      );
    } catch (err) {
      notify(errorMessage(err));
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      notify("Link copiado.");
    } catch {
      notify("Não foi possível copiar. Selecione o endereço exibido.");
    }
  }
  return (
    <>
      <PageTitle
        title="Setores"
        description={
          data.permissions.canManageSectors
            ? "Cada setor tem um administrador com login próprio e acesso restrito."
            : "Consulte seu setor e o link da pesquisa para os pacientes."
        }
        action={
          data.permissions.canManageSectors && (
            <button
              className="button"
              onClick={() => {
                setError("");
                setEditing("new");
              }}
            >
              <Plus size={16} />
              Adicionar setor
            </button>
          )
        }
      />
      <div className="management-split sectors-layout">
        <div className="sector-management-stack">
          <Card
            title="Setores do hospital"
            subtitle="Login administrativo e pesquisa para pacientes pertencem ao setor."
          >
            {data.sectors.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Setor</th>
                      <th>Pesquisa vinculada</th>
                      <th>Situação</th>
                      {data.permissions.canManageUsers && (
                        <th>Login do setor</th>
                      )}
                      {data.permissions.canManageSectors && <th>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.sectors.map((sector) => {
                      const admins = adminsFor(sector.id);
                      const admin =
                        admins.length === 1 && admins[0].sectorIds.length === 1
                          ? admins[0]
                          : undefined;
                      const survey = data.surveys.find(
                        (s) => s.sectorId === sector.id && s.active,
                      );
                      return (
                        <tr
                          key={sector.id}
                          className={
                            selected?.id === sector.id ? "selected-row" : ""
                          }
                        >
                          <td>
                            <button
                              className="table-choice"
                              onClick={() => setSelectedId(sector.id)}
                              aria-pressed={selected?.id === sector.id}
                            >
                              {sector.name}
                            </button>
                          </td>
                          <td>{survey?.title ?? "Sem pesquisa ativa"}</td>
                          <td>
                            <StatusBadge
                              tone={sector.active ? "green" : "neutral"}
                            >
                              {sector.active ? "Ativo" : "Inativo"}
                            </StatusBadge>
                          </td>
                          {data.permissions.canManageUsers && (
                            <td>
                              {admin?.email ??
                                (admins.length
                                  ? "Corrigir acesso em Usuários"
                                  : "Acesso não configurado")}
                            </td>
                          )}
                          {data.permissions.canManageSectors && (
                            <td>
                              <button
                                className="text-action"
                                onClick={() => {
                                  setError("");
                                  setEditing(sector);
                                }}
                              >
                                Editar setor e acesso
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Cadastre o primeiro setor"
                description="Depois, crie a pesquisa que os pacientes vão responder."
              />
            )}
          </Card>
          {selected && data.permissions.canManageSectors && (
            <Card
              title={`Administração de ${selected.name}`}
              subtitle="Um único login, com acesso somente a este setor."
            >
              {selectedAdmin ? (
                <>
                  <p className="small">
                    E-mail de login: <strong>{selectedAdmin.email}</strong>
                  </p>
                  <p className="muted small">
                    {!selected.active
                      ? "Setor inativo: o login está bloqueado."
                      : selectedAdmin.active === false
                        ? "Login desativado. Altere a situação em Usuários."
                        : selectedAdmin.mustChangePassword
                          ? "Aguardando a troca da senha temporária no primeiro acesso."
                          : "Login configurado."}
                  </p>
                  <button
                    className="text-action"
                    onClick={() => {
                      setError("");
                      setEditing(selected);
                    }}
                  >
                    Editar login ou gerar nova senha
                  </button>
                </>
              ) : selectedAdmins.length ? (
                <>
                  <p className="muted small">
                    Há vínculos antigos que precisam ser corrigidos para manter
                    um administrador exclusivo deste setor.
                  </p>
                  <button
                    className="text-action"
                    onClick={() => onNavigate("/usuarios")}
                  >
                    Corrigir em Usuários
                  </button>
                </>
              ) : (
                <>
                  <p className="muted small">
                    Este setor ainda não tem seu login administrativo.
                  </p>
                  <button
                    className="text-action"
                    onClick={() => {
                      setError("");
                      setEditing(selected);
                    }}
                  >
                    Configurar acesso do setor
                  </button>
                </>
              )}
              <p className="muted small">
                Endereço de login: {window.location.origin}. O administrador do
                setor pode configurar suas perguntas, consultar suas respostas e
                trocar a própria senha.
              </p>
            </Card>
          )}
        </div>
        <Card
          title="Pesquisa para pacientes"
          subtitle={selected?.name ?? "Selecione um setor"}
        >
          {selected ? (
            <div className="sector-link">
              <div className="qr-container">
                {qr ? (
                  <img
                    src={qr}
                    width="224"
                    height="224"
                    alt={`QR Code da pesquisa de ${selected.name}`}
                  />
                ) : (
                  <>
                    <QrCode size={60} />
                    <span>{qrError || "Gerando QR Code…"}</span>
                  </>
                )}
              </div>
              <p className="public-url">{link}</p>
              <div className="button-row">
                <button className="button secondary" onClick={copyLink}>
                  <Copy size={15} />
                  Copiar link
                </button>
                <button className="button" onClick={exportQr}>
                  <ArrowDownToLine size={15} />
                  Exportar QR
                </button>
              </div>
              <a
                href={`/avaliar/${selected.slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-action preview-link"
              >
                Abrir pesquisa <ArrowUpRight size={14} />
              </a>
              <p className="muted small">
                Os pacientes respondem sem login. O setor é identificado pelo
                link e a pesquisa precisa estar ativa para receber respostas.
              </p>
            </div>
          ) : (
            <EmptyState title="Selecione um setor" />
          )}
        </Card>
      </div>
      {editing && (
        <Modal
          title={editing === "new" ? "Adicionar setor" : "Editar setor"}
          onClose={() => !busy && setEditing(null)}
        >
          <form onSubmit={save} className="management-form">
            <FormError value={error} />
            <Field label="Nome do setor">
              <input
                className="input"
                name="name"
                required
                maxLength={120}
                defaultValue={editing === "new" ? "" : editing.name}
                onChange={(event) => {
                  if (editing === "new") {
                    const form = event.currentTarget.form;
                    const slug = form?.elements.namedItem(
                      "slug",
                    ) as HTMLInputElement | null;
                    if (slug && !slug.dataset.edited)
                      slug.value = slugify(event.target.value);
                  }
                }}
              />
            </Field>
            <Field
              label="Identificador no link"
              hint="Use letras minúsculas, números e hífens. Alterar este endereço invalida links e QR Codes antigos."
            >
              <input
                className="input"
                name="slug"
                required
                maxLength={100}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                defaultValue={editing === "new" ? "" : editing.slug}
                onChange={(e) => {
                  e.currentTarget.dataset.edited = "true";
                }}
              />
            </Field>
            <Field label="Descrição">
              <textarea
                className="input"
                name="description"
                maxLength={500}
                defaultValue={editing === "new" ? "" : editing.description}
              />
            </Field>
            <label className="check-label">
              <input
                name="active"
                type="checkbox"
                defaultChecked={editing === "new" || editing.active}
              />
              Setor ativo
            </label>
            <h3>Acesso do administrador do setor</h3>
            {legacyAccess ? (
              <p className="muted small">
                Corrija os vínculos antigos na tela Usuários antes de alterar
                este acesso. Os dados do setor podem ser salvos normalmente.
              </p>
            ) : (
              <>
                <Field
                  label="E-mail de login do setor"
                  hint="Um único administrador, com acesso restrito a este setor."
                >
                  <input
                    className="input"
                    name="adminEmail"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="off"
                    defaultValue={editingAdmin?.email ?? ""}
                  />
                </Field>
                {editingAdmin && (
                  <label className="check-label">
                    <input name="resetPassword" type="checkbox" />
                    Gerar nova senha temporária
                  </label>
                )}
                <p className="muted small">
                  {editingAdmin
                    ? "A senha atual será mantida, a menos que você solicite uma nova senha temporária."
                    : "Uma senha temporária será gerada ao salvar e deverá ser trocada no primeiro login."}
                </p>
              </>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <SaveButton busy={busy} />
            </div>
          </form>
        </Modal>
      )}
      {credential && (
        <CredentialModal
          credential={credential}
          onClose={() => setCredential(null)}
          notify={notify}
        />
      )}
    </>
  );
}

export function Users({ data, onRefresh, notify }: CommonProps) {
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [role, setRole] = useState<Role>("viewer");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credential, setCredential] = useState<TemporaryCredential | null>(
    null,
  );
  const [resetPassword, setResetPassword] = useState(false);
  const fixedSectorAccess =
    editing !== null &&
    editing !== "new" &&
    editing.role === "sector_admin" &&
    editing.sectorIds.length === 1 &&
    data.users.filter(
      (user) =>
        user.role === "sector_admin" &&
        user.sectorIds.includes(editing.sectorIds[0]),
    ).length === 1;
  function open(user: User | "new") {
    setError("");
    setRole(user === "new" ? "viewer" : user.role);
    setSelectedSectors(user === "new" ? [] : user.sectorIds);
    setResetPassword(false);
    setEditing(user);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const shouldCreatePassword = editing === "new" || resetPassword;
    const password = shouldCreatePassword ? generateTemporaryPassword() : "";
    const name = String(form.get("name"));
    const email = String(form.get("email"));
    try {
      if (role !== "superadmin" && !selectedSectors.length)
        throw new Error("Selecione ao menos um setor para este usuário.");
      if (role === "sector_admin" && selectedSectors.length !== 1)
        throw new Error(
          "O administrador deve estar vinculado a um único setor.",
        );
      await api(
        `/api/users${editing && editing !== "new" ? `/${editing.id}` : ""}`,
        {
          method: editing === "new" ? "POST" : "PUT",
          body: {
            name,
            email,
            role,
            sectorIds: role === "superadmin" ? [] : selectedSectors,
            active:
              editing !== "new" && editing?.id === data.user.id
                ? true
                : form.get("active") === "on",
            ...(shouldCreatePassword ? { temporaryPassword: password } : {}),
          },
        },
      );
      setEditing(null);
      if (shouldCreatePassword) setCredential({ name, email, password });
      notify("Usuário salvo com sucesso.");
      await onRefresh().catch((err) => notify(errorMessage(err)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (!data.permissions.canManageUsers)
    return (
      <>
        <PageTitle
          title="Usuários e permissões"
          description="Controle de acesso por perfil e setor."
        />
        <EmptyState
          title="Acesso restrito ao Super Admin"
          description="Solicite ao administrador uma alteração de cadastro ou permissão."
        />
      </>
    );
  return (
    <>
      <PageTitle
        title="Usuários e permissões"
        description="Controle o acesso à plataforma por perfil e setor."
        action={
          <button className="button" onClick={() => open("new")}>
            <Plus size={16} />
            Adicionar usuário
          </button>
        }
      />
      <Card
        title="Usuários cadastrados"
        subtitle="Os acessos variam conforme a função atribuída."
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Setores</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.name}
                    {user.id === data.user.id && (
                      <span className="muted"> · você</span>
                    )}
                  </td>
                  <td>{user.email}</td>
                  <td>{roleNames[user.role]}</td>
                  <td>
                    {user.role === "superadmin"
                      ? "Todos"
                      : user.sectorIds
                          .map(
                            (id) => data.sectors.find((s) => s.id === id)?.name,
                          )
                          .filter(Boolean)
                          .join(", ")}
                  </td>
                  <td>
                    <StatusBadge
                      tone={
                        user.active === false
                          ? "neutral"
                          : user.mustChangePassword
                            ? "amber"
                            : "green"
                      }
                    >
                      {user.active === false
                        ? "Inativo"
                        : user.mustChangePassword
                          ? "Primeiro acesso"
                          : "Ativo"}
                    </StatusBadge>
                  </td>
                  <td>
                    <button className="text-action" onClick={() => open(user)}>
                      Editar <ArrowUpRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small management-footnote">
          Cada setor possui um único administrador. Crie ou configure esse login
          na tela Setores. Os demais perfis podem ser cadastrados aqui.
        </p>
      </Card>
      {editing && (
        <Modal
          title={editing === "new" ? "Adicionar usuário" : "Editar usuário"}
          onClose={() => !busy && setEditing(null)}
        >
          <form className="management-form" onSubmit={save}>
            <FormError value={error} />
            <Field label="Nome">
              <input
                className="input"
                required
                name="name"
                maxLength={120}
                defaultValue={editing === "new" ? "" : editing.name}
              />
            </Field>
            <Field label="E-mail">
              <input
                className="input"
                required
                name="email"
                type="email"
                maxLength={254}
                defaultValue={editing === "new" ? "" : editing.email}
              />
            </Field>
            <Field label="Perfil">
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={
                  fixedSectorAccess ||
                  (editing !== "new" && editing.id === data.user.id)
                }
              >
                {Object.entries(roleNames)
                  .filter(
                    ([value]) =>
                      value !== "sector_admin" ||
                      (editing !== "new" && editing.role === "sector_admin"),
                  )
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>
            {role !== "superadmin" && (
              <fieldset className="sector-permissions">
                <legend>
                  {role === "sector_admin"
                    ? "Setor do administrador"
                    : "Setores autorizados"}
                </legend>
                {data.sectors.length ? (
                  data.sectors.map((sector) => (
                    <label className="check-label" key={sector.id}>
                      <input
                        type={role === "sector_admin" ? "radio" : "checkbox"}
                        name={
                          role === "sector_admin" ? "adminSector" : undefined
                        }
                        disabled={fixedSectorAccess}
                        checked={
                          role === "sector_admin"
                            ? selectedSectors.length === 1 &&
                              selectedSectors[0] === sector.id
                            : selectedSectors.includes(sector.id)
                        }
                        onChange={(e) =>
                          setSelectedSectors((current) =>
                            role === "sector_admin"
                              ? [sector.id]
                              : e.target.checked
                                ? [...current, sector.id]
                                : current.filter((id) => id !== sector.id),
                          )
                        }
                      />
                      {sector.name}
                      {!sector.active && " (inativo)"}
                    </label>
                  ))
                ) : (
                  <p className="muted">
                    Cadastre um setor antes de adicionar este perfil.
                  </p>
                )}
              </fieldset>
            )}
            {fixedSectorAccess && (
              <p className="muted small">
                O perfil e o setor deste administrador são fixos. Você pode
                corrigir os dados de acesso ou gerar outra senha temporária.
              </p>
            )}
            {editing !== "new" &&
              editing.role === "sector_admin" &&
              !fixedSectorAccess && (
                <p className="error-banner">
                  Corrija esta conta antiga para um único setor sem outro
                  administrador, ou atribua outro perfil.
                </p>
              )}
            <label className="check-label">
              <input
                name="active"
                type="checkbox"
                defaultChecked={editing === "new" || editing.active !== false}
                disabled={editing !== "new" && editing.id === data.user.id}
              />
              Usuário ativo
            </label>
            {editing !== "new" && editing.id !== data.user.id && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={resetPassword}
                  onChange={(e) => setResetPassword(e.target.checked)}
                />
                Gerar nova senha temporária
              </label>
            )}
            <p className="muted small">
              Novos usuários recebem uma senha temporária e precisam trocá-la no
              primeiro acesso.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <SaveButton busy={busy} />
            </div>
          </form>
        </Modal>
      )}
      {credential && (
        <CredentialModal
          credential={credential}
          onClose={() => setCredential(null)}
          notify={notify}
        />
      )}
    </>
  );
}

export function Ombudsman({ data, filters, notify }: CommonProps) {
  const [records, setRecords] = useState<Manifestation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Manifestation["status"]>("nova");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = records.find((row) => row.id === selectedId) ?? records[0];
  async function load(signal?: AbortSignal) {
    if (!data.permissions.canViewManifestations) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api<{ manifestations: Manifestation[] }>(
        `/api/manifestations${filterQuery(filters)}`,
        { signal },
      );
      startTransition(() => {
        setRecords(result.manifestations);
        setLoading(false);
      });
    } catch (err) {
      if (!signal?.aborted) {
        setError(errorMessage(err));
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [
    filters.sectorId,
    filters.from,
    filters.to,
    data.permissions.canViewManifestations,
  ]);
  useEffect(() => {
    setStatus(selected?.status ?? "nova");
    setNote(selected?.internalNote ?? "");
  }, [selected?.id, selected?.updatedAt]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/manifestations/${selected.id}`, {
        method: "PATCH",
        body: { status, internalNote: note },
      });
      await load();
      notify("Encaminhamento registrado.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Ouvidoria"
        description="Acompanhe manifestações e avaliações que exigem atenção."
      />
      <FormError value={error} />
      {!data.permissions.canViewManifestations ? (
        <EmptyState
          title="Seu perfil não acessa manifestações"
          description="Os indicadores agregados continuam disponíveis no painel."
        />
      ) : (
        <>
          <div className="management-stats">
            {[
              [
                "Pendentes",
                records.filter((r) => ["nova", "pendente"].includes(r.status))
                  .length,
              ],
              [
                "Em atendimento",
                records.filter((r) => r.status === "em_atendimento").length,
              ],
              [
                "Resolvidas",
                records.filter((r) => r.status === "resolvida").length,
              ],
            ].map(([label, count]) => (
              <Card key={label}>
                <span className="muted small">{label}</span>
                <strong>{count}</strong>
              </Card>
            ))}
          </div>
          <div className="management-split ombudsman-layout">
            <Card
              title="Manifestações recebidas"
              subtitle="O relato original do paciente é preservado."
            >
              {loading ? (
                <p className="muted" role="status">
                  Carregando manifestações…
                </p>
              ) : records.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Registro</th>
                        <th>Setor</th>
                        <th>Tipo</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((row) => (
                        <tr
                          key={row.id}
                          className={
                            selected?.id === row.id ? "selected-row" : ""
                          }
                        >
                          <td>
                            <button
                              className="table-choice"
                              onClick={() => setSelectedId(row.id)}
                              aria-pressed={selected?.id === row.id}
                            >
                              #{row.id.slice(0, 8).toUpperCase()}
                            </button>
                            <span className="table-date muted">
                              {dateTime(row.createdAt)}
                            </span>
                          </td>
                          <td>{row.sectorName}</td>
                          <td>{typeNames[row.type] ?? row.type}</td>
                          <td>
                            <StatusBadge
                              tone={
                                row.status === "resolvida" ? "green" : "red"
                              }
                            >
                              {statusNames[row.status]}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="Nenhuma manifestação neste período"
                  description="Comentários enviados pelos pacientes aparecerão aqui."
                />
              )}
            </Card>
            <Card
              title={
                selected
                  ? `Manifestação #${selected.id.slice(0, 8).toUpperCase()}`
                  : "Detalhes da manifestação"
              }
              subtitle={
                selected
                  ? `${selected.sectorName} · ${typeNames[selected.type] ?? selected.type}`
                  : undefined
              }
            >
              {selected ? (
                <form
                  className="management-form manifestation-detail"
                  onSubmit={save}
                >
                  <div>
                    <span className="field-label">Relato do paciente</span>
                    <blockquote className="patient-account">
                      {selected.comment ||
                        "O paciente solicitou retorno sem deixar comentário."}
                    </blockquote>
                  </div>
                  {selected.wantsContact && (
                    <div className="contact-request">
                      <ShieldCheck size={17} />
                      <span>
                        {selected.phone
                          ? `Retorno solicitado: ${selected.phone}`
                          : "Retorno solicitado. Contato restrito à Ouvidoria e ao Super Admin."}
                      </span>
                    </div>
                  )}
                  <Field label="Situação">
                    <select
                      className="input"
                      value={status}
                      onChange={(e) =>
                        setStatus(e.target.value as Manifestation["status"])
                      }
                    >
                      {Object.entries(statusNames).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Observação interna"
                    hint="Este registro não altera o comentário do paciente."
                  >
                    <textarea
                      className="input"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={3000}
                      rows={3}
                    />
                  </Field>
                  <SaveButton busy={busy}>Registrar encaminhamento</SaveButton>
                  {selected.history.length > 0 && (
                    <details className="manifestation-history">
                      <summary>
                        Histórico de encaminhamentos ({selected.history.length})
                      </summary>
                      <ol>
                        {selected.history
                          .slice()
                          .reverse()
                          .map((item, index) => (
                            <li key={`${item.at}-${index}`}>
                              <strong>
                                {statusNames[item.status] ?? item.status}
                              </strong>
                              <span>
                                {dateTime(item.at)} · {item.by}
                              </span>
                              {item.note && <p>{item.note}</p>}
                            </li>
                          ))}
                      </ol>
                    </details>
                  )}
                </form>
              ) : (
                <EmptyState title="Selecione uma manifestação" />
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export function Reports({ data, filters, notify }: CommonProps) {
  const [criteria, setCriteria] = useState(filters);
  const [mode, setMode] = useState<"summary" | "detailed">("summary");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<
    { name: string; createdAt: string; blob: Blob }[]
  >([]);
  useEffect(
    () => setCriteria(filters),
    [filters.sectorId, filters.from, filters.to],
  );
  async function exportFile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (criteria.from && criteria.to && criteria.from > criteria.to)
        throw new Error("A data inicial deve anteceder a data final.");
      const params = filterQuery(criteria);
      const dashboard = await api<DashboardData>(`/api/dashboard${params}`);
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "FHDOD";
      workbook.created = new Date();
      const summary = workbook.addWorksheet("Resumo geral");
      summary.addRows([
        ["FHDOD — experiência do paciente"],
        ["Período inicial", criteria.from || "Todos"],
        ["Período final", criteria.to || "Todos"],
        [
          "Setor",
          data.sectors.find((s) => s.id === criteria.sectorId)?.name ??
            "Todos os setores autorizados",
        ],
        ["Base de data", "Envio da pesquisa"],
        ["Exportado em", new Date().toISOString()],
        [],
        ["Indicador", "Valor"],
        ["Respostas enviadas", dashboard.responseCount],
        ["Respostas parciais", dashboard.partialCount],
        ["NPS", dashboard.nps],
        ["Satisfação (1 a 5)", dashboard.satisfaction],
        ["Manifestações pendentes", dashboard.pendingCount],
        [
          "Ambiente",
          data.demo
            ? "Demonstração — dados fictícios"
            : "Instalação do hospital",
        ],
      ]);
      const sectors = workbook.addWorksheet("Resultados por setor");
      sectors.addRow(["Setor", "Respostas", "NPS", "Satisfação (1 a 5)"]);
      dashboard.bySector.forEach((sector) =>
        sectors.addRow([
          sector.name,
          sector.count,
          sector.nps,
          sector.satisfaction,
        ]),
      );
      const distribution = workbook.addWorksheet("Distribuição NPS");
      distribution.addRow(["Nota", "Quantidade"]);
      dashboard.distribution.forEach((item) =>
        distribution.addRow([item.score, item.count]),
      );
      if (mode === "detailed" && data.permissions.canExportDetails) {
        const { responses } = await api<{
          responses: import("../models/types").ResponseRow[];
        }>(`/api/responses${params}`);
        const sheet = workbook.addWorksheet("Avaliações e respostas");
        sheet.addRow([
          "Registro",
          "Setor",
          "Pesquisa",
          "Situação",
          "Data do atendimento",
          "Turno",
          "Início (UTC)",
          "Envio (UTC)",
          "NPS",
          "Pergunta",
          "Categoria",
          "Tipo",
          "Resposta",
          "Respondido em (UTC)",
        ]);
        for (const row of responses) {
          const base = [
            row.id,
            row.sectorName,
            row.surveyTitle,
            row.status === "submitted" ? "Enviada" : "Parcial",
            row.attendedOn || "",
            row.shift || "",
            row.createdAt,
            row.submittedAt || "",
            row.nps,
          ];
          if (row.answers.length)
            for (const answer of row.answers)
              sheet.addRow([
                ...base,
                answer.questionText,
                answer.category,
                answer.type,
                typeof answer.value === "boolean"
                  ? answer.value
                    ? "Sim"
                    : "Não"
                  : answer.value,
                answer.answeredAt,
              ]);
          else sheet.addRow(base);
        }
        if (data.permissions.canViewManifestations) {
          const { manifestations } = await api<{
            manifestations: Manifestation[];
          }>(`/api/manifestations${params}`);
          const sheet = workbook.addWorksheet("Ouvidoria");
          sheet.addRow([
            "Registro",
            "Setor",
            "Tipo",
            "Relato original",
            "Situação",
            "Retorno solicitado",
            ...(data.permissions.canViewContacts ? ["Telefone"] : []),
            "Observação interna",
            "Recebido em (UTC)",
            "Atualizado em (UTC)",
          ]);
          for (const row of manifestations)
            sheet.addRow([
              row.id,
              row.sectorName,
              typeNames[row.type] ?? row.type,
              row.comment,
              statusNames[row.status],
              row.wantsContact ? "Sim" : "Não",
              ...(data.permissions.canViewContacts ? [row.phone || ""] : []),
              row.internalNote,
              row.createdAt,
              row.updatedAt,
            ]);
        }
      }
      for (const sheet of workbook.worksheets) {
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.getRow(1).font = { bold: true, color: { argb: "FFD92742" } };
        sheet.columns.forEach((column) => {
          column.width = 25;
        });
        sheet.eachRow((row) => {
          row.alignment = { vertical: "top", wrapText: true };
        });
      }
      const bytes = await workbook.xlsx.writeBuffer();
      await api("/api/exports", {
        method: "POST",
        body: { mode, filters: criteria },
      });
      const blob = new Blob([new Uint8Array(bytes)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const name = `fhdod-${mode === "summary" ? "resumo" : "detalhado"}-${localDate()}.xlsx`;
      download(blob, name);
      setHistory((current) =>
        [{ name, createdAt: new Date().toISOString(), blob }, ...current].slice(
          0,
          5,
        ),
      );
      notify("Arquivo Excel gerado.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Relatórios e exportação"
        description="Exporte os resultados respeitando os filtros e as permissões do seu perfil."
      />
      <div className="management-split reports-layout">
        <Card
          title="Novo relatório"
          subtitle="Escolha os critérios da exportação."
        >
          <form onSubmit={exportFile} className="management-form report-form">
            <FormError value={error} />
            <div className="form-grid">
              <Field label="Data inicial">
                <input
                  className="input"
                  type="date"
                  value={criteria.from}
                  onChange={(e) =>
                    setCriteria((c) => ({ ...c, from: e.target.value }))
                  }
                />
              </Field>
              <Field label="Data final">
                <input
                  className="input"
                  type="date"
                  value={criteria.to}
                  onChange={(e) =>
                    setCriteria((c) => ({ ...c, to: e.target.value }))
                  }
                />
              </Field>
            </div>
            <Field label="Setor">
              <select
                className="input"
                value={criteria.sectorId}
                onChange={(e) =>
                  setCriteria((c) => ({ ...c, sectorId: e.target.value }))
                }
              >
                <option value="">Todos os setores autorizados</option>
                {data.sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Conteúdo">
              <select
                className="input"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "summary" | "detailed")
                }
              >
                <option value="summary">Resumo dos indicadores</option>
                {data.permissions.canExportDetails && (
                  <option value="detailed">
                    Indicadores e respostas individuais
                  </option>
                )}
              </select>
            </Field>
            <p className="muted small">
              Período calculado pela data de envio. Telefones são incluídos
              somente quando seu perfil tem acesso a contatos.
            </p>
            <button
              className="button export-button"
              type="submit"
              disabled={busy}
            >
              <ArrowDownToLine size={17} />
              {busy ? "Gerando arquivo…" : "Exportar arquivo .xlsx"}
            </button>
          </form>
        </Card>
        <Card
          title="Abas incluídas no Excel"
          subtitle="O arquivo é gerado com os dados autorizados do período."
        >
          <ul className="export-inclusions">
            {[
              "Resumo geral",
              "Resultados por setor",
              "Distribuição das notas NPS",
              ...(mode === "detailed" && data.permissions.canExportDetails
                ? [
                    "Avaliações, respostas e horários",
                    ...(data.permissions.canViewManifestations
                      ? ["Ouvidoria e encaminhamentos"]
                      : []),
                  ]
                : []),
            ].map((label) => (
              <li key={label}>
                <Check size={18} />
                {label}
              </li>
            ))}
          </ul>
          {history.length > 0 && (
            <div className="export-session">
              <h3>Downloads desta sessão</h3>
              <p className="muted small">
                Disponíveis enquanto esta tela estiver aberta.
              </p>
              {history.map((entry, index) => (
                <div key={`${entry.createdAt}-${index}`}>
                  <span>
                    {entry.name}
                    <small>{dateTime(entry.createdAt)}</small>
                  </span>
                  <button
                    className="text-action"
                    onClick={() => download(entry.blob, entry.name)}
                    aria-label={`Baixar novamente ${entry.name}`}
                  >
                    Baixar <ArrowDownToLine size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

interface AuditEvent {
  id: string;
  userName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}
function AuditHistory({ sectors }: { sectors: Sector[] }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const actions: Record<string, string> = {
    setup: "Instalação inicial",
    created: "Criou",
    updated: "Atualizou",
    deactivated: "Desativou",
    password_changed: "Alterou a senha",
    generated: "Gerou exportação",
  };
  const resources: Record<string, string> = {
    user: "Usuário",
    sector: "Setor",
    survey: "Pesquisa",
    manifestation: "Manifestação",
    settings: "Configurações",
    export: "Exportação",
  };
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ events: AuditEvent[] }>(
        "/api/audit?limit=100",
      );
      setEvents(result.events);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  function details(event: AuditEvent) {
    const result: { label: string; value: string }[] = [];
    const values = event.details;
    if (typeof values.role === "string" && values.role in roleNames)
      result.push({ label: "Perfil", value: roleNames[values.role as Role] });
    if (typeof values.active === "boolean")
      result.push({
        label: "Situação",
        value: values.active ? "Ativo" : "Inativo",
      });
    if (typeof values.questionCount === "number")
      result.push({ label: "Perguntas", value: String(values.questionCount) });
    if (typeof values.status === "string" && values.status in statusNames)
      result.push({
        label: "Encaminhamento",
        value: statusNames[values.status],
      });
    if (values.mode === "summary" || values.mode === "detailed")
      result.push({
        label: "Conteúdo",
        value:
          values.mode === "summary"
            ? "Resumo dos indicadores"
            : "Respostas individuais",
      });
    if (Array.isArray(values.sectorIds))
      result.push({
        label: "Setores",
        value:
          values.sectorIds
            .map((id) => sectors.find((sector) => sector.id === id)?.name)
            .filter(Boolean)
            .join(", ") || "Todos",
      });
    for (const [key, label] of [
      ["commentLimit", "Limite de comentário"],
      ["lowScoreThreshold", "Nota máxima de atenção"],
      ["autoResetSeconds", "Retorno ao início da pesquisa (segundos)"],
    ])
      if (typeof values[key] === "number")
        result.push({ label, value: String(values[key]) });
    if (
      values.filters &&
      typeof values.filters === "object" &&
      !Array.isArray(values.filters)
    ) {
      const filters = values.filters as Record<string, unknown>;
      for (const [key, label] of [
        ["from", "Data inicial"],
        ["to", "Data final"],
      ])
        if (
          typeof filters[key] === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(filters[key])
        )
          result.push({ label, value: filters[key] });
      result.push({
        label: "Setor exportado",
        value:
          typeof filters.sectorId === "string" && filters.sectorId
            ? sectors.find((sector) => sector.id === filters.sectorId)?.name ||
              "Setor autorizado"
            : "Todos os setores autorizados",
      });
    }
    return result;
  }
  return (
    <Card
      title="Auditoria de alterações"
      subtitle="Últimos 100 registros administrativos. Senhas, contatos e relatos de pacientes não são exibidos."
      className="audit-card"
    >
      <button className="button secondary" onClick={load} disabled={loading}>
        <ShieldCheck size={16} />
        {loading
          ? "Consultando histórico…"
          : events
            ? "Atualizar histórico"
            : "Consultar histórico de alterações"}
      </button>
      <FormError value={error} />
      {events &&
        (events.length ? (
          <div className="table-wrap audit-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Ação</th>
                  <th>Recurso</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const items = details(event);
                  return (
                    <tr key={event.id}>
                      <td>{dateTime(event.createdAt)}</td>
                      <td>{event.userName}</td>
                      <td>{actions[event.action] ?? event.action}</td>
                      <td>
                        {resources[event.targetType] ?? event.targetType}
                        <span className="table-date muted">
                          {event.targetId === "global"
                            ? "Global"
                            : `#${event.targetId.slice(0, 8).toUpperCase()}`}
                        </span>
                      </td>
                      <td>
                        {items.length ? (
                          <details className="audit-details">
                            <summary>Ver detalhes</summary>
                            <dl>
                              {items.map((item) => (
                                <div key={item.label}>
                                  <dt>{item.label}</dt>
                                  <dd>{item.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        ) : (
                          <span className="muted">Sem detalhes adicionais</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhuma alteração registrada" />
        ))}
    </Card>
  );
}

export function SettingsPanel({ data, onRefresh, notify }: CommonProps) {
  const [settings, setSettings] = useState<Settings>(
    data.settings ?? {
      hospitalName: "Fundação Hospitalar Dr. Oswaldo Diesel",
      commentLimit: 1000,
      lowScoreThreshold: 6,
      autoResetSeconds: 10,
    },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const passwordId = useId();
  useEffect(() => {
    if (!data.permissions.canManageSettings) return;
    const controller = new AbortController();
    api<{ settings: Settings }>("/api/settings", { signal: controller.signal })
      .then((result) => setSettings(result.settings))
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [data.permissions.canManageSettings]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/settings", { method: "PUT", body: settings });
      await onRefresh();
      notify("Configurações salvas.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPasswordError("");
    if (values.get("newPassword") !== values.get("confirmPassword")) {
      setPasswordError("A confirmação não corresponde à nova senha.");
      return;
    }
    setChangingPassword(true);
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: {
          currentPassword: values.get("currentPassword"),
          newPassword: values.get("newPassword"),
        },
      });
      await api("/api/auth/logout", { method: "POST", body: {} });
      form.reset();
      notify("Senha alterada. Entre novamente com a nova senha.");
      window.dispatchEvent(new Event("session-expired"));
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setChangingPassword(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Configurações"
        description="Gerencie os parâmetros da plataforma e a segurança da sua conta."
      />
      <div className="management-split settings-layout">
        {data.permissions.canManageSettings ? (
          <Card
            title="Configurações gerais"
            subtitle="Parâmetros administrativos do sistema."
          >
            <form className="management-form" onSubmit={save}>
              <FormError value={error} />
              <Field label="Nome da instituição">
                <input
                  className="input"
                  value={settings.hospitalName}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, hospitalName: e.target.value }))
                  }
                  required
                  maxLength={160}
                />
              </Field>
              <Field
                label="Limite de caracteres do comentário"
                hint="Entre 100 e 5.000 caracteres."
              >
                <input
                  className="input"
                  type="number"
                  min={100}
                  max={5000}
                  step={1}
                  value={settings.commentLimit}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      commentLimit: Number(e.target.value),
                    }))
                  }
                  required
                />
              </Field>
              <Field
                label="Nota máxima para sinalizar atenção"
                hint="Um NPS igual ou inferior a esta nota destaca o relato para a ouvidoria."
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={settings.lowScoreThreshold}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      lowScoreThreshold: Number(e.target.value),
                    }))
                  }
                  required
                />
              </Field>
              <Field
                label="Retorno ao início da pesquisa (segundos)"
                hint="Após a confirmação do envio, em qualquer dispositivo. Padrão: 10 segundos."
              >
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={120}
                  step={1}
                  value={settings.autoResetSeconds}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      autoResetSeconds: Number(e.target.value),
                    }))
                  }
                  required
                />
              </Field>
              <SaveButton busy={busy} />
            </form>
          </Card>
        ) : (
          <Card
            title="Seu acesso"
            subtitle="Permissões definidas pelo Super Admin."
          >
            <div className="account-overview">
              <ShieldCheck size={30} />
              <h3>{roleNames[data.user.role]}</h3>
              <p>{data.user.name}</p>
              <p className="muted">{data.user.email}</p>
              <p className="muted small">
                Setores:{" "}
                {data.user.role === "superadmin"
                  ? "todos"
                  : data.sectors.map((s) => s.name).join(", ") || "nenhum"}
              </p>
            </div>
          </Card>
        )}
        <Card
          title="Segurança da conta"
          subtitle="Troque sua senha sempre que necessário."
        >
          <form className="management-form" onSubmit={changePassword}>
            <FormError value={passwordError} />
            <PasswordField
              id={`${passwordId}-current`}
              label="Senha atual"
              name="currentPassword"
              autoComplete="current-password"
              required
              maxLength={128}
            />
            <PasswordField
              label="Nova senha"
              hint="Use entre 12 e 128 caracteres."
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
            <PasswordField
              label="Confirme a nova senha"
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
            <p className="muted small">
              Após a alteração, suas sessões serão encerradas e será necessário
              entrar novamente.
            </p>
            <button
              className="button"
              type="submit"
              disabled={changingPassword}
            >
              <KeyRound size={16} />
              {changingPassword ? "Alterando…" : "Alterar minha senha"}
            </button>
          </form>
        </Card>
      </div>
      {data.user.role === "superadmin" && (
        <AuditHistory sectors={data.sectors} />
      )}
    </>
  );
}
