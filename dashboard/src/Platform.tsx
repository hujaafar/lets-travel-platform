import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  Compass,
  MapPin,
  CalendarDays,
  LogOut,
  Plus,
  X,
  Star,
  Ticket,
  ShieldCheck,
  Users,
  ChevronRight,
} from "lucide-react";
import { api, setCsrf } from "./api";
import "./travelMotion.css";
import "./platform.css";
import { useTravelMotion } from "./useTravelMotion";
import JourneyScenes from "./JourneyScenes";
import AlpineAscent from "./AlpineAscent";

type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  csrf: string;
};
type Stop = {
  destination: string;
  country: string;
  activities: string;
  accommodation: string;
  transportation: string;
};
type Feedback = {
  rating: number;
  comment: string;
  name?: string;
  created_at: string;
};
type Trip = {
  id: string;
  title: string;
  image: string;
  description: string;
  price: number;
  currency?: string;
  capacity: number;
  start_date: string;
  end_date: string;
  status: string;
  manager_id?: string;
  manager_name?: string;
  stops: Stop[];
  version: number;
  feedback?: Feedback[];
  reserved?: number;
};
type Booking = {
  id: string;
  travel_id: string;
  title?: string;
  image?: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  checkout_url?: string;
  start_date?: string;
  end_date?: string;
  manager_id?: string;
};
type Report = {
  id: string;
  reason: string;
  status: string;
  resolution?: string;
  created_at: string;
};
type Stats = {
  past_trips: number;
  cancellations: number;
  reports: number;
  payment_methods: { provider: string; uses: number }[];
};
type Analytics = {
  monthly: {
    month: string;
    currency: string;
    income: number;
    travelers: number;
  }[];
  trips: {
    id: string;
    title: string;
    status: string;
    travelers: number;
    income: number;
    rating: number;
    currency: string;
  }[];
  managers: {
    id: string;
    name: string;
    trips: number;
    travelers: number;
    rating: number;
    score: number;
    income_usd: number;
  }[];
};
const money = (value: number | string, currency = "USD") =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.trim(),
    maximumFractionDigits: 0,
  }).format(Number(value));
const date = (value: string) =>
  new Date(value.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export function checkoutUrl(value?: string) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      [
        "checkout.stripe.com",
        "www.sandbox.paypal.com",
        "sandbox.paypal.com",
      ].includes(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
const freshStop = (): Stop => ({
  destination: "",
  country: "",
  activities: "",
  accommodation: "",
  transportation: "",
});

const ErrorContext = createContext("");

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const error = useContext(ErrorContext);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="lt-modal"
      onCancel={close}
      aria-label={title}
    >
      <header>
        <span>{title}</span>
        <button aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {error && (
        <div role="alert" className="lt-error">
          {error}
        </div>
      )}
      {children}
    </dialog>
  );
}
function Card({
  trip,
  onOpen,
  index = 0,
}: {
  trip: Trip;
  onOpen: (t: Trip) => void;
  index?: number;
}) {
  return (
    <button
      className="lt-card"
      onClick={() => onOpen(trip)}
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="lt-card-image">
        <img src={"/images/" + trip.image + ".jpg"} alt="" loading="lazy" />
        <span className="lt-pill">
          {trip.stops?.[0]?.country || "Curated journey"}
        </span>
        <span className="lt-card-arrow">
          <ArrowUpRight size={23} />
        </span>
      </div>
      <div className="lt-card-meta">
        <span>{date(trip.start_date)}</span>
        <span>
          {Math.round(
            (Date.parse(trip.end_date) - Date.parse(trip.start_date)) /
              86400000,
          ) + 1}{" "}
          days
        </span>
      </div>
      <h3>{trip.title}</h3>
      <div className="lt-card-bottom">
        <span>
          {trip.stops?.[0]?.destination || "An invitation to explore"}
        </span>
        <strong>
          {money(trip.price, trip.currency)} <small>/ person</small>
        </strong>
      </div>
    </button>
  );
}

