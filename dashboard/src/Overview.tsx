import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Plane,
  MapPin,
  Hotel,
  Compass,
  MoveUpRight,
} from "lucide-react";
import {
  type Travel,
  type User,
  type Gateway,
  date,
  money,
  photo,
} from "./types";
import { useScrollScene, scrollToJourney } from "./useScrollScene";
import OrbitIntro from "./OrbitIntro";

type Props = {
  travels: Travel[];
  users: User[];
  gateways: Gateway[];
  canTravel: boolean;
  onCreate: () => void;
  onOpen: (travel: Travel) => void;
  onPlans: () => void;
  onExport: () => void;
};
export default function Overview({
  travels,
  users,
  gateways,
  canTravel,
  onCreate,
  onOpen,
  onPlans,
  onExport,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [activeStop, setActiveStop] = useState(0);
  const [activeJourney, setActiveJourney] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = travels
    .filter(
      (t) => t.status === "PUBLISHED" && t.start_date.slice(0, 10) >= today,
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const featured = upcoming[0] || travels[0];
  const others = travels.filter((t) => t.id !== featured?.id).slice(0, 3);
  const stops = (featured?.stops || []).slice(0, 4);
  const current = Math.min(activeStop, Math.max(stops.length - 1, 0));
  const revision = `${featured?.id}:${featured?.version}:${stops.length}:${others.length}`;
  useScrollScene(root, revision, setActiveStop, setActiveJourney);
  const edition = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  function goToStop(index: number) {
    const target = root.current?.querySelector<HTMLElement>(
      `[data-route-stop="${index}"]`,
    );
    if (!target) return;
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    target.focus({ preventScroll: true });
  }

  return (
    <div className="editorial-overview kinetic-atlas" ref={root}>
      <div className="reading-meter" aria-hidden="true">
        <i />
      </div>
      <OrbitIntro travel={featured} onOpen={onOpen} />
      <section
        className="dispatch-opening"
        data-sc-act="flow"
        aria-labelledby="desk-title"
      >
        <div className="dispatch-meta">
          <span>TRAVEL PLAN / THE WORKSPACE</span>
          <span>{edition} edition</span>
        </div>
        <div className="dispatch-title-row">
          <h1 id="desk-title" tabIndex={-1}>
            <span className="title-first">The departure </span>
            <br />
            <em>desk.</em>
            <span className="title-period" aria-hidden="true">
              *
            </span>
          </h1>
          <div className="dispatch-intro">
            <p>
              For the places you’ll go.
              <br />
              And everything that gets you there.
            </p>
            <button
              className="button primary"
              onClick={onCreate}
              disabled={!canTravel}
            >
              <Plus size={17} /> Create travel plan
            </button>
            <span>A little planning. A world of possibility.</span>
          </div>
        </div>
        {featured ? (
          <div className="launch-runway" data-flight>
            <div className="launch-stage">
              <div className="launch-ground" aria-hidden="true">
                <span>{featured.stops[0]?.country || "Elsewhere"}</span>
                <svg viewBox="0 0 1000 700">
                  <ellipse cx="500" cy="350" rx="460" ry="300" />
                  <ellipse cx="500" cy="350" rx="350" ry="300" />
                  <ellipse cx="500" cy="350" rx="180" ry="300" />
                  <path d="M40 350H960M100 170H900M100 530H900" />
                </svg>
              </div>
              <button
                className="launch-skip"
                onClick={() =>
                  root.current
                    ?.querySelector(".journey-reader")
                    ?.scrollIntoView({ behavior: "instant", block: "start" })
                }
              >
                Go to the itinerary <ArrowUpRight size={16} />
              </button>
              <div className="dispatch-cover-wrap">
                <article className="dispatch-cover" aria-label={featured.title}>
                  <div className="cover-photograph">
                    <img
                      src={photo(featured.image)}
                      alt={`${featured.stops[0]?.country || "Travel"} destination photograph`}
                      width="1600"
                      height="1000"
                      fetchPriority="high"
                    />
                  </div>
                  <div className="cover-corner" aria-hidden="true" />
                  <svg
                    className="flight-sketch"
                    viewBox="0 0 1200 600"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      className="flight-trail-ground"
                      d="M90 360 C290 20 710 20 1010 240"
                    />
                    <path
                      className="flight-trail"
                      pathLength="1"
                      d="M90 360 C290 20 710 20 1010 240"
                    />
                    <g className="flight-plane">
                      <path d="M-14 0 L14 0 M2 -13 L14 0 L2 13" />
                    </g>
                  </svg>
                  <div className="cover-copy">
                    <span>
                      {upcoming.length
                        ? "NEXT ON THE HORIZON"
                        : "FROM YOUR SAVED PLANS"}
                    </span>
                    <h2>{featured.title}</h2>
                    <button onClick={() => onOpen(featured)}>
                      Explore itinerary <ArrowUpRight size={20} />
                    </button>
                  </div>
                  <div className="cover-location">
                    <MapPin size={14} />
                    {featured.stops.map((s) => s.destination).join(" / ")}
                  </div>
                  <div className="cover-seal" aria-hidden="true">
                    <span>MADE FOR</span>
                    <Compass size={34} strokeWidth={1} />
                    <span>GOING PLACES</span>
                  </div>
                </article>
                <div className="departure-ticket-plane">
                  <aside className="departure-ticket">
                    <div className="ticket-top">
                      <span>YOUR NEXT CHAPTER</span>
                      <Plane size={17} />
                    </div>
                    <div className="ticket-date">
                      <strong>
                        {date(featured.start_date, { day: "2-digit" })}
                      </strong>
                      <span>
                        {date(featured.start_date, { month: "short" })}
                        <small>
                          {date(featured.start_date, { year: "numeric" })}
                        </small>
                      </span>
                    </div>
                    <div className="ticket-destination">
                      <strong>{featured.stops[0]?.country}</strong>
                      <span>
                        {featured.duration} days, {featured.stops.length}{" "}
                        {featured.stops.length === 1
                          ? "destination"
                          : "destinations"}
                      </span>
                    </div>
                    <div className="ticket-perforation" />
                    <div className="ticket-bottom">
                      <span>
                        TRAVELLERS
                        <strong>
                          {featured.participantIds.length}
                          <i> / {featured.capacity}</i>
                        </strong>
                      </span>
                      <button
                        aria-label={`View travel details for ${featured.title}`}
                        onClick={() => onOpen(featured)}
                      >
                        <ArrowUpRight size={24} />
                      </button>
                    </div>
                    <div className="ticket-barcode" aria-hidden="true" />
                    <span className="ticket-reference">
                      TP / {featured.id.slice(-6).toUpperCase()}
                    </span>
                  </aside>
                </div>
                <div className="cover-caption">
                  <span>Consider this your out-of-office inspiration.</span>
                  <span>
                    {featured.stops[0]?.country} · {date(featured.start_date)} –
                    {date(featured.end_date)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="dispatch-empty">
            <Compass size={44} />
            <h2>Your story starts with a place.</h2>
            <p>Create your first travel plan to start filling this desk.</p>
            <button
              className="button primary"
              onClick={onCreate}
              disabled={!canTravel}
            >
              Create travel plan <Plus size={17} />
            </button>
          </div>
        )}
      </section>

      <section
        className="desk-numbers"
        aria-label="Workspace at a glance"
        data-sc-act="flow"
      >
        {[
          {
            label: "Journeys on the desk",
            value: travels.length,
            detail: `${travels.filter((t) => t.status === "PUBLISHED").length} published`,
          },
          {
            label: "People along the way",
            value: users.length,
            detail: `${users.filter((u) => u.status === "ACTIVE").length} active accounts`,
          },
          {
            label: "Departures ahead",
            value: upcoming.length,
            detail: "Published & upcoming",
          },
          {
            label: "Payment gateways",
            value: gateways.length,
            detail: `${gateways.filter((g) => g.configured).length} connected`,
          },
        ].map((m, index) => (
          <div
            className="desk-number metric"
            key={m.label}
            data-sc-in
            style={
              { "--reveal-delay": `${index * 65}ms` } as React.CSSProperties
            }
          >
            <span>{m.label}</span>
            <strong>
              <span data-metric-value>{String(m.value).padStart(2, "0")}</span>
              <small>{m.detail}</small>
            </strong>
          </div>
        ))}
      </section>

      {stops.length > 0 && (
        <div className="destination-ticker" data-ticker aria-hidden="true">
          <div>
            {[...stops, ...stops].map((stop, index) => (
              <span key={index}>
                {stop.destination}
                <i>✳</i>
              </span>
            ))}
          </div>
        </div>
      )}
      {featured && stops.length > 0 && (
        <section
          className="journey-reader"
          aria-labelledby="journey-reader-title"
          data-sc-act="flow"
        >
          <div className="reader-heading">
            <div>
              <span className="section-rule-label">
                THE JOURNEY, CONSIDERED
              </span>
              <h2 id="journey-reader-title">
                A place for <em>every moment.</em>
              </h2>
            </div>
            <button className="text-link" onClick={() => onOpen(featured)}>
              Open full itinerary <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="reader-layout">
            <div className="route-bookmark">
              <span className="bookmark-folio" aria-hidden="true">
                {String(current + 1).padStart(2, "0")}
              </span>
              <div className="bookmark-photo">
                {stops.map((stop, index) => {
                  const name = stop.destination.toLowerCase();
                  const key =
                    stop.country.toLowerCase() === "indonesia" &&
                    ["ubud", "uluwatu"].includes(name)
                      ? name
                      : featured.image;
                  return (
                    <img
                      key={index}
                      src={photo(key)}
                      alt={
                        index === current
                          ? `Destination photograph for ${stop.destination}, ${stop.country}`
                          : ""
                      }
                      aria-hidden={index !== current}
                      className={index === current ? "current" : ""}
                      width="800"
                      height="1000"
                      loading="lazy"
                    />
                  );
                })}
                <div className="bookmark-photo-caption">
                  <span>{featured.title}</span>
                  <strong>{stops[current]?.destination}</strong>
                </div>
              </div>
              <div className="bookmark-paper">
                <div className="bookmark-header">
                  <span>YOUR ROUTE</span>
                  <span>{featured.duration} DAYS</span>
                </div>
                <div
                  className="route-track"
                  style={
                    {
                      "--route-progress":
                        stops.length > 1 ? current / (stops.length - 1) : 1,
                    } as React.CSSProperties
                  }
                >
                  <div className="route-track-line" aria-hidden="true" />
                  {stops.map((stop, index) => (
                    <button
                      key={index}
                      className={
                        index === current
                          ? "route-location current"
                          : "route-location"
                      }
                      onClick={() => goToStop(index)}
                      aria-current={index === current ? "step" : undefined}
                      aria-label={`Read about ${stop.destination}`}
                    >
                      <i />
                      <span>{stop.destination}</span>
                    </button>
                  ))}
                </div>
                <div className="bookmark-note">
                  <span>
                    {date(featured.start_date)} – {date(featured.end_date)}
                  </span>
                  <span>
                    {current + 1} of {featured.stops.length} stops
                  </span>
                </div>
              </div>
            </div>
            <div className="route-reading-list">
              {stops.map((stop, index) => (
                <article
                  key={index}
                  className={`route-reading-stop ${index === current ? "current" : ""}`}
                  data-route-stop={index}
                  tabIndex={-1}
                  aria-labelledby={`stop-title-${index}`}
                >
                  <div className="stop-topline">
                    <span>STOP {String(index + 1).padStart(2, "0")}</span>
                    <span>{stop.country}</span>
                  </div>
                  <h3 id={`stop-title-${index}`}>
                    {stop.destination}
                    <span>.</span>
                  </h3>
                  <div className="stop-activity">
                    <Compass size={20} />
                    <div>
                      <span>MAKE A MEMORY</span>
                      <p>{stop.activities}</p>
                    </div>
                  </div>
                  <div className="stop-practical">
                    <div>
                      <Hotel size={18} />
                      <span>STAY A WHILE</span>
                      <p>{stop.accommodation}</p>
                    </div>
                    <div>
                      <MoveUpRight size={18} />
                      <span>GETTING THERE</span>
                      <p>{stop.transportation}</p>
                    </div>
                  </div>
                  <button
                    className="stop-open"
                    onClick={() => onOpen(featured)}
                  >
                    See the whole journey <ArrowRight size={18} />
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section
        className="desk-collection"
        aria-labelledby="collection-title"
        data-sc-act="flow"
      >
        <div className="collection-runway" data-rail>
          <div className="collection-stage">
            <div className="collection-heading">
              <h2 id="collection-title">
                Still on your <em>mind.</em>
              </h2>
              <div>
                <p>A few more places in the making.</p>
                <button className="text-link" onClick={onPlans}>
                  All travel plans <ArrowUpRight size={18} />
                </button>
              </div>
            </div>
            <div
              className="collection-window"
              tabIndex={0}
              aria-label="Saved journeys gallery"
            >
              <div className="editorial-journeys">
                {others.map((travel, index) => (
                  <article
                    className="editorial-journey"
                    key={travel.id}
                    data-journey-card={index}
                  >
                    <button
                      className="journey-portrait"
                      onClick={() => onOpen(travel)}
                      aria-label={`Explore ${travel.title}`}
                    >
                      <img
                        src={photo(travel.image)}
                        alt={`${travel.stops[0]?.country || "Travel"} destination`}
                        width="800"
                        height="1000"
                        loading="lazy"
                      />
                      <span className="portrait-arrow">
                        <ArrowUpRight size={23} />
                      </span>
                      <span className="portrait-duration">
                        {travel.duration} DAYS AWAY
                      </span>
                    </button>
                    <div className="editorial-journey-meta">
                      <span>{travel.stops[0]?.country}</span>
                      <span
                        className={"status-dot " + travel.status.toLowerCase()}
                      >
                        {travel.status.toLowerCase()}
                      </span>
                    </div>
                    <h3>
                      <button onClick={() => onOpen(travel)}>
                        {travel.title}
                      </button>
                    </h3>
                    <div className="editorial-journey-foot">
                      <span>{date(travel.start_date)}</span>
                      <span>
                        {money(travel.price)} <small>/ person</small>
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            {others.length > 0 && (
              <div className="collection-navigation">
                <span>
                  {String(Math.min(activeJourney + 1, others.length)).padStart(
                    2,
                    "0",
                  )}{" "}
                  <i>/</i> {String(others.length).padStart(2, "0")} saved
                  journeys
                </span>
                <div className="collection-progress" aria-hidden="true">
                  <i />
                </div>
                <div className="collection-arrows">
                  <button
                    aria-label="Previous saved journey"
                    disabled={activeJourney === 0}
                    onClick={() =>
                      scrollToJourney(root.current, activeJourney - 1)
                    }
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <button
                    aria-label="Next saved journey"
                    disabled={activeJourney >= others.length - 1}
                    onClick={() =>
                      scrollToJourney(root.current, activeJourney + 1)
                    }
                  >
                    <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            )}
            {!others.length && (
              <p className="collection-empty">
                Your next saved journey will appear here.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="desk-close" data-sc-act="flow">
        {featured && (
          <div className="closing-orbit" aria-hidden="true">
            <div>
              <img src={photo(featured.image)} alt="" loading="lazy" />
            </div>
            <svg viewBox="0 0 300 300">
              <circle cx="150" cy="150" r="146" />
              <circle cx="150" cy="150" r="130" strokeDasharray="1 12" />
              <path d="M150 0V35M150 265V300M0 150H35M265 150H300" />
            </svg>
          </div>
        )}
        <div className="closing-copy">
          <span className="closing-star" aria-hidden="true">
            ✳
          </span>
          <h2>
            Where <em>next?</em>
          </h2>
          <p>A blank page. A new place. Your move.</p>
        </div>
        <div className="closing-actions">
          <button
            className="button primary"
            onClick={onCreate}
            disabled={!canTravel}
          >
            Create travel plan <Plus size={18} />
          </button>
          <button className="text-link" onClick={onExport}>
            Take your plans with you <ArrowDownToLine size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}
