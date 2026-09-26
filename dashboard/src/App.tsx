import Overview from "./Overview";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  LayoutDashboard,
  Map,
  Users,
  CreditCard,
  CalendarDays,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  MapPin,
  Clock,
  ArrowDownToLine,
  MoreHorizontal,
  X,
  Check,
  Menu,
  LogOut,
  HelpCircle,
  CheckCircle2,
  ShieldCheck,
  Plane,
  Hotel,
  Activity,
  Trash2,
  Pencil,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import { api, setCsrf } from "./api";
import { travelPayload, userPayload, gatewayPayload } from "./formPayloads";
import {
  calendarAgenda,
  calendarDateKey,
  moveCalendarMonth,
  travelsInPeriod,
} from "./calendar";
import { refreshWorkspace } from "./workspaceRefresh";
import {
  type User,
  type Travel,
  type Gateway,
  type Stop,
  money,
  date,
  initials,
  matchesTravel,
  csvCell,
  photo,
  reconcileSessionUser,
} from "./types";
type Page =
  "overview" | "travels" | "users" | "payments" | "calendar" | "settings";
type Editor = {
  kind: "travel" | "user" | "gateway";
  item?: Travel | User | Gateway;
} | null;
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "travels", label: "Travel plans", icon: Map },
  { id: "users", label: "People", icon: Users },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
] as const;
const statusLabel = (value: string) => value.toLowerCase().replaceAll("_", " ");
function Badge({ value }: { value: string }) {
  return (
    <span className={"badge " + value.toLowerCase()}>
      <i />
      {statusLabel(value)}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Compass size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      onLogin(await api<User>("/auth/login", "POST", Object.fromEntries(data)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <a className="brand" href="#sign-in">
          <img src="/mark.svg" alt="" />
          travel<span>plan.</span>
        </a>
        <div>
          <span className="eyebrow">THE WORLD, WELL PLANNED</span>
          <h1>
            Extraordinary journeys.
            <br />
            Thoughtfully managed.
          </h1>
          <p>
            A little less busywork.
            <br />A little more possibility.
          </p>
        </div>
        <img
          className="login-photo"
          src={photo("bali")}
          alt="Lush green terraces in Bali"
        />
        <span className="login-location">
          <MapPin size={15} /> Ubud, Bali
        </span>
      </section>
      <section className="login-form" id="sign-in">
        <div className="login-form-inner">
          <span className="eyebrow">YOUR ADMIN WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p>
            {window.TRAVEL_PLAN_PREVIEW
              ? "Design preview. Use any nonempty password to reopen the sample workspace."
              : "Sign in and pick up where your journey left off."}
          </p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                defaultValue="admin@travelplan.local"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={72}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="button primary login-submit"
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  Sign in <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <p className="login-note">
            <ShieldCheck size={16} />{" "}
            {window.TRAVEL_PLAN_PREVIEW
              ? "Local sample data. No live connections."
              : "Secure administrator access"}
          </p>
        </div>
        <p className="login-footer">
          Travel Plan © {new Date().getFullYear()}{" "}
          <span>Made for the journey.</span>
        </p>
      </section>
    </main>
  );
}
export default function App() {
  const sessionRevision = useRef(0);
  const refreshRevision = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const revisionAtRender = sessionRevision.current;
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState<Page>("overview");
  const [travels, setTravels] = useState<Travel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [editor, setEditor] = useState<Editor>(null);
  const [detail, setDetail] = useState<Travel | null>(null);
  const [remove, setRemove] = useState<{
    kind: string;
    id: string;
    name: string;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const canTravel = user?.role === "ADMIN";
  const admin = user?.role === "ADMIN";
  const notify = (message: string) => {
    if (revisionAtRender !== sessionRevision.current) return;
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 4500);
  };
  function clearSession() {
    sessionRevision.current += 1;
    window.clearTimeout(toastTimer.current);
    setUser(null);
    setCsrf("");
    setTravels([]);
    setUsers([]);
    setGateways([]);
    setEditor(null);
    setDetail(null);
    setRemove(null);
    setSearch("");
    setFilter("ALL");
    setPage("overview");
    setMenu(false);
    setHelp(false);
    setToast("");
    setError("");
    setLoading(false);
    setDeleting(false);
    setCalendarDate(new Date());
    setActiveDay(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const login = (u: User) => {
    if (u.role !== "ADMIN")
      throw new Error("Administrator access is required for this workspace.");
    sessionRevision.current += 1;
    setUser(u);
    setCsrf(u.csrf || "");
  };
  useEffect(() => {
    let active = true;
    const revision = sessionRevision.current;
    api<User>("/auth/me")
      .then((u) => {
        if (active && revision === sessionRevision.current) login(u);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setChecking(false);
      });
    const expire = () => clearSession();
    window.addEventListener("session-expired", expire);
    return () => {
      active = false;
      window.clearTimeout(toastTimer.current);
      window.removeEventListener("session-expired", expire);
    };
  }, []);
  async function refresh() {
    const revision = sessionRevision.current;
    const request = ++refreshRevision.current;
    const isCurrent = () =>
      revision === sessionRevision.current &&
      request === refreshRevision.current;
    setLoading(true);
    setError("");
    try {
      const failures = await refreshWorkspace(
        {
          travels: () => api<Travel[]>("/travels"),
          users: () => api<User[]>("/users"),
          gateways: () => api<Gateway[]>("/payments"),
        },
        {
          travels: setTravels,
          users: (people) => {
            setUsers(people);
            setUser((current) => reconcileSessionUser(current, people));
          },
          gateways: setGateways,
        },
        isCurrent,
      );
      if (isCurrent()) setError(failures.join(" · "));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }
  useEffect(() => {
    if (user) refresh();
  }, [user?.id]);
  function navigate(p: Page) {
    setPage(p);
    setSearch("");
    setFilter("ALL");
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function deleted() {
    if (!remove) return;
    setDeleting(true);
    try {
      await api("/" + remove.kind + "/" + remove.id, "DELETE");
      if (revisionAtRender !== sessionRevision.current) return;
      setRemove(null);
      await refresh();
      notify("Record deleted");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      if (revisionAtRender === sessionRevision.current) setDeleting(false);
    }
  }
  function exportPlans() {
    const rows = [
      [
        "Travel",
        "Destinations",
        "Start",
        "End",
        "Status",
        "Price USD",
        "Capacity",
      ],
      ...travels.map((t) => [
        t.title,
        t.stops.map((s) => s.destination).join(" → "),
        t.start_date,
        t.end_date,
        t.status,
        t.price,
        t.capacity,
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "travel-plans.csv";
    link.click();
    URL.revokeObjectURL(url);
    notify("Travel plans exported");
  }
  if (checking)
    return (
      <div className="app-loading">
        <img src="/mark.svg" alt="Travel Plan" />
        <LoaderCircle className="spin" />
      </div>
    );
  if (!user) return <Login onLogin={login} />;
  return (
    <div className="app" data-page={page}>
      <a href="#main" className="skip">
        Skip to content
      </a>
      {menu && (
        <button
          type="button"
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <a
          href="#overview"
          className="brand"
          onClick={() => navigate("overview")}
        >
          <img src="/mark.svg" alt="" />
          travel<span>plan.</span>
        </a>
        <button
          className="workspace-switch"
          aria-label="Workspace guide"
          title="Workspace guide"
          onClick={() => setHelp(true)}
        >
          <span className="workspace-icon">
            <Compass size={19} />
          </span>
          <span>
            <strong>The travel workspace</strong>
            <small>Administration</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Workspace">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-label={n.label}
              data-label={n.label}
              className={page === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
              aria-current={page === n.id ? "page" : undefined}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "travels" && (
                <span className="nav-count">{travels.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            aria-label="Settings"
            data-label="Settings"
            className={"side-link " + (page === "settings" ? "selected" : "")}
            onClick={() => navigate("settings")}
            aria-current={page === "settings" ? "page" : undefined}
          >
            <Settings size={18} /> Settings
          </button>
          <button
            className="side-link"
            aria-label="Help & getting started"
            data-label="Help & getting started"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={18} /> Help & getting started
          </button>
          <button className="profile" onClick={() => navigate("settings")}>
            <span className="avatar">{initials(user.name)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{statusLabel(user.role)}</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={22} />
          </button>
          <span className="breadcrumb">
            <span className="workspace-wordmark">
              travelplan<i>.</i>
            </span>
            <span className="workspace-context">Workspace</span>
            <ChevronRight size={13} />{" "}
            <strong>
              {nav.find((n) => n.id === page)?.label || "Settings"}
            </strong>
          </span>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Help"
              onClick={() => setHelp(true)}
            >
              <HelpCircle size={19} />
            </button>
            <span className="topbar-divider" />
            <button
              className="avatar small"
              aria-label="Account settings"
              onClick={() => navigate("settings")}
            >
              {initials(user.name)}
            </button>
          </div>
        </header>
        <main id="main" className="content">
          <div className="page-surface" data-page={page} key={page}>
            {error && (
              <div className="error-banner" role="alert">
                <AlertCircle size={18} />
                {error}
                <button onClick={refresh}>Try again</button>
              </div>
            )}
            {page === "overview" && (
              <Overview
                travels={travels}
                users={users}
                gateways={gateways}
                canTravel={canTravel}
                onCreate={() => setEditor({ kind: "travel" })}
                onOpen={setDetail}
                onPlans={() => navigate("travels")}
                onExport={exportPlans}
              />
            )}
            {page === "travels" && (
              <>
                <PageHeading
                  section="Travel plans"
                  number="02"
                  meta={`${travels.length} ${travels.length === 1 ? "journey" : "journeys"}`}
                  title="Good plans. Great journeys."
                  description="Create, refine, and manage every detail of your travels."
                  action={
                    <>
                      <button className="button" onClick={exportPlans}>
                        <ArrowDownToLine size={17} /> Export
                      </button>
                      <button
                        className="button primary"
                        disabled={!canTravel}
                        onClick={() => setEditor({ kind: "travel" })}
                      >
                        <Plus size={17} /> Create travel plan
                      </button>
                    </>
                  }
                />
                <div className="toolbar">
                  <div className="tabs">
                    {["ALL", "PUBLISHED", "DRAFT", "ARCHIVED"].map((s) => (
                      <button
                        className={filter === s ? "selected" : ""}
                        onClick={() => setFilter(s)}
                        key={s}
                      >
                        {s === "ALL" ? "All plans" : statusLabel(s)}
                        <span>
                          {
                            travels.filter((t) => s === "ALL" || t.status === s)
                              .length
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search travel plans"
                      placeholder="Search destinations, plans…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                <div className="travel-list">
                  {travels
                    .filter(
                      (t) =>
                        (filter === "ALL" || filter === t.status) &&
                        matchesTravel(t, search),
                    )
                    .map((t) => (
                      <article className="travel-row" key={t.id}>
                        <button
                          className="row-photo"
                          onClick={() => setDetail(t)}
                          aria-label={"View " + t.title}
                        >
                          <img
                            src={photo(t.image)}
                            alt={t.stops[0]?.destination}
                          />
                        </button>
                        <div className="travel-row-main">
                          <Badge value={t.status} />
                          <button
                            className="title-button"
                            onClick={() => setDetail(t)}
                          >
                            <h3>{t.title}</h3>
                          </button>
                          <p>
                            <MapPin size={14} />
                            {t.stops.map((s) => s.destination).join(" → ")}
                          </p>
                          <div className="travel-meta">
                            <span>
                              <CalendarDays size={14} />
                              {date(t.start_date)} – {date(t.end_date)}
                            </span>
                            <span>
                              <Clock size={14} />
                              {t.duration} days
                            </span>
                            <span>
                              <Users size={14} />
                              {t.participantIds.length}/{t.capacity}
                            </span>
                          </div>
                        </div>
                        <div className="travel-row-end">
                          <div>
                            <strong>{money(t.price)}</strong>
                            <small>per person · USD</small>
                          </div>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              aria-label={"Edit " + t.title}
                              disabled={!canTravel}
                              onClick={() =>
                                setEditor({ kind: "travel", item: t })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label={"Delete " + t.title}
                              disabled={!canTravel}
                              onClick={() =>
                                setRemove({
                                  kind: "travels",
                                  id: t.id,
                                  name: t.title,
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={"View " + t.title}
                              onClick={() => setDetail(t)}
                            >
                              <ArrowUpRight size={19} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
                {!loading &&
                  !travels.some(
                    (t) =>
                      (filter === "ALL" || filter === t.status) &&
                      matchesTravel(t, search),
                  ) && (
                    <Empty
                      title="No journeys found"
                      text="Try another search or create a new travel plan."
                    />
                  )}
              </>
            )}
            {page === "users" && (
              <>
                <PageHeading
                  section="People"
                  number="03"
                  meta={`${users.length} ${users.length === 1 ? "person" : "people"}`}
                  title="People make the journey."
                  description="The right access, for everyone in your workspace."
                  action={
                    <button
                      className="button primary"
                      disabled={!admin}
                      onClick={() => setEditor({ kind: "user" })}
                    >
                      <Plus size={17} /> Add person
                    </button>
                  }
                />
                <div className="toolbar">
                  <span className="result-count">
                    {users.length} {users.length === 1 ? "person" : "people"} in
                    your workspace
                  </span>
                  <label className="search">
                    <Search size={17} />
                    <input
                      placeholder="Search people…"
                      aria-label="Search people"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Joined</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users
                        .filter((u) =>
                          (u.name + " " + u.email)
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((u) => (
                          <tr key={u.id}>
                            <td>
                              <div className="person">
                                <span className="avatar">
                                  {initials(u.name)}
                                </span>
                                <span>
                                  <strong>
                                    {u.name}
                                    {u.id === user.id && (
                                      <small className="you-label">You</small>
                                    )}
                                  </strong>
                                  <small>{u.email}</small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className="role-label">
                                <ShieldCheck size={14} />
                                {statusLabel(u.role)}
                              </span>
                            </td>
                            <td>
                              <Badge value={u.status} />
                            </td>
                            <td>{date(u.created_at)}</td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  aria-label={"Edit " + u.name}
                                  disabled={!admin}
                                  onClick={() =>
                                    setEditor({ kind: "user", item: u })
                                  }
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="icon-button danger"
                                  aria-label={"Delete " + u.name}
                                  disabled={!admin || u.id === user.id}
                                  onClick={() =>
                                    setRemove({
                                      kind: "users",
                                      id: u.id,
                                      name: u.name,
                                    })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="hint">
                  <ShieldCheck size={18} />
                  <p>
                    Administrator access is required for this workspace. People
                    with other roles can still be assigned to travel plans.
                  </p>
                </div>
              </>
            )}
            {page === "payments" && (
              <>
                <PageHeading
                  section="Payments"
                  number="04"
                  meta={`${gateways.length} payment ${gateways.length === 1 ? "method" : "methods"}`}
                  title="A smooth way to pay."
                  description="Manage the payment methods available to your travellers."
                  action={
                    <button
                      className="button primary"
                      disabled={!admin}
                      onClick={() => setEditor({ kind: "gateway" })}
                    >
                      <Plus size={17} /> Add payment method
                    </button>
                  }
                />
                <div className="payment-intro">
                  <ShieldCheck size={22} />
                  <div>
                    <strong>Your workspace is in sandbox mode</strong>
                    <p>
                      Connect test credentials to verify providers. No real
                      payments are collected.
                    </p>
                  </div>
                  <span className="badge draft">Sandbox</span>
                </div>
                <div className="payment-list">
                  {gateways.map((g) => (
                    <article className="payment-card" key={g.id}>
                      <div
                        className={"provider-logo " + g.provider.toLowerCase()}
                      >
                        {g.provider === "STRIPE" ? "stripe" : "PayPal"}
                      </div>
                      <div className="payment-info">
                        <h2>{g.name}</h2>
                        <p>
                          {g.provider === "STRIPE"
                            ? "Cards and digital wallets"
                            : "PayPal accounts and checkout"}
                        </p>
                        <div className="provider-meta">
                          <span>{g.currency}</span>
                          <span>{g.enabled ? "Enabled" : "Disabled"}</span>
                          <span>{g.mode.toLowerCase()}</span>
                        </div>
                      </div>
                      <div className="payment-controls">
                        <Badge
                          value={g.configured ? "CONFIGURED" : "NOT_CONFIGURED"}
                        />
                        <div className="row-actions">
                          <button
                            className="button small-button"
                            disabled={!admin}
                            onClick={async () => {
                              try {
                                const result = await api<{ message: string }>(
                                  "/payments/" + g.id + "/test",
                                  "POST",
                                );
                                notify(result.message);
                              } catch (e) {
                                notify((e as Error).message);
                              }
                            }}
                          >
                            Test connection <ArrowUpRight size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={"Edit " + g.name}
                            disabled={!admin}
                            onClick={() =>
                              setEditor({ kind: "gateway", item: g })
                            }
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label={"Delete " + g.name}
                            disabled={!admin}
                            onClick={() =>
                              setRemove({
                                kind: "payments",
                                id: g.id,
                                name: g.name,
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hint">
                  <HelpCircle size={18} />
                  <p>
                    Provider credentials are managed securely by your deployment
                    administrator. Configured means credentials are present; use
                    Test connection to verify them with the provider.
                  </p>
                </div>
              </>
            )}
            {page === "calendar" && (
              <>
                <PageHeading
                  section="Calendar"
                  number="05"
                  meta={calendarDate.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                  title="Make time for somewhere new."
                  description="Your upcoming journeys, with a little perspective."
                  action={
                    <button
                      className="button"
                      onClick={() => {
                        setCalendarDate(new Date());
                        setActiveDay(null);
                      }}
                    >
                      Today
                    </button>
                  }
                />
                <div className="calendar-layout">
                  <section className="calendar">
                    <div className="calendar-heading">
                      <h2>
                        {calendarDate.toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        })}
                      </h2>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label="Previous month"
                          onClick={() => {
                            setCalendarDate(
                              moveCalendarMonth(calendarDate, -1),
                            );
                            setActiveDay(null);
                          }}
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Next month"
                          onClick={() => {
                            setCalendarDate(moveCalendarMonth(calendarDate, 1));
                            setActiveDay(null);
                          }}
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="calendar-grid">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                        (d) => (
                          <span className="weekday" key={d}>
                            {d}
                          </span>
                        ),
                      )}
                      {Array.from(
                        {
                          length: new Date(
                            calendarDate.getFullYear(),
                            calendarDate.getMonth(),
                            1,
                          ).getDay(),
                        },
                        (_, i) => (
                          <div className="day blank" key={"blank" + i} />
                        ),
                      )}
                      {Array.from(
                        {
                          length: new Date(
                            calendarDate.getFullYear(),
                            calendarDate.getMonth() + 1,
                            0,
                          ).getDate(),
                        },
                        (_, i) => {
                          const day = i + 1;
                          const iso = calendarDateKey(calendarDate, day);
                          const trips = travelsInPeriod(travels, iso);
                          return (
                            <button
                              key={day}
                              className={
                                "day " + (activeDay === day ? "selected" : "")
                              }
                              onClick={() => setActiveDay(day)}
                              aria-label={`${iso}, ${trips.length} travel plans`}
                            >
                              <span>{day}</span>
                              {trips.slice(0, 2).map((t) => (
                                <small key={t.id}>
                                  {t.stops[0]?.destination}
                                </small>
                              ))}
                              {trips.length > 2 && (
                                <small>+{trips.length - 2} more</small>
                              )}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </section>
                  <section className="calendar-agenda">
                    <span className="eyebrow">
                      {activeDay ? "SELECTED DAY" : "ON THE CALENDAR"}
                    </span>
                    <h2>
                      {activeDay
                        ? date(calendarDateKey(calendarDate, activeDay), {
                            month: "long",
                            day: "numeric",
                          })
                        : "Journeys this month"}
                    </h2>
                    {calendarAgenda(travels, calendarDate, activeDay).map(
                      (t) => (
                        <button
                          className="agenda-item"
                          key={t.id}
                          onClick={() => setDetail(t)}
                        >
                          <img src={photo(t.image)} alt="" />
                          <span>
                            <strong>{t.title}</strong>
                            <small>
                              {date(t.start_date)} – {date(t.end_date)}
                            </small>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      ),
                    )}
                    <p className="agenda-note">
                      Select a day to see the journeys taking place.
                    </p>
                  </section>
                </div>
              </>
            )}
            {page === "settings" && (
              <>
                <PageHeading
                  section="Settings"
                  number="06"
                  meta={statusLabel(user.role)}
                  title="Your workspace, your way."
                  description="Account information and access preferences."
                />
                <section className="settings-profile">
                  <span className="avatar large">{initials(user.name)}</span>
                  <div>
                    <h2>{user.name}</h2>
                    <p>{user.email}</p>
                    <Badge value={user.role} />
                  </div>
                </section>
                <div className="settings-row">
                  <div>
                    <h3>Account details</h3>
                    <p>
                      {admin
                        ? "Update your name, email, or password."
                        : "Contact a workspace administrator to update your details."}
                    </p>
                  </div>
                  <button
                    className="button"
                    disabled={!admin}
                    onClick={() => {
                      const current = users.find((u) => u.id === user.id);
                      if (current) setEditor({ kind: "user", item: current });
                    }}
                  >
                    Edit account <Pencil size={16} />
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <h3>Session</h3>
                    <p>
                      Signing out ends this session immediately on all services.
                    </p>
                  </div>
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        await api("/auth/logout", "POST");
                        if (revisionAtRender === sessionRevision.current)
                          clearSession();
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    Sign out <LogOut size={16} />
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <h3>About this workspace</h3>
                    <p>
                      Sample itineraries for exploring Travel Plan. Payments use
                      test mode.
                    </p>
                  </div>
                  <span className="version-label">Travel Plan · 1.0</span>
                </div>
              </>
            )}
            {loading && (
              <div className="loading-inline" role="status">
                <LoaderCircle className="spin" size={18} /> Updating your
                workspace…
              </div>
            )}
            <footer className="footer">
              <span>Good plans take you places.</span>
              <span>
                Travel Plan <span className="footer-dot">•</span> Admin
                workspace
              </span>
            </footer>
          </div>
        </main>
      </div>
      {editor && (
        <EditorModal
          editor={editor}
          users={users}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            if (revisionAtRender !== sessionRevision.current) return;
            setEditor(null);
            await refresh();
            notify("Changes saved");
          }}
        />
      )}
      {detail && (
        <TravelDetail
          travel={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditor({ kind: "travel", item: detail });
            setDetail(null);
          }}
          canEdit={canTravel}
        />
      )}
      {remove && (
        <Modal title="Delete this record?" onClose={() => setRemove(null)}>
          <div className="modal-body">
            <p>
              <strong>{remove.name}</strong> will be permanently deleted.
            </p>
            <p className="muted">
              {remove.kind === "users"
                ? "Their sessions and travel memberships will also be removed."
                : remove.kind === "travels"
                  ? "The itinerary, destination stops, and memberships will also be removed."
                  : "Existing transaction history will be retained."}
            </p>
            <div className="form-actions">
              <button className="button" onClick={() => setRemove(null)}>
                Cancel
              </button>
              <button
                className="button destructive"
                disabled={deleting}
                onClick={deleted}
              >
                {deleting ? "Deleting…" : "Delete record"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="A little guidance for the journey"
          onClose={() => setHelp(false)}
        >
          <div className="modal-body help-content">
            <p>
              Travel Plan brings your journeys, people, and payment methods into
              one considered workspace.
            </p>
            <h3>Create your first itinerary</h3>
            <p>
              Open Travel plans and choose Create travel plan. Add the dates,
              capacity, and a destination stop for each part of the journey.
            </p>
            <h3>Bring your people along</h3>
            <p>
              Add people and choose their access. You can assign travellers from
              the itinerary editor.
            </p>
            <h3>Connect a payment method</h3>
            <p>
              Add Stripe or PayPal in Payments. Your deployment administrator
              can configure sandbox credentials; then use Test connection.
            </p>
            <button className="button primary" onClick={() => setHelp(false)}>
              Got it <Check size={17} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function PageHeading({
  section,
  number,
  meta,
  title,
  description,
  action,
}: {
  section: string;
  number: string;
  meta: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading subpage-heading">
      <div className="page-heading-copy">
        <div className="shared-page-kicker">
          <span className="page-kicker-number" aria-hidden="true">
            {number} /
          </span>
          <span>{section}</span>
          <span className="page-kicker-meta">{meta}</span>
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{action}</div>
      <svg
        className="page-heading-art"
        viewBox="0 0 240 160"
        fill="none"
        aria-hidden="true"
      >
        <path d="M16 80h208M120 12v136" stroke="currentColor" opacity=".3" />
        <circle cx="120" cy="80" r="57" stroke="currentColor" opacity=".45" />
        <ellipse
          cx="120"
          cy="80"
          rx="27"
          ry="57"
          stroke="currentColor"
          opacity=".3"
        />
        <ellipse
          cx="120"
          cy="80"
          rx="57"
          ry="19"
          stroke="currentColor"
          opacity=".3"
        />
        <g className="page-heading-orbit">
          <ellipse
            cx="120"
            cy="80"
            rx="98"
            ry="34"
            transform="rotate(-28 120 80)"
            stroke="currentColor"
            opacity=".75"
          />
          <circle cx="206.53" cy="33.99" r="4" fill="currentColor" />
        </g>
        <circle cx="120" cy="80" r="3" fill="currentColor" />
        <path
          d="M16 75v10M224 75v10M115 12h10M115 148h10"
          stroke="currentColor"
        />
      </svg>
    </div>
  );
}

function TravelDetail({
  travel: t,
  onClose,
  onEdit,
  canEdit,
}: {
  travel: Travel;
  onClose: () => void;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const [stop, setStop] = useState(0);
  const s = t.stops[stop];
  return (
    <Modal title="The journey, in detail" onClose={onClose} wide>
      <div className="detail-hero">
        <img src={photo(t.image)} alt={t.stops[0]?.destination} />
        <div>
          <Badge value={t.status} />
          <h2>{t.title}</h2>
        </div>
      </div>
      <div className="modal-body">
        <p className="detail-description">{t.description}</p>
        <div className="detail-stats">
          <span>
            <CalendarDays size={18} />
            <strong>
              {date(t.start_date)} –{" "}
              {date(t.end_date, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </strong>
          </span>
          <span>
            <Clock size={18} />
            <strong>{t.duration} days</strong>
          </span>
          <span>
            <Users size={18} />
            <strong>
              {t.participantIds.length} / {t.capacity} travellers
            </strong>
          </span>
        </div>
        <div className="route-heading">
          <h3>Follow the journey</h3>
          <span>
            {t.stops.length} {t.stops.length === 1 ? "stop" : "stops"}
          </span>
        </div>
        <div
          className="route-ribbon"
          role="tablist"
          aria-label="Destination stops"
        >
          {t.stops.map((s, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={stop === i}
              aria-controls="stop-panel"
              id={"stop-tab-" + i}
              className={stop === i ? "active" : ""}
              onClick={() => setStop(i)}
            >
              <span className="route-dot">{i + 1}</span>
              <strong>{s.destination}</strong>
              <small>{s.country}</small>
            </button>
          ))}
        </div>
        {s && (
          <section
            className="stop-panel"
            id="stop-panel"
            role="tabpanel"
            aria-labelledby={"stop-tab-" + stop}
            key={stop}
          >
            <div>
              <Activity size={20} />
              <span>Experiences</span>
              <p>{s.activities}</p>
            </div>
            <div>
              <Hotel size={20} />
              <span>Stay</span>
              <p>{s.accommodation}</p>
            </div>
            <div>
              <Plane size={20} />
              <span>Getting around</span>
              <p>{s.transportation}</p>
            </div>
          </section>
        )}
        <div className="detail-footer">
          <span>
            <strong>{money(t.price)}</strong> / person · USD
          </span>
          <button
            className="button primary"
            disabled={!canEdit}
            onClick={onEdit}
          >
            Edit travel plan <Pencil size={16} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
function EditorModal({
  editor,
  users,
  onClose,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const item = editor.item;
  const travel = item as Travel | undefined;
  const person = item as User | undefined;
  const gateway = item as Gateway | undefined;
  const emptyStop: Stop = {
    destination: "",
    country: "",
    activities: "",
    accommodation: "",
    transportation: "",
  };
  const [stops, setStops] = useState<Stop[]>(
    editor.kind === "travel" && travel?.stops
      ? travel.stops
      : [{ ...emptyStop }],
  );
  const [participants, setParticipants] = useState<string[]>(
    travel?.participantIds || [],
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const path =
        editor.kind === "travel"
          ? "/travels"
          : editor.kind === "user"
            ? "/users"
            : "/payments";
      const body =
        editor.kind === "travel"
          ? travelPayload(data, stops, participants, travel?.version ?? 0)
          : editor.kind === "user"
            ? userPayload(data, !item)
            : gatewayPayload(data);
      await api(
        path + (item ? "/" + item.id : ""),
        item ? "PUT" : "POST",
        body,
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        (item ? "Edit " : "Create ") +
        (editor.kind === "travel"
          ? "travel plan"
          : editor.kind === "user"
            ? "person"
            : "payment method")
      }
      onClose={onClose}
      wide={editor.kind === "travel"}
    >
      <form className="modal-body" onSubmit={submit}>
        {editor.kind === "travel" ? (
          <>
            <div className="form-section-title">
              <span>01</span>
              <h3>The essentials</h3>
            </div>
            <label>
              Travel plan name
              <input
                name="title"
                required
                maxLength={150}
                defaultValue={travel?.title}
                placeholder="A journey worth taking"
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                maxLength={1000}
                defaultValue={travel?.description}
                placeholder="What makes this journey special?"
                rows={2}
              />
            </label>
            <div className="form-grid">
              <label>
                Start date
                <input
                  name="startDate"
                  type="date"
                  required
                  defaultValue={travel?.start_date?.slice(0, 10)}
                />
              </label>
              <label>
                End date
                <input
                  name="endDate"
                  type="date"
                  required
                  defaultValue={travel?.end_date?.slice(0, 10)}
                />
              </label>
              <label>
                Price per person (USD)
                <input
                  name="price"
                  type="number"
                  min="0"
                  max="999999.99"
                  step="0.01"
                  required
                  defaultValue={travel?.price || 0}
                />
              </label>
              <label>
                Traveller capacity
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  max="10000"
                  required
                  defaultValue={travel?.capacity || 12}
                />
              </label>
              <label>
                Status
                <select name="status" defaultValue={travel?.status || "DRAFT"}>
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
              <label>
                Cover image
                <select name="image" defaultValue={travel?.image || "bali"}>
                  {[
                    "bali",
                    "japan",
                    "dolomites",
                    "morocco",
                    "greece",
                    "iceland",
                  ].map((i) => (
                    <option value={i} key={i}>
                      {i[0].toUpperCase() + i.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-section-title">
              <span>02</span>
              <h3>Along the way</h3>
            </div>
            <p className="form-hint">
              Add each destination in the order you’ll visit.
            </p>
            {stops.map((s, i) => (
              <fieldset className="stop-editor" key={i}>
                <legend>Stop {i + 1}</legend>
                <div className="form-grid">
                  {(
                    [
                      "destination",
                      "country",
                      "activities",
                      "accommodation",
                      "transportation",
                    ] as const
                  ).map((key) => (
                    <label
                      key={key}
                      className={key === "activities" ? "full" : ""}
                    >
                      {key[0].toUpperCase() + key.slice(1)}
                      <input
                        required
                        maxLength={
                          key === "activities"
                            ? 2000
                            : key === "destination" || key === "country"
                              ? 100
                              : 500
                        }
                        value={s[key]}
                        onChange={(e) =>
                          setStops(
                            stops.map((x, j) =>
                              j === i ? { ...x, [key]: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-link danger"
                  disabled={stops.length <= 1}
                  onClick={() => setStops(stops.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} /> Remove stop
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="button"
              disabled={stops.length >= 30}
              onClick={() => setStops([...stops, { ...emptyStop }])}
            >
              <Plus size={16} /> Add destination
            </button>
            <div className="form-section-title">
              <span>03</span>
              <h3>The people coming along</h3>
            </div>
            <div className="participant-list">
              {users.map((u) => (
                <label className="checkbox-label" key={u.id}>
                  <input
                    type="checkbox"
                    checked={participants.includes(u.id)}
                    onChange={(e) =>
                      setParticipants(
                        e.target.checked
                          ? [...participants, u.id]
                          : participants.filter((id) => id !== u.id),
                      )
                    }
                  />
                  <span>
                    {u.name}
                    <small>{u.email}</small>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : editor.kind === "user" ? (
          <>
            <label>
              Full name
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={person?.name}
              />
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                defaultValue={person?.email}
              />
            </label>
            <div className="form-grid">
              <label>
                Role
                <select name="role" defaultValue={person?.role || "VIEWER"}>
                  <option value="VIEWER">Viewer</option>
                  <option value="TRAVEL_MANAGER">Travel manager</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </label>
              <label>
                Status
                <select name="status" defaultValue={person?.status || "ACTIVE"}>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </label>
            </div>
            <label>
              {item ? "New password (optional)" : "Password"}
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required={!item}
              />
            </label>
            <p className="form-hint">
              Use at least 12 characters, up to 72 UTF-8 bytes.
              {item
                ? " Leave blank to keep the existing password. Changing it ends their active sessions."
                : ""}
            </p>
          </>
        ) : (
          <>
            <label>
              Display name
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={gateway?.name}
                placeholder="e.g. Stripe checkout"
              />
            </label>
            <div className="form-grid">
              <label>
                Provider
                <select
                  name="provider"
                  defaultValue={gateway?.provider || "STRIPE"}
                >
                  <option value="STRIPE">Stripe</option>
                  <option value="PAYPAL">PayPal</option>
                </select>
              </label>
              <label>
                Currency
                <select
                  name="currency"
                  defaultValue={gateway?.currency || "USD"}
                >
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </label>
            </div>
            <label className="checkbox-label">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={gateway?.enabled}
              />
              <span>Enable this payment method</span>
            </label>
            <div className="hint">
              <ShieldCheck size={18} />
              <p>
                Sandbox credentials are stored securely outside the dashboard.
                Ask your deployment administrator to connect this provider.
              </p>
            </div>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}{" "}
            {busy
              ? "Saving…"
              : item
                ? "Save changes"
                : "Create " +
                  (editor.kind === "travel"
                    ? "travel plan"
                    : editor.kind === "user"
                      ? "person"
                      : "payment method")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