export default function Platform() {
  const [user, setUser] = useState<Person | null>(null),
    [ready, setReady] = useState(false),
    [signup, setSignup] = useState(false);
  const [page, setPage] = useState("discover"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [trips, setTrips] = useState<Trip[]>([]),
    [owned, setOwned] = useState<Trip[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<Stats | null>(null),
    [analytics, setAnalytics] = useState<Analytics | null>(null),
    [recommend, setRecommend] = useState<{
      basis: string;
      trips: Trip[];
    } | null>(null);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [suggestions, setSuggestions] = useState<string[]>([]),
    [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Trip | null>(null),
    [editing, setEditing] = useState<Trip | null | undefined>(),
    [feedback, setFeedback] = useState<Booking | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    travelId?: string;
    targetUserId?: string;
    name: string;
  } | null>(null);
  const [manager, setManager] = useState<{
    id: string;
    name: string;
    trips: number;
    report_count: number;
    ratings: (Feedback & { title: string })[];
  } | null>(null);
  const [subscribers, setSubscribers] = useState<{
    trip: Trip;
    people: {
      id: string;
      user_id: string;
      name: string;
      status: string;
      past_trips: number;
    }[];
  } | null>(null);
  const [group, setGroup] = useState<{
    trip: Booking;
    people: { id: string; name: string }[];
  } | null>(null);
  const [methods, setMethods] = useState<
    { provider: string; currency: string }[]
  >([]);
  const canManage = user?.role === "ADMIN" || user?.role === "TRAVEL_MANAGER";
  const reload = () => setRevision((x) => x + 1);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    api<Person>("/auth/me")
      .then((u) => {
        setUser(u);
        setCsrf(u.csrf);
      })
      .catch(() => {})
      .finally(() => setReady(true));
    const expired = () => {
      setUser(null);
      setCsrf("");
      setError("Your session expired. Sign in again.");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    api<Trip[]>("/explore?q=" + encodeURIComponent(search))
      .then((r) => {
        if (alive) setTrips(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user, search, revision]);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const timer = setTimeout(() => {
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }
      api<string[]>("/explore/suggest?q=" + encodeURIComponent(query))
        .then((r) => {
          if (alive) setSuggestions(r);
        })
        .catch(() => {
          if (alive) setSuggestions([]);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, user]);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([
      api<Booking[]>("/bookings"),
      api<Stats>("/profile"),
      api<Report[]>("/reports"),
      api<typeof methods>("/checkout/methods"),
    ])
      .then(([b, s, r, m]) => {
        if (alive) {
          setBookings(b);
          setStats(s);
          setReports(r);
          setMethods(m);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    api<typeof recommend>("/explore/recommendations")
      .then((r) => {
        if (alive) setRecommend(r);
      })
      .catch(() => {
        if (alive) setRecommend(null);
      });
    if (canManage)
      Promise.all([
        api<Trip[]>("/manage/travels"),
        api<Analytics>("/manage/analytics"),
      ])
        .then(([t, a]) => {
          if (alive) {
            setOwned(t);
            setAnalytics(a);
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [user, revision, canManage]);
  useEffect(() => {
    if (!user) return;
    const id = new URLSearchParams(window.location.search).get("checkout");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      window.history.replaceState({}, "", window.location.pathname);
      setPage("journeys");
      void act(async () => {
        const b = await api<Booking>("/bookings/" + id + "/verify", "POST");
        setNotice(
          b.status === "CONFIRMED"
            ? "Your payment is verified. You’re going!"
            : "Payment status: " +
                b.status.replaceAll("_", " ") +
                ". Use Check payment to refresh.",
        );
        reload();
      });
    }
  }, [user]);
  const motionRoot = useRef<HTMLDivElement>(null);
  useTravelMotion(
    motionRoot,
    `${Boolean(user)}-${page}-${trips.map((trip) => trip.id).join(",")}-${owned.length}-${bookings.length}-${revision}`,
  );
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act(async () => {
      if (signup)
        await api("/auth/register", "POST", {
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
        });
      const u = await api<Person>("/auth/login", "POST", {
        email: f.get("email"),
        password: f.get("password"),
      });
      setCsrf(u.csrf);
      setUser(u);
    });
  }
  function open(t: Trip) {
    void act(async () => {
      setSelected(await api<Trip>("/explore/" + t.id));
    });
  }
  function showManager(id: string) {
    void act(async () => {
      setManager(await api("/managers/" + id));
    });
  }
  async function book(provider: string) {
    if (!selected) return;
    await act(async () => {
      const b = await api<Booking>("/bookings", "POST", {
        travelId: selected.id,
        provider,
      });
      const url = checkoutUrl(b.checkout_url);
      if (b.status === "PENDING" && url) window.location.assign(url);
      else {
        setSelected(null);
        setPage("journeys");
        setNotice(
          b.status === "CONFIRMED"
            ? "You already have a confirmed booking."
            : "Your seat is reserved. Checkout is being prepared; check payment shortly.",
        );
        reload();
      }
    });
  }
  async function cancel(id: string) {
    await act(async () => {
      await api("/bookings/" + id + "/cancel", "POST");
      setNotice(
        "Cancellation requested. Any completed payment will return to its original payment method.",
      );
      reload();
      if (subscribers)
        setSubscribers({
          ...subscribers,
          people: await api(
            "/manage/travels/" + subscribers.trip.id + "/subscribers",
          ),
        });
    });
  }
  if (!ready)
    return (
      <div className="lt-app lt-loading">Preparing your next chapter…</div>
    );
  if (!user)
    return (
      <div className="lt-app lt-auth">
        <div className="lt-auth-image">
          <a className="lt-brand" href="/">
            <span className="lt-mark">lt.</span>let’s travel
            <span className="lt-brand-dot">®</span>
          </a>
          <div>
            <span className="lt-eyebrow">A LITTLE FURTHER FROM ORDINARY</span>
            <h1>
              Go somewhere.
              <br />
              <em>Feel something.</em>
            </h1>
            <p>
              Small groups. Local perspectives.
              <br />
              Stories you’ll carry home.
            </p>
          </div>
          <span className="lt-coordinate">
            THE GREAT OUTSIDE / LET’S TRAVEL
          </span>
        </div>
        <main className="lt-auth-form">
          <span className="lt-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h2>
            {signup ? "Make room for adventure." : "Good to see you again."}
          </h2>
          <p>
            {signup
              ? "Create your traveler account and find your people."
              : "Sign in to your travel workspace."}
          </p>
          {error && (
            <div role="alert" className="lt-error">
              {error}
            </div>
          )}
          <form onSubmit={login}>
            {signup && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                required
                minLength={signup ? 12 : undefined}
                maxLength={72}
              />
              {signup && (
                <small>At least 12 characters. Use a unique password.</small>
              )}
            </label>
            <button type="submit" className="lt-button" disabled={busy}>
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <button
            className="lt-text-button"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
          <div className="lt-auth-note">
            <ShieldCheck size={18} />
            <span>
              Secure sign-in · Hosted sandbox payments
              <br />
              No real money is charged in this development environment.
            </span>
          </div>
        </main>
      </div>
    );
  return (
    <ErrorContext.Provider value={error}>
      <div className="lt-app" ref={motionRoot}>
        <div className="lt-scroll-progress" aria-hidden="true" />
        <a className="lt-skip" href="#content">
          Skip to content
        </a>
        <header className="lt-header">
          <a href="/" className="lt-brand">
            <span className="lt-mark">lt.</span>let’s travel
            <span className="lt-brand-dot">®</span>
          </a>
          <nav aria-label="Main navigation">
            {[
              ["discover", "Discover"],
              ["journeys", "My journeys"],
              ...(canManage ? [["studio", "Manager studio"]] : []),
              ["profile", "My space"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setPage(id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-current={page === id ? "page" : undefined}
              >
                {label}
              </button>
            ))}
            {user.role === "ADMIN" && (
              <a href="/admin">
                Administration
                <ArrowUpRight size={14} />
              </a>
            )}
          </nav>
          <div className="lt-header-user">
            <span className="lt-avatar">{user.name.slice(0, 1)}</span>
            <span>
              {user.name.split(" ")[0]}
              <small>{user.role.replace("TRAVEL_", "").toLowerCase()}</small>
            </span>
            <button
              aria-label="Sign out"
              onClick={() =>
                void act(async () => {
                  await api("/auth/logout", "POST");
                  setCsrf("");
                  setUser(null);
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {error && (
          <div className="lt-banner lt-error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={17} />
            </button>
          </div>
        )}
        {notice && (
          <div className="lt-banner" role="status">
            {notice}
            <button
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
            >
              <X size={17} />
            </button>
          </div>
        )}
        <main id="content" key={page}>
          {page === "discover" && (
            <>
              <AlpineAscent />
              <div className="lt-marquee" aria-hidden="true">
                <div>
                  {Array.from({ length: 4 }, (_, i) => (
                    <span key={i}>
                      New perspectives <b>✳</b> Good company <b>✳</b>{" "}
                      Unforgettable places <b>✳</b>{" "}
                    </span>
                  ))}
                </div>
              </div>
              <section id="collection" className="lt-section lt-reveal">
                <div className="lt-section-heading">
                  <div>
                    <span className="lt-eyebrow">
                      THE COLLECTION / {String(trips.length).padStart(2, "0")}
                    </span>
                    <h2>
                      Where will you
                      <br />
                      <em>find yourself?</em>
                    </h2>
                  </div>
                  <div className="lt-search-wrap">
                    <form
                      className="lt-search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setSearch(query);
                        setSuggestions([]);
                      }}
                    >
                      <Search size={18} />
                      <input
                        aria-label="Search journeys"
                        placeholder="A place, a feeling, an adventure…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        list="journey-suggestions"
                      />
                      <datalist id="journey-suggestions">
                        {suggestions.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                      <button type="submit" aria-label="Search">
                        <ArrowRight size={20} />
                      </button>
                    </form>
                    <p>Search destinations, activities and places to stay.</p>
                  </div>
                </div>
                <div className="lt-filter-row">
                  <button
                    className={!search ? "active" : ""}
                    onClick={() => {
                      setSearch("");
                      setQuery("");
                    }}
                  >
                    All journeys
                  </button>
                  {["Hiking", "Culture", "Beach", "Japan"].map((q) => (
                    <button
                      className={search === q ? "active" : ""}
                      key={q}
                      onClick={() => {
                        setSearch(q);
                        setQuery(q);
                      }}
                    >
                      {q}
                    </button>
                  ))}
                  <span>
                    {loading
                      ? "Finding your way…"
                      : `${trips.length} journeys to discover`}
                  </span>
                </div>
                <div className="lt-grid">
                  {trips.map((t, i) => (
                    <Card key={t.id} trip={t} onOpen={open} index={i} />
                  ))}
                </div>
                {!loading && trips.length === 0 && (
                  <div className="lt-empty">
                    <Compass />
                    <h3>A different direction?</h3>
                    <p>
                      No journeys match this search. Try a country or an
                      activity.
                    </p>
                  </div>
                )}
              </section>
              <JourneyScenes trips={trips} onOpen={open} />
              <section className="lt-manifesto lt-reveal">
                <span className="lt-eyebrow">THE WAY WE TRAVEL</span>
                <h2>
                  Not just a pin
                  <br />
                  on a map.
                  <br />
                  <em>A story worth telling.</em>
                </h2>
                <div>
                  <p>
                    Travel should feel personal. Our managers bring their own
                    perspective to every itinerary, from the first morning
                    coffee to the last winding trail.
                  </p>
                  <a href="#personal" className="lt-text-button">
                    A journey for you <ArrowDown />
                  </a>
                </div>
                <span className="lt-manifesto-number" aria-hidden="true">
                  ↗
                </span>
              </section>
              <section id="personal" className="lt-section lt-reveal">
                <div className="lt-section-heading">
                  <div>
                    <span className="lt-eyebrow">FOLLOW YOUR CURIOSITY</span>
                    <h2>
                      Your kind of <em>elsewhere.</em>
                    </h2>
                  </div>
                  <p className="lt-muted">
                    {recommend?.basis ||
                      "Keep exploring. New recommendations will appear as you travel and leave feedback."}
                  </p>
                </div>
                <div className="lt-grid">
                  {(recommend?.trips || trips.slice(0, 3))
                    .slice(0, 3)
                    .map((t, i) => (
                      <Card key={t.id} trip={t} onOpen={open} index={i} />
                    ))}
                </div>
              </section>
            </>
          )}
          {page === "journeys" && (
            <section className="lt-section">
              <PageTitle
                kicker="YOUR TRAVEL JOURNAL"
                title="Plans worth looking"
                italic="forward to."
              />
              <p className="lt-muted">
                Your seat is confirmed only after the payment provider verifies
                payment. Booking and cancellation close three days before
                departure, at 00:00 UTC.
              </p>
              <div className="lt-booking-list">
                {bookings.map((b) => (
                  <article key={b.id} className="lt-booking">
                    <img src={"/images/" + b.image + ".jpg"} alt="" />
                    <div>
                      <span className="lt-eyebrow">
                        {b.start_date && date(b.start_date)} / {b.provider}
                      </span>
                      <h3>{b.title}</h3>
                      <span className={"lt-status " + b.status.toLowerCase()}>
                        {b.status.replaceAll("_", " ")}
                      </span>
                      <p>
                        {money(b.amount, b.currency)} · Booking{" "}
                        {b.id.slice(0, 8)}
                      </p>
                    </div>
                    <div className="lt-booking-actions">
                      {b.status === "CONFIRMED" && (
                        <button
                          className="lt-text-button"
                          onClick={() =>
                            void act(async () =>
                              setGroup({
                                trip: b,
                                people: await api(
                                  "/explore/" + b.travel_id + "/community",
                                ),
                              }),
                            )
                          }
                        >
                          Meet your group
                        </button>
                      )}

                      {b.status === "PENDING" && (
                        <>
                          <button
                            className="lt-button"
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                const r = await api<Booking>(
                                  "/bookings/" + b.id + "/verify",
                                  "POST",
                                );
                                setNotice(
                                  "Payment status: " +
                                    r.status.replaceAll("_", " "),
                                );
                                reload();
                              })
                            }
                          >
                            Check payment
                          </button>
                          {checkoutUrl(b.checkout_url) && (
                            <a
                              className="lt-text-button"
                              href={checkoutUrl(b.checkout_url)!}
                            >
                              Continue checkout
                              <ArrowUpRight size={16} />
                            </a>
                          )}
                        </>
                      )}
                      {["PENDING", "CONFIRMED"].includes(b.status) &&
                        b.start_date &&
                        Date.now() <
                          Date.parse(b.start_date.slice(0, 10) + "T00:00:00Z") -
                            3 * 86400000 && (
                          <button
                            className="lt-text-button"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Cancel this booking? A completed payment will be refunded.",
                                )
                              )
                                void cancel(b.id);
                            }}
                          >
                            Cancel booking
                          </button>
                        )}
                      {b.status === "CONFIRMED" &&
                        b.end_date &&
                        Date.now() >
                          Date.parse(b.end_date.slice(0, 10) + "T00:00:00Z") +
                            86400000 && (
                          <button
                            className="lt-button"
                            onClick={() => setFeedback(b)}
                          >
                            Leave feedback
                            <Star size={16} />
                          </button>
                        )}
                      <button
                        className="lt-text-button"
                        onClick={() =>
                          setReportTarget({
                            travelId: b.travel_id,
                            name: b.title || "this trip",
                          })
                        }
                      >
                        Report a concern
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {bookings.length === 0 && (
                <Empty
                  icon={<Ticket />}
                  text="Your next story is waiting."
                  detail="Find a journey you love and reserve your place."
                  action={() => setPage("discover")}
                  label="Explore journeys"
                />
              )}
            </section>
          )}
          {page === "studio" && canManage && (
            <section className="lt-section">
              <div className="lt-section-heading">
                <PageTitle
                  kicker="MANAGER STUDIO"
                  title="Make remarkable"
                  italic="things happen."
                />
                <button className="lt-button" onClick={() => setEditing(null)}>
                  <Plus size={18} />
                  Create a journey
                </button>
              </div>
              <div className="lt-stats">
                <Stat
                  label="Organized journeys"
                  value={analytics?.trips.length || 0}
                />
                <Stat
                  label="Confirmed travelers"
                  value={
                    analytics?.trips.reduce(
                      (n, t) => n + Number(t.travelers),
                      0,
                    ) || 0
                  }
                />
                <Stat
                  label="Last 6 months · USD"
                  value={money(
                    analytics?.monthly
                      .filter((m) => m.currency.trim() === "USD")
                      .reduce((n, m) => n + Number(m.income), 0) || 0,
                  )}
                />
              </div>
              <h3 className="lt-table-title">
                Your journeys <span>{owned.length}</span>
              </h3>
              <div className="lt-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Journey</th>
                      <th>Departure</th>
                      <th>Status</th>
                      <th>Travelers</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owned.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className="lt-table-trip">
                            <img src={"/images/" + t.image + ".jpg"} alt="" />
                            <span>
                              {t.title}
                              <small>
                                {money(t.price, t.currency)} / person
                              </small>
                            </span>
                          </div>
                        </td>
                        <td>{date(t.start_date)}</td>
                        <td>
                          <span className="lt-status">{t.status}</span>
                        </td>
                        <td>
                          {analytics?.trips.find((a) => a.id === t.id)
                            ?.travelers || 0}{" "}
                          / {t.capacity}
                        </td>
                        <td>
                          <div className="lt-actions">
                            <button onClick={() => setEditing(t)}>Edit</button>
                            <button
                              onClick={() =>
                                void act(async () =>
                                  setSubscribers({
                                    trip: t,
                                    people: await api(
                                      "/manage/travels/" +
                                        t.id +
                                        "/subscribers",
                                    ),
                                  }),
                                )
                              }
                            >
                              Travelers
                            </button>
                            <button onClick={() => open(t)}>Feedback</button>
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Delete this journey? Trips with payment history must be archived instead.",
                                  )
                                )
                                  void act(async () => {
                                    await api(
                                      "/manage/travels/" + t.id,
                                      "DELETE",
                                    );
                                    reload();
                                  });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="lt-analytics-grid">
                <div>
                  <h3>Monthly income</h3>
                  <p className="lt-muted">
                    Confirmed bookings, grouped by payment currency. Cancelled
                    and refunded bookings are excluded.
                  </p>
                  {analytics?.monthly.map((m) => (
                    <div className="lt-rank" key={m.month + m.currency}>
                      <span>{m.month}</span>
                      <strong>{money(m.income, m.currency)}</strong>
                    </div>
                  ))}
                  {!analytics?.monthly.length && (
                    <p className="lt-muted">
                      Income appears here after verified payments.
                    </p>
                  )}
                </div>
                <div>
                  <h3>Journey performance</h3>
                  {analytics?.trips.map((t) => (
                    <div className="lt-rank" key={t.id}>
                      <span>{t.title}</span>
                      <strong>
                        {t.rating
                          ? Number(t.rating).toFixed(1) + " ★"
                          : "No ratings yet"}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
              {user.role === "ADMIN" && (
                <>
                  <h3>Manager ranking</h3>
                  <p className="lt-muted">
                    Score = average rating × 20 + confirmed bookings (up to 100)
                    + verified USD income ÷ 100 (up to 100). Other currencies
                    stay separate in income reports.
                  </p>
                  {analytics?.managers.map((m, i) => (
                    <button
                      className="lt-rank lt-rank-button"
                      key={m.id}
                      onClick={() => showManager(m.id)}
                    >
                      <span>
                        {String(i + 1).padStart(2, "0")} &nbsp; {m.name}
                      </span>
                      <span>
                        {m.trips} journeys · {m.travelers} travelers ·{" "}
                        {money(m.income_usd)} USD income · score {m.score}
                      </span>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                </>
              )}
            </section>
          )}
          {page === "profile" && (
            <section className="lt-section">
              <PageTitle
                kicker="YOUR LITTLE CORNER OF THE WORLD"
                title={user.name.split(" ")[0] + ", keep"}
                italic="collecting stories."
              />
              <div className="lt-stats">
                <Stat label="Past journeys" value={stats?.past_trips || 0} />
                <Stat label="Cancellations" value={stats?.cancellations || 0} />
                <Stat label="Reports submitted" value={stats?.reports || 0} />
              </div>
              <div className="lt-analytics-grid">
                <div>
                  <h3>Payment preferences</h3>
                  <p className="lt-muted">
                    Based on your confirmed bookings. We never store card
                    details.
                  </p>
                  {stats?.payment_methods.map((m) => (
                    <div className="lt-rank" key={m.provider}>
                      <span>{m.provider}</span>
                      <strong>{m.uses} bookings</strong>
                    </div>
                  ))}
                  {!stats?.payment_methods.length && (
                    <p>No payment history yet.</p>
                  )}
                  <h3 className="lt-table-title">Your account</h3>
                  <p>
                    {user.name}
                    <br />
                    {user.email}
                  </p>
                  <p className="lt-muted">
                    Account role: {user.role.replaceAll("_", " ").toLowerCase()}
                    . For access or deletion requests, contact your
                    administrator; payment records may need to be retained.
                  </p>
                </div>
                <div>
                  <h3>
                    {user.role === "ADMIN"
                      ? "Reports to review"
                      : "Your reports"}
                  </h3>
                  {reports.map((r) => (
                    <article className="lt-report" key={r.id}>
                      <span className="lt-status">{r.status}</span>
                      <p>{r.reason}</p>
                      <small>{date(r.created_at)}</small>
                      {r.resolution && <p>Resolution: {r.resolution}</p>}
                      {user.role === "ADMIN" && r.status === "OPEN" && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void act(async () => {
                              await api("/reports/" + r.id, "PUT", {
                                status: f.get("status"),
                                resolution: f.get("resolution"),
                              });
                              reload();
                            });
                          }}
                        >
                          <label>
                            Decision
                            <select name="status">
                              <option value="REVIEWED">Reviewed</option>
                              <option value="DISMISSED">Dismissed</option>
                            </select>
                          </label>
                          <label>
                            Resolution
                            <textarea
                              name="resolution"
                              required
                              maxLength={2000}
                            />
                          </label>
                          <button
                            type="submit"
                            className="lt-button"
                            disabled={busy}
                          >
                            Save decision
                          </button>
                        </form>
                      )}
                    </article>
                  ))}
                  {reports.length === 0 && (
                    <p className="lt-muted">No reports to show.</p>
                  )}
                </div>
              </div>
            </section>
          )}
        </main>
        <footer className="lt-footer">
          <div>
            <a href="/" className="lt-brand">
              <span className="lt-mark">lt.</span>let’s travel®
            </a>
            <p>
              The best things happen
              <br />
              <em>somewhere else.</em>
            </p>
          </div>
          <div>
            <span className="lt-eyebrow">TAKE THE SCENIC ROUTE</span>
            <button onClick={() => setPage("discover")}>
              Discover journeys <ArrowUpRight size={16} />
            </button>
            <button onClick={() => setPage("journeys")}>
              My travel journal <ArrowUpRight size={16} />
            </button>
            <button onClick={() => setPage("profile")}>
              My account <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="lt-footer-bottom">
            <span>© {new Date().getFullYear()} Let’s Travel</span>
            <span>Thoughtfully planned. Personally experienced.</span>
            <span>Sandbox payments · No real charges</span>
          </div>
        </footer>
        {selected && (
          <Modal title="The journey, in detail" close={() => setSelected(null)}>
            <img
              className="lt-detail-image"
              src={"/images/" + selected.image + ".jpg"}
              alt=""
            />
            <div className="lt-modal-content">
              <span className="lt-eyebrow">
                {date(selected.start_date)} to {date(selected.end_date)}
              </span>
              <h2>{selected.title}</h2>
              <p>{selected.description}</p>
              {selected.manager_id && (
                <button
                  className="lt-text-button"
                  onClick={() => showManager(selected.manager_id!)}
                >
                  Meet {selected.manager_name || "your manager"}
                  <ArrowUpRight size={16} />
                </button>
              )}
              <div className="lt-itinerary">
                {selected.stops.map((s, i) => (
                  <article key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>
                        {s.destination}, {s.country}
                      </h3>
                      <p>{s.activities}</p>
                      <p className="lt-muted">
                        Stay: {s.accommodation}
                        <br />
                        Travel: {s.transportation}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
              <h3>Traveler voices</h3>
              {selected.feedback?.map((f, i) => (
                <blockquote key={i}>
                  <span>{"★".repeat(f.rating)}</span>
                  <p>{f.comment}</p>
                  <cite>
                    {f.name} · {date(f.created_at)}
                  </cite>
                </blockquote>
              ))}
              {!selected.feedback?.length && (
                <p className="lt-muted">The first stories are still to come.</p>
              )}
              <div className="lt-checkout">
                <div>
                  <strong>{money(selected.price, selected.currency)}</strong>
                  <span>per person · secure sandbox checkout</span>
                </div>
                <p>
                  Reserve your place. Checkout opens on your chosen provider.
                  Cancellations close three days before departure at 00:00 UTC.
                  Checkout opens until one hour before that deadline.
                </p>
                <div className="lt-actions">
                  {methods
                    .filter(
                      (m) =>
                        m.currency.trim() ===
                        (selected.currency || "USD").trim(),
                    )
                    .map((m) => (
                      <button
                        className="lt-button"
                        disabled={busy}
                        key={m.provider}
                        onClick={() => void book(m.provider)}
                      >
                        Pay with {m.provider === "STRIPE" ? "Stripe" : "PayPal"}
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                </div>
                {!methods.length && (
                  <p role="status">
                    Your administrator needs to enable a sandbox payment gateway
                    before booking.
                  </p>
                )}
              </div>
              <button
                className="lt-text-button"
                onClick={() =>
                  setReportTarget({
                    travelId: selected.id,
                    name: selected.title,
                  })
                }
              >
                Report a concern about this journey
              </button>
            </div>
          </Modal>
        )}
        {editing !== undefined && (
          <Editor
            trip={editing}
            busy={busy}
            close={() => setEditing(undefined)}
            save={async (data) => {
              await act(async () => {
                await api(
                  "/manage/travels" + (editing ? "/" + editing.id : ""),
                  editing ? "PUT" : "POST",
                  data,
                );
                setEditing(undefined);
                setNotice(
                  "Your journey has been saved. Search updates in a few seconds.",
                );
                reload();
              });
            }}
          />
        )}
        {feedback && (
          <Modal
            title="Your experience matters"
            close={() => setFeedback(null)}
          >
            <form
              className="lt-modal-content"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  await api("/feedback", "POST", {
                    travelId: feedback.travel_id,
                    rating: Number(f.get("rating")),
                    comment: f.get("comment"),
                  });
                  setFeedback(null);
                  setNotice(
                    "Thank you. Your feedback is now part of this journey’s story.",
                  );
                  reload();
                });
              }}
            >
              <h2>{feedback.title}</h2>
              <label>
                Your rating
                <select name="rating">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option value={n} key={n}>
                      {n} stars
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tell us about the experience
                <textarea required maxLength={2000} name="comment" />
              </label>
              <button type="submit" className="lt-button" disabled={busy}>
                Publish feedback
              </button>
            </form>
          </Modal>
        )}
        {reportTarget && (
          <Modal title="Report a concern" close={() => setReportTarget(null)}>
            <form
              className="lt-modal-content"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  await api("/reports", "POST", {
                    travelId: reportTarget.travelId,
                    targetUserId: reportTarget.targetUserId,
                    reason: f.get("reason"),
                  });
                  setReportTarget(null);
                  setNotice("Report submitted for administrator review.");
                  reload();
                });
              }}
            >
              <h2>{reportTarget.name}</h2>
              <p>
                Your report is visible to administrators. Please describe what
                happened without including payment details or passwords.
              </p>
              <label>
                What happened?
                <textarea
                  required
                  name="reason"
                  minLength={5}
                  maxLength={2000}
                />
              </label>
              <button type="submit" className="lt-button" disabled={busy}>
                Submit report
              </button>
            </form>
          </Modal>
        )}
        {manager && (
          <Modal
            title="Meet your travel manager"
            close={() => setManager(null)}
          >
            <div className="lt-modal-content">
              <span className="lt-avatar lt-avatar-large">
                {manager.name[0]}
              </span>
              <h2>{manager.name}</h2>
              <div className="lt-stats">
                <Stat label="Published journeys" value={manager.trips} />
                <Stat label="Reviewed reports" value={manager.report_count} />
              </div>
              <p className="lt-muted">
                Report counts show reports reviewed by an administrator; they do
                not establish misconduct.
              </p>
              {manager.ratings.map((r, i) => (
                <blockquote key={i}>
                  <span>
                    {"★".repeat(r.rating)} · {r.title}
                  </span>
                  <p>{r.comment}</p>
                </blockquote>
              ))}
              <button
                className="lt-text-button"
                onClick={() =>
                  setReportTarget({
                    targetUserId: manager.id,
                    name: manager.name,
                  })
                }
              >
                Report this manager
              </button>
            </div>
          </Modal>
        )}
        {group && (
          <Modal
            title={"Your group · " + group.trip.title}
            close={() => setGroup(null)}
          >
            <div className="lt-modal-content">
              <p>
                Only confirmed travelers can see their group. Contact details
                stay private.
              </p>
              {group.people.map((p) => (
                <article className="lt-subscriber" key={p.id}>
                  <span className="lt-avatar">{p.name[0]}</span>
                  <h3>{p.name}</h3>
                  {p.id !== user.id && (
                    <button
                      className="lt-text-button"
                      onClick={() =>
                        setReportTarget({
                          targetUserId: p.id,
                          travelId: group.trip.travel_id,
                          name: p.name,
                        })
                      }
                    >
                      Report a concern
                    </button>
                  )}
                </article>
              ))}
            </div>
          </Modal>
        )}
        {subscribers && (
          <Modal
            title={"Travelers · " + subscribers.trip.title}
            close={() => setSubscribers(null)}
          >
            <div className="lt-modal-content">
              {subscribers.people.map((p) => (
                <article className="lt-subscriber" key={p.id}>
                  <span className="lt-avatar">{p.name?.[0] || "T"}</span>
                  <div>
                    <h3>{p.name}</h3>
                    <p>
                      {p.past_trips} past journeys ·{" "}
                      {p.status.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div>
                    {["PENDING", "CONFIRMED"].includes(p.status) && (
                      <button
                        className="lt-text-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Unsubscribe this traveler and refund any completed payment?",
                            )
                          )
                            void cancel(p.id);
                        }}
                      >
                        Unsubscribe
                      </button>
                    )}
                    <button
                      className="lt-text-button"
                      onClick={() =>
                        setReportTarget({
                          targetUserId: p.user_id,
                          travelId: subscribers.trip.id,
                          name: p.name,
                        })
                      }
                    >
                      Report traveler
                    </button>
                  </div>
                </article>
              ))}
              {!subscribers.people.length && (
                <p>No travelers have booked this journey yet.</p>
              )}
            </div>
          </Modal>
        )}
      </div>
    </ErrorContext.Provider>
  );
}
function ArrowDown() {
  return <span aria-hidden="true">↓</span>;
}
function PageTitle({
  kicker,
  title,
  italic,
}: {
  kicker: string;
  title: string;
  italic: string;
}) {
  return (
    <div className="lt-page-title">
      <span className="lt-eyebrow">{kicker}</span>
      <h1>
        {title}
        <br />
        <em>{italic}</em>
      </h1>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="lt-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Empty({
  icon,
  text,
  detail,
  action,
  label,
}: {
  icon: ReactNode;
  text: string;
  detail: string;
  action: () => void;
  label: string;
}) {
  return (
    <div className="lt-empty">
      {icon}
      <h3>{text}</h3>
      <p>{detail}</p>
      <button className="lt-button" onClick={action}>
        {label}
        <ArrowRight size={17} />
      </button>
    </div>
  );
}
function Editor({
  trip,
  busy,
  close,
  save,
}: {
  trip: Trip | null;
  busy: boolean;
  close: () => void;
  save: (data: unknown) => Promise<void>;
}) {
  const [stops, setStops] = useState<Stop[]>(trip?.stops || [freshStop()]);
  const field = (i: number, key: keyof Stop, value: string) =>
    setStops((s) => s.map((v, n) => (n === i ? { ...v, [key]: value } : v)));
  return (
    <Modal
      title={trip ? "Edit your journey" : "Create a journey"}
      close={close}
    >
      <form
        className="lt-modal-content"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save({
            title: f.get("title"),
            description: f.get("description"),
            startDate: f.get("startDate"),
            endDate: f.get("endDate"),
            status: f.get("status"),
            price: Number(f.get("price")),
            capacity: Number(f.get("capacity")),
            image: f.get("image"),
            version: trip?.version || 0,
            stops,
            participantIds: [],
          });
        }}
      >
        <h2>A new perspective.</h2>
        <label>
          Journey title
          <input
            name="title"
            required
            maxLength={150}
            defaultValue={trip?.title}
          />
        </label>
        <label>
          The story
          <textarea
            name="description"
            maxLength={1000}
            defaultValue={trip?.description}
          />
        </label>
        <div className="lt-form-grid">
          <label>
            Departure
            <input
              name="startDate"
              type="date"
              required
              defaultValue={trip?.start_date?.slice(0, 10)}
            />
          </label>
          <label>
            Return
            <input
              name="endDate"
              type="date"
              required
              defaultValue={trip?.end_date?.slice(0, 10)}
            />
          </label>
          <label>
            Price per person (USD)
            <input
              name="price"
              type="number"
              min="1"
              max="999999.99"
              step="0.01"
              required
              defaultValue={trip?.price || 250}
            />
          </label>
          <label>
            Places available
            <input
              name="capacity"
              type="number"
              min="1"
              max="10000"
              required
              defaultValue={trip?.capacity || 12}
            />
          </label>
          <label>
            Collection image
            <select name="image" defaultValue={trip?.image || "dolomites"}>
              {[
                "dolomites",
                "japan",
                "bali",
                "morocco",
                "greece",
                "iceland",
              ].map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select name="status" defaultValue={trip?.status || "DRAFT"}>
              {["DRAFT", "PUBLISHED", "ARCHIVED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <h3>The itinerary</h3>
        {stops.map((s, i) => (
          <fieldset key={i}>
            <legend>Stop {i + 1}</legend>
            <div className="lt-form-grid">
              {(
                [
                  "destination",
                  "country",
                  "activities",
                  "accommodation",
                  "transportation",
                ] as const
              ).map((k) => (
                <label key={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                  <input
                    required
                    maxLength={k === "activities" ? 2000 : 500}
                    value={s[k]}
                    onChange={(e) => field(i, k, e.target.value)}
                  />
                </label>
              ))}
            </div>
            {stops.length > 1 && (
              <button
                type="button"
                className="lt-text-button"
                onClick={() => setStops(stops.filter((_, n) => n !== i))}
              >
                Remove stop
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          className="lt-text-button"
          disabled={stops.length >= 30}
          onClick={() => setStops([...stops, freshStop()])}
        >
          <Plus size={16} />
          Add a destination
        </button>
        <p className="lt-muted">
          Once a trip has bookings, dates are protected. Refund and cancel
          existing bookings before changing the schedule.
        </p>
        <button type="submit" className="lt-button" disabled={busy}>
          {busy ? "Saving…" : "Save journey"}
          <ArrowRight size={18} />
        </button>
      </form>
    </Modal>
  );
}
