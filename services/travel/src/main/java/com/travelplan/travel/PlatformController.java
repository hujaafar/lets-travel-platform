package com.travelplan.travel;

import com.travelplan.common.SessionUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Role-aware APIs. Public projections never expose another traveler's identity. */
@RestController
public class PlatformController {
  private final JdbcTemplate db;
  private final TravelController travels;
  private final DiscoveryService discovery;

  public PlatformController(JdbcTemplate db, TravelController travels, DiscoveryService discovery) {
    this.db = db;
    this.travels = travels;
    this.discovery = discovery;
  }

  static UUID uid(SessionUser u) {
    return UUID.fromString(u.id());
  }

  static boolean admin(SessionUser u) {
    return "ADMIN".equals(u.role());
  }

  private static ResponseStatusException missing() {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, "Travel not found");
  }

  @GetMapping("/api/explore")
  public Object explore(@RequestParam(defaultValue = "") @Size(max = 100) String q) {
    if (q.length() > 100) throw new IllegalArgumentException("Search is too long");
    var ids = q.isBlank() ? null : discovery.search(q);
    if (ids != null && ids.isEmpty()) return List.of();
    var rows =
        new org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate(db)
            .queryForList(
                "select t.*, p.name as manager_name, (select count(*) from payments.bookings b"
                    + " where b.travel_id=t.id and b.status in"
                    + " ('PENDING','CONFIRMED','CANCEL_REQUESTED')) as reserved from travel.travels"
                    + " t left join identity.public_profiles p on p.id=t.manager_id where"
                    + " t.status='PUBLISHED' and t.start_date>current_date+3 and (:unfiltered or"
                    + " t.id::text in (:ids)) order by t.start_date limit 200",
                Map.of("unfiltered", ids == null, "ids", ids == null ? List.of("") : ids));
    rows.forEach(this::details);
    return rows;
  }

  @GetMapping("/api/explore/suggest")
  public Object suggest(@RequestParam(defaultValue = "") String q) {
    if (q.length() > 100) throw new IllegalArgumentException("Search is too long");
    return q.isBlank() ? List.of() : discovery.suggest(q);
  }

  @GetMapping("/api/explore/recommendations")
  public Object recommendations(@RequestAttribute("user") SessionUser user) {
    return discovery.recommend(uid(user));
  }

  @GetMapping("/api/explore/{id}")
  public Object detail(@PathVariable UUID id, @RequestAttribute("user") SessionUser user) {
    var rows =
        db.queryForList(
            "select t.*,p.name as manager_name from travel.travels t left join"
                + " identity.public_profiles p on p.id=t.manager_id where t.id=? and"
                + " (t.status='PUBLISHED' or t.manager_id=? or ?)",
            id,
            uid(user),
            admin(user));
    if (rows.isEmpty()) throw missing();
    var row = rows.get(0);
    details(row);
    return row;
  }

  private void details(Map<String, Object> row) {
    row.put(
        "stops",
        db.queryForList(
            "select destination,country,activities,accommodation,transportation from travel.stops"
                + " where travel_id=? order by position",
            row.get("id")));
    row.put(
        "feedback",
        db.queryForList(
            "select f.rating,f.comment,f.created_at,f.is_demo,coalesce(p.name,'Former traveler') as"
                + " name from travel.feedback f left join identity.public_profiles p on"
                + " p.id=f.user_id where travel_id=? order by f.created_at desc limit 100",
            row.get("id")));
  }

  @GetMapping("/api/explore/{id}/community")
  public Object community(@PathVariable UUID id, @RequestAttribute("user") SessionUser user) {
    if (!admin(user)
        && db.queryForObject(
                "select count(*) from payments.bookings where travel_id=? and user_id=? and"
                    + " status='CONFIRMED'",
                Integer.class,
                id,
                uid(user))
            == 0)
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "The group is visible to confirmed travelers only");
    return db.queryForList(
        "select distinct p.id,p.name from payments.bookings b join identity.public_profiles p on"
            + " p.id=b.user_id where b.travel_id=? and b.status='CONFIRMED' order by p.name",
        id);
  }

  @GetMapping("/api/manage/travels")
  public Object owned(@RequestAttribute("user") SessionUser user) {
    return travels.list().stream()
        .filter(t -> admin(user) || uid(user).equals(t.get("manager_id")))
        .toList();
  }

  @PostMapping("/api/manage/travels")
  @ResponseStatus(HttpStatus.CREATED)
  @Transactional
  public Object create(
      @Valid @RequestBody TravelController.TravelInput input,
      @RequestAttribute("user") SessionUser user) {
    if (input.participantIds() != null && !input.participantIds().isEmpty())
      throw new IllegalArgumentException("Travelers join through checkout");
    var result = travels.create(input);
    db.update("update travel.travels set manager_id=? where id=?", uid(user), result.get("id"));
    return result;
  }

  void own(UUID id, SessionUser user) {
    var rows = db.queryForList("select manager_id from travel.travels where id=? for update", id);
    if (rows.isEmpty()) throw missing();
    if (!admin(user) && !uid(user).equals(rows.get(0).get("manager_id")))
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only manage your own trips");
  }

  @PutMapping("/api/manage/travels/{id}")
  @Transactional
  public void update(
      @PathVariable UUID id,
      @Valid @RequestBody TravelController.TravelInput input,
      @RequestAttribute("user") SessionUser user) {
    own(id, user);
    int booked =
        Objects.requireNonNull(
            db.queryForObject(
                "select count(*) from payments.bookings where travel_id=? and status in"
                    + " ('PENDING','CONFIRMED','CANCEL_REQUESTED')",
                Integer.class,
                id),
            "Booking count missing");
    var current = db.queryForMap("select start_date,end_date from travel.travels where id=?", id);
    if (booked > 0
        && (!input.startDate().equals(((java.sql.Date) current.get("start_date")).toLocalDate())
            || !input.endDate().equals(((java.sql.Date) current.get("end_date")).toLocalDate())
            || !"PUBLISHED".equals(input.status())))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Cancel existing bookings before changing dates or unpublishing");
    if (input.capacity() < booked)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Capacity is below existing bookings");
    var people =
        db.queryForList(
            "select user_id from travel.participants where travel_id=?", UUID.class, id);
    travels.update(
        id,
        new TravelController.TravelInput(
            input.title(),
            input.startDate(),
            input.endDate(),
            input.status(),
            input.price(),
            input.capacity(),
            input.description(),
            input.image(),
            input.stops(),
            people,
            input.version()));
  }

  @DeleteMapping("/api/manage/travels/{id}")
  @Transactional
  public void delete(@PathVariable UUID id, @RequestAttribute("user") SessionUser user) {
    own(id, user);
    if (db.queryForObject(
            "select count(*) from payments.bookings where travel_id=?", Integer.class, id)
        > 0)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "Trips with payment history must be archived after active bookings are cancelled");
    travels.delete(id);
  }

  @GetMapping("/api/manage/travels/{id}/subscribers")
  @Transactional
  public Object subscribers(@PathVariable UUID id, @RequestAttribute("user") SessionUser user) {
    own(id, user);
    return db.queryForList(
        "select b.id,b.user_id,p.name,b.status,b.is_demo,b.created_at,(select count(*) from"
            + " payments.bookings h join travel.travels t on t.id=h.travel_id where"
            + " h.user_id=b.user_id and h.status='CONFIRMED' and t.end_date<current_date) as"
            + " past_trips from payments.bookings b left join identity.public_profiles p on"
            + " p.id=b.user_id where b.travel_id=? order by b.created_at desc",
        id);
  }

  public record Feedback(
      @NotNull UUID travelId,
      @Min(1) @Max(5) int rating,
      @NotBlank @Size(max = 2000) String comment) {}

  @PostMapping("/api/feedback")
  @ResponseStatus(HttpStatus.CREATED)
  @Transactional
  public void feedback(@Valid @RequestBody Feedback f, @RequestAttribute("user") SessionUser user) {
    if (db.queryForObject(
            "select count(*) from payments.bookings b join travel.travels t on t.id=b.travel_id"
                + " where b.user_id=? and b.travel_id=? and b.status='CONFIRMED' and"
                + " t.end_date<current_date",
            Integer.class,
            uid(user),
            f.travelId())
        == 0)
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Feedback is available after a trip you attended has ended");
    db.update(
        "insert into travel.feedback(id,travel_id,user_id,rating,comment) values (?,?,?,?,?) on"
            + " conflict(travel_id,user_id) do update set"
            + " rating=excluded.rating,comment=excluded.comment",
        UUID.randomUUID(),
        f.travelId(),
        uid(user),
        f.rating(),
        f.comment().trim());
  }

  public record Report(
      UUID targetUserId, UUID travelId, @NotBlank @Size(max = 2000) String reason) {}

  @PostMapping("/api/reports")
  @ResponseStatus(HttpStatus.CREATED)
  public Object report(@Valid @RequestBody Report r, @RequestAttribute("user") SessionUser user) {
    if (r.targetUserId() == null && r.travelId() == null)
      throw new IllegalArgumentException("Choose a traveler, manager, or trip to report");
    if (uid(user).equals(r.targetUserId()))
      throw new IllegalArgumentException("You cannot report yourself");
    UUID id = UUID.randomUUID();
    db.update(
        "insert into travel.reports(id,reporter_id,target_user_id,travel_id,reason) values"
            + " (?,?,?,?,?)",
        id,
        uid(user),
        r.targetUserId(),
        r.travelId(),
        r.reason().trim());
    return Map.of("id", id);
  }

  @GetMapping("/api/reports")
  public Object reports(@RequestAttribute("user") SessionUser user) {
    return db.queryForList(
        "select * from travel.reports where reporter_id=? or ? order by created_at desc limit 200",
        uid(user),
        admin(user));
  }

  public record Resolution(
      @NotBlank String status, @NotBlank @Size(max = 2000) String resolution) {}

  @PutMapping("/api/reports/{id}")
  public void resolve(
      @PathVariable UUID id,
      @Valid @RequestBody Resolution r,
      @RequestAttribute("user") SessionUser user) {
    if (!admin(user))
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator access is required");
    if (!Set.of("REVIEWED", "DISMISSED").contains(r.status()))
      throw new IllegalArgumentException("Choose reviewed or dismissed");
    if (db.update(
            "update travel.reports set status=?,resolution=?,reviewed_at=now() where id=?",
            r.status(),
            r.resolution(),
            id)
        == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found");
  }

  @GetMapping("/api/managers/{id}")
  public Object manager(@PathVariable UUID id) {
    var rows =
        db.queryForList(
            "select id,name from identity.public_profiles where id=? and role in"
                + " ('ADMIN','TRAVEL_MANAGER')",
            id);
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Manager not found");
    var row = rows.get(0);
    row.put(
        "trips",
        db.queryForObject(
            "select count(*) from travel.travels where manager_id=? and status='PUBLISHED'",
            Integer.class,
            id));
    row.put(
        "ratings",
        db.queryForList(
            "select t.title,f.rating,f.comment,f.created_at,f.is_demo from travel.feedback f join"
                + " travel.travels t on t.id=f.travel_id where t.manager_id=? order by f.created_at"
                + " desc limit 100",
            id));
    row.put(
        "report_count",
        db.queryForObject(
            "select count(*) from travel.reports where target_user_id=? and status='REVIEWED'",
            Integer.class,
            id));
    return row;
  }

  @GetMapping("/api/profile")
  public Object profile(@RequestAttribute("user") SessionUser user) {
    UUID id = uid(user);
    return Map.of(
        "has_demo",
        Boolean.TRUE.equals(
            db.queryForObject(
                "select exists(select 1 from payments.bookings where user_id=? and is_demo)",
                Boolean.class,
                id)),
        "past_trips",
        db.queryForObject(
            "select count(*) from payments.bookings b join travel.travels t on t.id=b.travel_id"
                + " where b.user_id=? and b.status='CONFIRMED' and t.end_date<current_date",
            Integer.class,
            id),
        "cancellations",
        db.queryForObject(
            "select count(*) from payments.bookings where user_id=? and status in"
                + " ('CANCELLED','REFUNDED')",
            Integer.class,
            id),
        "reports",
        db.queryForObject(
            "select count(*) from travel.reports where reporter_id=?", Integer.class, id),
        "payment_methods",
        db.queryForList(
            "select provider,count(*) as uses from payments.bookings where user_id=? and"
                + " status='CONFIRMED' group by provider order by uses desc",
            id));
  }

  @GetMapping("/api/manage/analytics")
  public Object analytics(@RequestAttribute("user") SessionUser user) {
    UUID id = uid(user);
    boolean all = admin(user);
    var monthly =
        db.queryForList(
            "select to_char(b.created_at,'YYYY-MM') as month,b.currency,sum(b.amount) as"
                + " income,count(distinct b.user_id) as travelers from payments.bookings b join"
                + " travel.travels t on t.id=b.travel_id where b.status='CONFIRMED' and"
                + " b.created_at>=date_trunc('month',now())-interval '5 months' and (t.manager_id=?"
                + " or ?) group by month,b.currency order by month",
            id,
            all);
    var trips =
        db.queryForList(
            "select t.id,t.title,t.start_date,t.end_date,t.status,t.currency,(select count(*) from"
                + " payments.bookings b where b.travel_id=t.id and b.status='CONFIRMED') as"
                + " travelers,(select coalesce(sum(amount),0) from payments.bookings b where"
                + " b.travel_id=t.id and b.status='CONFIRMED') as income,(select"
                + " round(avg(rating),2) from travel.feedback f where f.travel_id=t.id) as rating"
                + " from travel.travels t where t.manager_id=? or ? order by rating desc nulls"
                + " last,travelers desc",
            id,
            all);
    var managers =
        all
            ? db.queryForList(
                "select x.*,round(x.rating*20,1)+least(x.travelers,100)+least(x.income_usd/100,100)"
                    + " as score from (select p.id,p.name,(select count(*) from travel.travels t"
                    + " where t.manager_id=p.id) as trips,(select count(*) from payments.bookings b"
                    + " join travel.travels t on t.id=b.travel_id where t.manager_id=p.id and"
                    + " b.status='CONFIRMED') as travelers,(select coalesce(sum(b.amount),0) from"
                    + " payments.bookings b join travel.travels t on t.id=b.travel_id where"
                    + " t.manager_id=p.id and b.status='CONFIRMED' and b.currency='USD') as"
                    + " income_usd, coalesce((select round(avg(f.rating),2) from travel.feedback f"
                    + " join travel.travels t on t.id=f.travel_id where t.manager_id=p.id),0) as"
                    + " rating from identity.public_profiles p where p.role in"
                    + " ('ADMIN','TRAVEL_MANAGER')) x order by score desc")
            : List.of();
    return Map.of(
        "monthly",
        monthly,
        "trips",
        trips,
        "managers",
        managers,
        "has_demo",
        Boolean.TRUE.equals(
            db.queryForObject(
                "select exists(select 1 from payments.bookings b join travel.travels t on"
                    + " t.id=b.travel_id where b.is_demo and (t.manager_id=? or ?))",
                Boolean.class,
                id,
                all)));
  }
}
