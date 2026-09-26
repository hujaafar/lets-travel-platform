/* This file is embedded ONLY by scripts/export-preview.py, never by the app build.
 * It makes the single-file design review interactive with local sample data.
 * It is not an authentication service or a substitute for backend verification.
 */
(() => {
  window.TRAVEL_PLAN_PREVIEW = true;
  const initial = window.TRAVEL_PLAN_SAMPLE;
  const storageKey = "travel-plan-departure-preview-v2";
  let state;
  try {
    state =
      JSON.parse(localStorage.getItem(storageKey)) || structuredClone(initial);
  } catch {
    state = structuredClone(initial);
  }
  let signedIn = true;
  const originalFetch = window.fetch.bind(window);
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* Private/file contexts can disallow storage; this session still works. */
    }
  };
  const response = (body, status = 200) =>
    Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  const fail = (message, status = 400) => response({ message }, status);
  const adminId = initial.users[0].id;
  const admin = () => ({
    ...state.users.find((user) => user.id === adminId),
    csrf: "preview-only",
  });
  window.fetch = (input, options = {}) => {
    const path = typeof input === "string" ? input : input.url;
    if (!path.startsWith("/api/")) return originalFetch(input, options);
    const method = options.method || "GET";
    let body;
    try {
      body = options.body ? JSON.parse(options.body) : {};
    } catch {
      return fail("The preview could not read this form.");
    }
    if (path === "/api/auth/login") {
      signedIn = true;
      return response(admin());
    }
    if (path === "/api/auth/logout") {
      signedIn = false;
      return response(null, 204);
    }
    if (!signedIn)
      return fail(
        "Please sign in to the preview. Any nonempty password opens the sample account.",
        401,
      );
    if (path === "/api/auth/me") return response(admin());
    if (path.endsWith("/test"))
      return fail(
        "This is a design preview. Provider connections are available in the Java application after sandbox credentials are configured.",
        503,
      );
    const [, , resource, id] = path.split("/");
    const collection = resource === "payments" ? "gateways" : resource;
    if (!Object.hasOwn(state, collection))
      return fail("Preview endpoint not available.", 404);
    if (method === "GET") return response(state[collection]);
    const index = state[collection].findIndex((row) => row.id === id);
    if (method === "DELETE") {
      if (index < 0) return fail("Record not found.", 404);
      if (collection === "users" && id === adminId)
        return fail("You cannot remove your own administrator access.", 409);
      state[collection].splice(index, 1);
      if (collection === "users")
        state.travels.forEach((t) => {
          t.participantIds = t.participantIds.filter((member) => member !== id);
        });
      save();
      return response(null, 204);
    }
    if (method !== "PUT" && method !== "POST")
      return fail("Unsupported preview action.");
    if (method === "PUT" && index < 0) return fail("Record not found.", 404);
    let record = { ...body, id: id || crypto.randomUUID() };
    if (collection === "travels") {
      if (body.endDate < body.startDate)
        return fail("End date must be on or after start date.");
      if (body.participantIds.length > body.capacity)
        return fail("Participants exceed capacity.");
      if (index >= 0 && body.version !== state.travels[index].version)
        return fail("This plan has changed. Reopen it before saving.", 409);
      record = {
        ...record,
        start_date: body.startDate,
        end_date: body.endDate,
        duration:
          Math.round(
            (Date.parse(body.endDate) - Date.parse(body.startDate)) / 86400000,
          ) + 1,
        version: index >= 0 ? state.travels[index].version + 1 : 0,
      };
    }
    if (collection === "users") {
      if (
        state.users.some(
          (u) =>
            u.email.toLowerCase() === body.email.toLowerCase() && u.id !== id,
        )
      )
        return fail("That email address is already used.", 409);
      if (id === adminId && (body.role !== "ADMIN" || body.status !== "ACTIVE"))
        return fail("You cannot remove your own administrator access.", 409);
      delete record.password;
      record.created_at = new Date().toISOString();
    }
    if (collection === "gateways")
      record = { ...record, configured: false, mode: "sandbox" };
    if (index >= 0) state[collection][index] = record;
    else state[collection].unshift(record);
    save();
    return response(
      method === "POST" ? { id: record.id } : null,
      method === "POST" ? 201 : 204,
    );
  };
})();
