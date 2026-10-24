import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  ViewTransition,
} from "react";
import type { FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ClipboardList,
  FileBarChart2,
  Grid2X2,
  Hospital,
  KeyRound,
  LogOut,
  MessageCircle,
  Plus,
  RotateCw,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { api, ApiError } from "./api";
import {
  Brand,
  Card,
  Field,
  Loading,
  PageTitle,
} from "./components";
import { Dashboard, QuestionEditor, Results, Surveys } from "./AdminPages";
import {
  Ombudsman,
  Reports,
  Sectors,
  SettingsPanel,
  Users,
} from "./Management";
import PatientSurvey from "./PatientSurvey";
import type { Bootstrap, Filters, User } from "./types";

const roleNames = {
  superadmin: "Super Administrador",
  sector_admin: "Admin de Setor",
  management: "Gestão",
  ombudsman: "Ouvidoria",
  viewer: "Visualizador",
};
const links = [
  { path: "/", name: "Visão geral", icon: Grid2X2 },
  { path: "/pesquisas", name: "Pesquisas", icon: ClipboardList },
  { path: "/setores", name: "Setores", icon: Hospital },
  { path: "/resultados", name: "Resultados", icon: ChartNoAxesColumn },
  { path: "/ouvidoria", name: "Ouvidoria", icon: MessageCircle },
  { path: "/relatorios", name: "Relatórios", icon: FileBarChart2 },
];
function initialFilters(): Filters {
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return { sectorId: "", from: `${date.slice(0, 7)}-01`, to: date };
}

function Authentication({
  needsSetup,
  onSuccess,
  demo,
}: {
  needsSetup: boolean;
  onSuccess: () => Promise<void>;
  demo: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        body: {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      await onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Brand />
      </div>
      <main className="auth-layout">
        <div className="auth-intro">
          <span className="auth-symbol" aria-hidden="true">
            <img src="/assets/fhdod-logo.png" alt="" />
          </span>
          <h1>
            Cuidar começa
            <br />
            por ouvir.
          </h1>
          <p>
            Acompanhe a experiência dos pacientes e transforme cada resposta em
            cuidado.
          </p>
          <div className="auth-trust">
            <ShieldCheck size={20} />
            <span>Acesso exclusivo à equipe do hospital</span>
          </div>
        </div>
        <Card className="auth-card">
          <h2>
            {needsSetup ? "Configure o primeiro acesso" : "Bem-vindo de volta"}
          </h2>
          <p>
            {needsSetup
              ? "Cadastre o administrador responsável pela plataforma."
              : "Entre com sua conta para acessar o painel."}
          </p>
          {demo && (
            <p className="demo-auth">
              Ambiente de demonstração · dados fictícios
            </p>
          )}
          <form className="stack-form" onSubmit={submit}>
            {needsSetup && (
              <Field label="Nome do administrador">
                <input
                  className="input"
                  name="name"
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="E-mail">
              <input
                className="input"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="username"
                placeholder="seu.email@hospital.com.br"
              />
            </Field>
            <Field
              label={needsSetup ? "Senha temporária de instalação" : "Senha"}
              hint={
                needsSetup
                  ? "De 12 a 128 caracteres. Você definirá sua senha pessoal na próxima etapa."
                  : undefined
              }
            >
              <input
                className="input"
                type="password"
                name="password"
                required
                minLength={needsSetup ? 12 : 1}
                maxLength={128}
                autoComplete={needsSetup ? "new-password" : "current-password"}
              />
            </Field>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <button className="button" disabled={busy}>
              {busy
                ? "Aguarde…"
                : needsSetup
                  ? "Configurar administrador"
                  : "Entrar no painel"}
              <ArrowRight size={17} />
            </button>
          </form>
          {!needsSetup && (
            <p className="auth-help">
              Esqueceu a senha? Solicite uma senha temporária ao Super Admin.
            </p>
          )}
        </Card>
      </main>
      <footer className="auth-footer">
        Fundação Hospitalar Dr. Oswaldo Diesel · Experiência do paciente
      </footer>
    </div>
  );
}

function TemporaryPassword({
  onSuccess,
  onLogout,
}: {
  onSuccess: () => Promise<void>;
  onLogout: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    if (form.get("newPassword") !== form.get("confirmation")) {
      setError("As novas senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: {
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        },
      });
      await onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="password-page">
      <Brand />
      <Card
        title="Defina sua senha pessoal"
        subtitle="Sua senha é temporária. Altere-a para acessar o painel."
      >
        <form className="stack-form" onSubmit={submit}>
          <Field label="Senha temporária">
            <input
              type="password"
              className="input"
              name="currentPassword"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </Field>
          <Field label="Nova senha" hint="Use de 12 a 128 caracteres.">
            <input
              type="password"
              className="input"
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </Field>
          <Field label="Confirme a nova senha">
            <input
              type="password"
              className="input"
              name="confirmation"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </Field>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Salvando…" : "Salvar senha e continuar"}
            <Check size={17} />
          </button>
          <button type="button" className="text-button" onClick={onLogout}>
            Sair da conta
          </button>
        </form>
      </Card>
    </div>
  );
}

function AdminApp() {
  const [demo, setDemo] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [route, setRoute] = useState(window.location.pathname);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  const [menu, setMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const notify = useCallback((message: string) => setToast(message), []);
  const refresh = useCallback(async () => {
    const auth = await api<{ user: User }>("/api/auth/me");
    setUser(auth.user);
    if (!auth.user.mustChangePassword)
      setData(await api<Bootstrap>("/api/bootstrap"));
    else setData(null);
  }, []);
  const start = useCallback(async () => {
    setFatalError("");
    setLoading(true);
    try {
      const setup = await api<{ needsSetup: boolean; demo: boolean }>(
        "/api/auth/setup",
      );
      setNeedsSetup(setup.needsSetup);
      setDemo(setup.demo);
      if (!setup.needsSetup) {
        try {
          await refresh();
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e;
        }
      }
    } catch (e) {
      setFatalError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void start();
    const expired = () => {
      setUser(null);
      setData(null);
      setDirty(false);
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, [start]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const navigate = useCallback(
    (path: string) => {
      if (path === window.location.pathname) {
        setMenu(false);
        return;
      }
      if (
        dirty &&
        !window.confirm(
          "Há alterações ainda não publicadas. Sair e descartar o rascunho?",
        )
      )
        return;
      setDirty(false);
      setMenu(false);
      startTransition(() => setRoute(path));
      window.history.pushState({}, "", path);
      window.scrollTo({ top: 0 });
    },
    [dirty],
  );
  useEffect(() => {
    const pop = () => {
      if (dirty && !window.confirm("Descartar alterações não publicadas?")) {
        window.history.pushState({}, "", route);
        return;
      }
      setDirty(false);
      startTransition(() => setRoute(window.location.pathname));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [dirty, route]);
  async function logout() {
    if (
      dirty &&
      !window.confirm("Sair e descartar as alterações não publicadas?")
    )
      return;
    try {
      await api("/api/auth/logout", { method: "POST" });
      setData(null);
      setUser(null);
      setDirty(false);
      setMenu(false);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function refreshClick() {
    setRefreshing(true);
    try {
      await refresh();
      notify("Dados atualizados.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  if (loading)
    return (
      <div className="fullscreen-loading">
        <Brand />
        <Loading label="Preparando seu painel…" />
      </div>
    );
  if (fatalError)
    return (
      <div className="password-page">
        <Brand />
        <Card title="Não foi possível conectar ao servidor">
          <p className="error-banner" role="alert">
            {fatalError}
          </p>
          <button className="button" onClick={() => void start()}>
            Tentar novamente
          </button>
        </Card>
      </div>
    );
  if (!user)
    return (
      <Authentication
        needsSetup={needsSetup}
        onSuccess={async () => {
          setNeedsSetup(false);
          await refresh();
        }}
        demo={demo}
      />
    );
  if (user.mustChangePassword)
    return (
      <TemporaryPassword onSuccess={refresh} onLogout={() => void logout()} />
    );
  if (!data) return <Loading />;
  const visibleLinks = links.filter(
    (link) =>
      link.path !== "/ouvidoria" || data.permissions.canViewManifestations,
  );
  const activePath = route.startsWith("/pesquisas/") ? "/pesquisas" : route;
  const props = {
    data,
    filters,
    onRefresh: refresh,
    notify,
    onNavigate: navigate,
  };
  const showFilters = ["/", "/resultados", "/ouvidoria"].includes(route);
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <>
      <a href="#conteudo" className="skip-link">
        Ir para o conteúdo
      </a>
      <div className="app-shell">
        <header className="topbar">
          <Brand />
          <div className="header-tools">
            <button
              className="icon-button"
              title="Atualizar dados"
              aria-label="Atualizar dados"
              onClick={() => void refreshClick()}
              disabled={refreshing}
            >
              <RotateCw size={17} className={refreshing ? "spin" : ""} />
            </button>
            {data.permissions.canViewManifestations && (
              <button
                className="icon-button notifications-button"
                title="Consultar ouvidoria"
                aria-label="Consultar ouvidoria"
                onClick={() => navigate("/ouvidoria")}
              >
                <Bell size={19} />
              </button>
            )}
            <div className="profile-container">
              <button
                className="profile-button"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <span className="avatar">{initials}</span>
                <span className="profile-name">
                  <strong>{user.name}</strong>
                  <small>{roleNames[user.role]}</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {menu && (
                <div className="profile-menu">
                  <button onClick={() => navigate("/configuracoes")}>
                    <KeyRound size={16} />
                    Minha conta e senha
                  </button>
                  <button onClick={() => void logout()}>
                    <LogOut size={16} />
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <nav className="top-navigation" aria-label="Navegação principal">
          {visibleLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className={activePath === link.path ? "active" : ""}
              aria-current={activePath === link.path ? "page" : undefined}
            >
              {link.name}
            </button>
          ))}
        </nav>
        {data.demo && (
          <div className="demo-banner">
            <ShieldCheck size={14} />
            Ambiente de demonstração · dados fictícios · banco separado da
            instalação real
          </div>
        )}
        <div className="app-body">
          <aside className="side-rail" aria-label="Acessos rápidos">
            <div className="rail-group">
              {links.slice(0, 4).map((link) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.path}
                    className={activePath === link.path ? "active" : ""}
                    onClick={() => navigate(link.path)}
                    title={link.name}
                    aria-label={link.name}
                  >
                    <Icon size={19} strokeWidth={1.6} />
                  </button>
                );
              })}
            </div>
            <div className="rail-group">
              {data.permissions.canManageUsers && (
                <button
                  onClick={() => navigate("/usuarios")}
                  className={route === "/usuarios" ? "active" : ""}
                  title="Usuários"
                  aria-label="Usuários"
                >
                  <UsersRound size={19} strokeWidth={1.6} />
                </button>
              )}
              {data.permissions.canViewManifestations && (
                <button
                  onClick={() => navigate("/ouvidoria")}
                  className={route === "/ouvidoria" ? "active" : ""}
                  title="Ouvidoria"
                  aria-label="Ouvidoria"
                >
                  <MessageCircle size={19} strokeWidth={1.6} />
                </button>
              )}
              <button
                onClick={() => navigate("/relatorios")}
                className={route === "/relatorios" ? "active" : ""}
                title="Relatórios"
                aria-label="Relatórios"
              >
                <FileBarChart2 size={19} strokeWidth={1.6} />
              </button>
            </div>
            <div className="rail-group">
              <button
                onClick={() => navigate("/configuracoes")}
                className={route === "/configuracoes" ? "active" : ""}
                title="Configurações"
                aria-label="Configurações"
              >
                <Settings size={19} strokeWidth={1.6} />
              </button>
              <button
                onClick={() => void logout()}
                title="Sair"
                aria-label="Sair"
              >
                <LogOut size={19} strokeWidth={1.6} />
              </button>
            </div>
          </aside>
          <ViewTransition name="admin-content">
            <main id="conteudo" className="route-content" tabIndex={-1}>
              {showFilters && (
                <div className="global-filters">
                  <label>
                    <span>Setor</span>
                    <select
                      className="input"
                      aria-label="Setor dos indicadores"
                      value={filters.sectorId}
                      onChange={(e) =>
                        setFilters({ ...filters, sectorId: e.target.value })
                      }
                    >
                      <option value="">
                        {user.role === "superadmin"
                          ? "Todos os setores"
                          : "Setores autorizados"}
                      </option>
                      {data.sectors.map((sector) => (
                        <option key={sector.id} value={sector.id}>
                          {sector.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="date-range">
                    <legend>Período das respostas</legend>
                    <input
                      className="input"
                      type="date"
                      aria-label="Data inicial"
                      value={filters.from}
                      max={filters.to || undefined}
                      onChange={(e) =>
                        setFilters({ ...filters, from: e.target.value })
                      }
                    />
                    <span>até</span>
                    <input
                      className="input"
                      type="date"
                      aria-label="Data final"
                      value={filters.to}
                      min={filters.from || undefined}
                      onChange={(e) =>
                        setFilters({ ...filters, to: e.target.value })
                      }
                    />
                  </fieldset>
                  <button
                    className="text-button"
                    onClick={() => setFilters(initialFilters())}
                  >
                    Este mês
                  </button>
                </div>
              )}
              {route === "/" ? (
                <>
                  <PageTitle
                    title="Visão geral"
                    description="Acompanhe a experiência dos pacientes e as pesquisas do hospital."
                    action={
                      <>
                        <button
                          className="button secondary"
                          onClick={() => navigate("/relatorios")}
                        >
                          <ArrowDownToLine size={15} />
                          Exportar Excel
                        </button>
                        {data.permissions.canEditSurveys && (
                          <button
                            className="button"
                            onClick={() => navigate("/pesquisas")}
                          >
                            <Plus size={15} />
                            Nova pesquisa
                          </button>
                        )}
                      </>
                    }
                  />
                  <Dashboard {...props} />
                </>
              ) : route === "/pesquisas" ? (
                <Surveys {...props} />
              ) : route.startsWith("/pesquisas/") ? (
                <QuestionEditor
                  key={route}
                  {...props}
                  surveyId={route.split("/")[2]}
                  onDirtyChange={setDirty}
                />
              ) : route === "/setores" ? (
                <Sectors {...props} />
              ) : route === "/resultados" ? (
                <Results {...props} />
              ) : route === "/ouvidoria" ? (
                <Ombudsman {...props} />
              ) : route === "/usuarios" ? (
                <Users {...props} />
              ) : route === "/relatorios" ? (
                <Reports {...props} />
              ) : route === "/configuracoes" ? (
                <SettingsPanel {...props} />
              ) : (
                <Card title="Página não encontrada">
                  <p>Escolha uma das áreas no menu para continuar.</p>
                  <button className="button" onClick={() => navigate("/")}>
                    Voltar à visão geral
                  </button>
                </Card>
              )}
            </main>
          </ViewTransition>
        </div>
        <footer className="app-footer">
          <span>FHDOD · Experiência do paciente</span>
          <span>
            Horários em Brasília ·{" "}
            {data.demo ? "Demonstração" : "Painel administrativo"}
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      )}
    </>
  );
}

export default function App() {
  const slug = window.location.pathname.match(/^\/avaliar\/([^/]+)\/?$/);
  return slug ? (
    <PatientSurvey slug={decodeURIComponent(slug[1])} />
  ) : (
    <AdminApp />
  );
}
