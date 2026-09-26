import { test, expect, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const origin = process.env.TRAVEL_PLAN_URL || "https://localhost:8443";
test.skip(
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
  "Database fixtures require the local Compose deployment",
);
const root = path.resolve("..");
const password =
  process.env.ADMIN_PASSWORD ||
  JSON.parse(
    fs.readFileSync(path.join(root, ".secrets/bootstrap.json"), "utf8"),
  ).ADMIN_PASSWORD;
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
function query(database: "postgres" | "neo4j", text: string) {
  return execFileSync(
    process.platform === "win32" ? "python" : "python3",
    ["scripts/test-database-query.py", database],
    { cwd: root, input: text + "\n", encoding: "utf8", timeout: 35000 },
  ).trim();
}
const sql = (text: string) => query("postgres", text);
function graphCount(cypher: string) {
  const lines = query("neo4j", cypher).split(/\r?\n/).filter(Boolean);
  const count = Number(lines.at(-1));
  expect(Number.isFinite(count), "Neo4j query returned a scalar count").toBe(
    true,
  );
  return count;
}
async function signIn(
  context: APIRequestContext,
  email: string,
  secret: string,
) {
  const response = await context.post("/api/auth/login", {
    data: { email, password: secret },
  });
  expect(response.status()).toBe(200);
  return { "X-CSRF-Token": (await response.json()).csrf as string };
}

test("database enforces session TTL and login throttle recovery", async ({
  playwright,
}) => {
  test.setTimeout(90000);
  const admin = await playwright.request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Origin: origin },
  });
  const visitor = await playwright.request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Origin: origin },
  });
  const headers = await signIn(admin, "admin@travelplan.local", password);
  const email = `security-${randomUUID()}@example.test`;
  const secret = `Fixture!${randomUUID()}`;
  let userId = "";
  try {
    const created = await admin.post("/api/users", {
      headers,
      data: {
        name: "Security fixture",
        email,
        password: secret,
        role: "VIEWER",
        status: "ACTIVE",
      },
    });
    expect(created.status()).toBe(201);
    userId = (await created.json()).id;
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(
        (
          await visitor.post("/api/auth/login", {
            data: { email, password: "WrongPassword!42" },
          })
        ).status(),
      ).toBe(401);
    }
    expect(
      (
        await visitor.post("/api/auth/login", {
          data: { email, password: secret },
        })
      ).status(),
    ).toBe(429);
    expect(
      sql(
        `SELECT locked_until > now()+interval '14 minutes' AND locked_until <= now()+interval '15 minutes' FROM identity.login_attempts WHERE email=${literal(email)};`,
      ),
    ).toBe("t");
    // Advance only the fixture's stored deadline, not the system or other users.
    sql(
      `UPDATE identity.login_attempts SET locked_until=now()-interval '1 second' WHERE email=${literal(email)};`,
    );
    await signIn(visitor, email, secret);
    expect(
      sql(
        `SELECT count(*) FROM identity.login_attempts WHERE email=${literal(email)};`,
      ),
    ).toBe("0");
    expect(
      sql(
        `SELECT expires_at > now()+interval '7 hours 59 minutes' AND expires_at <= now()+interval '8 hours' FROM identity.sessions WHERE user_id=${literal(userId)};`,
      ),
    ).toBe("t");
    expect((await visitor.get("/api/auth/me")).status()).toBe(200);
    expect((await visitor.get("/api/travels")).status()).toBe(403);
    sql(
      `UPDATE identity.sessions SET expires_at=now()-interval '1 second' WHERE user_id=${literal(userId)};`,
    );
    expect((await visitor.get("/api/auth/me")).status()).toBe(401);
    expect((await visitor.get("/api/travels")).status()).toBe(401);
    expect((await visitor.get("/api/payments")).status()).toBe(401);
  } finally {
    const failures: string[] = [];
    try {
      if (userId) {
        const deleted = await admin.delete("/api/users/" + userId, { headers });
        if (![200, 204, 404].includes(deleted.status())) failures.push("user");
      }
    } catch {
      failures.push("user");
    }
    try {
      sql(`DELETE FROM identity.login_attempts WHERE email=${literal(email)};`);
    } catch {
      failures.push("login attempts");
    }
    try {
      await admin.post("/api/auth/logout", { headers });
    } finally {
      await Promise.all([visitor.dispose(), admin.dispose()]);
    }
    expect(failures, "Every isolated security fixture was cleaned up").toEqual(
      [],
    );
  }
});

test("database rolls back failed edits and converges graph and cascading deletes", async ({
  playwright,
}) => {
  test.setTimeout(180000);
  const admin = await playwright.request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Origin: origin },
  });
  const headers = await signIn(admin, "admin@travelplan.local", password);
  const suffix = randomUUID();
  const transactionId = randomUUID();
  const cityA = "Fixture A " + suffix;
  const cityB = "Fixture B " + suffix;
  const cityC = "Fixture C " + suffix;
  let userId = "",
    travelId = "",
    gatewayId = "";
  const stop = (destination: string) => ({
    destination,
    country: "Japan",
    activities: "Guided walk",
    accommodation: "Guesthouse",
    transportation: "Train",
  });
  try {
    const user = await admin.post("/api/users", {
      headers,
      data: {
        name: "Persistence fixture",
        email: `persistence-${suffix}@example.test`,
        password: `Fixture!${suffix}`,
        role: "VIEWER",
        status: "ACTIVE",
      },
    });
    expect(user.status()).toBe(201);
    userId = (await user.json()).id;
    const input = {
      title: "Persistence " + suffix,
      startDate: "2027-03-01",
      endDate: "2027-03-04",
      status: "DRAFT",
      price: 12.34,
      capacity: 2,
      description: "Isolated integration fixture",
      image: "japan",
      stops: [stop(cityA), stop(cityB)],
      participantIds: [userId],
      version: 0,
    };
    const created = await admin.post("/api/travels", { headers, data: input });
    expect(created.status()).toBe(201);
    travelId = (await created.json()).id;
    const id = literal(travelId);
    const projection = (title: string, names: string[]) =>
      `MATCH (t:Travel {id:${id}})-[v:VISITS]->(d:Destination) WITH t,v,d ORDER BY v.position WITH t,collect([v.position,d.name,d.country]) AS stops WHERE t.title=${JSON.stringify(title)} AND stops=${JSON.stringify(names.map((name, i) => [i, name, "Japan"]))} RETURN count(t) AS matching;`;
    await expect
      .poll(() => graphCount(projection(input.title, [cityA, cityB])), {
        timeout: 45000,
        intervals: [1500, 3000],
      })
      .toBe(1);

    // The FK failure happens after parent and child writes. Every write must roll back.
    const rejected = await admin.put("/api/travels/" + travelId, {
      headers,
      data: {
        ...input,
        title: "Must roll back",
        stops: [stop(cityC)],
        participantIds: [randomUUID()],
      },
    });
    expect(rejected.status()).toBe(409);
    const saved = (await (await admin.get("/api/travels")).json()).find(
      (entry: { id: string }) => entry.id === travelId,
    );
    expect(saved.title).toBe(input.title);
    expect(saved.version).toBe(0);
    expect(
      saved.stops.map((entry: { destination: string }) => entry.destination),
    ).toEqual([cityA, cityB]);
    expect(saved.participantIds).toEqual([userId]);
    expect(saved.price).toBe(12.34);

    const updatedTitle = "Updated " + suffix;
    expect(
      (
        await admin.put("/api/travels/" + travelId, {
          headers,
          data: {
            ...input,
            title: updatedTitle,
            stops: [stop(cityB), stop(cityC)],
          },
        })
      ).status(),
    ).toBe(200);
    await expect
      .poll(() => graphCount(projection(updatedTitle, [cityB, cityC])), {
        timeout: 45000,
        intervals: [1500, 3000],
      })
      .toBe(1);
    expect(
      graphCount(
        `MATCH (d:Destination {name:${JSON.stringify(cityA)}}) RETURN count(d) AS matching;`,
      ),
    ).toBe(0);
    sql(`INSERT INTO travel.graph_outbox(travel_id) VALUES (${id}),(${id});`);
    await expect
      .poll(
        () =>
          sql(
            `SELECT count(*) FROM travel.graph_outbox WHERE travel_id=${id};`,
          ),
        { timeout: 30000, intervals: [1000, 2000] },
      )
      .toBe("0");
    expect(graphCount(projection(updatedTitle, [cityB, cityC]))).toBe(1);

    const gateway = await admin.post("/api/payments", {
      headers,
      data: {
        name: "Fixture " + suffix,
        provider: "STRIPE",
        currency: "USD",
        enabled: false,
      },
    });
    expect(gateway.status()).toBe(201);
    gatewayId = (await gateway.json()).id;
    sql(
      `INSERT INTO payments.transactions(id,user_id,travel_id,gateway_id,provider_reference,amount,currency,status) VALUES (${literal(transactionId)},${literal(userId)},${id},${literal(gatewayId)},${literal("fixture-" + suffix)},12.34,'USD','PENDING');`,
    );
    expect(
      (await admin.delete("/api/payments/" + gatewayId, { headers })).status(),
    ).toBe(200);
    gatewayId = "";
    expect(
      sql(
        `SELECT gateway_id IS NULL FROM payments.transactions WHERE id=${literal(transactionId)};`,
      ),
    ).toBe("t");
    expect(
      (await admin.delete("/api/users/" + userId, { headers })).status(),
    ).toBe(200);
    userId = "";
    expect(
      sql(`SELECT count(*) FROM travel.participants WHERE travel_id=${id};`),
    ).toBe("0");
    expect(
      sql(
        `SELECT user_id IS NULL FROM payments.transactions WHERE id=${literal(transactionId)};`,
      ),
    ).toBe("t");
    expect(
      (await admin.delete("/api/travels/" + travelId, { headers })).status(),
    ).toBe(200);
    travelId = "";
    expect(
      sql(`SELECT count(*) FROM travel.stops WHERE travel_id=${id};`),
    ).toBe("0");
    expect(
      sql(
        `SELECT travel_id IS NULL AND amount=12.34 FROM payments.transactions WHERE id=${literal(transactionId)};`,
      ),
    ).toBe("t");
    await expect
      .poll(
        () =>
          graphCount(
            `MATCH (t:Travel {id:${id}}) RETURN count(t) AS matching;`,
          ),
        { timeout: 45000, intervals: [1500, 3000] },
      )
      .toBe(0);
    expect(
      graphCount(
        `MATCH (d:Destination) WHERE d.name IN ${JSON.stringify([cityA, cityB, cityC])} RETURN count(d) AS matching;`,
      ),
    ).toBe(0);
  } finally {
    const failures: string[] = [];
    for (const [resource, id] of [
      ["travels", travelId],
      ["users", userId],
      ["payments", gatewayId],
    ]) {
      if (!id) continue;
      try {
        const result = await admin.delete(`/api/${resource}/${id}`, {
          headers,
        });
        if (![200, 204, 404].includes(result.status())) failures.push(resource);
      } catch {
        failures.push(resource);
      }
    }
    try {
      sql(
        `DELETE FROM payments.transactions WHERE id=${literal(transactionId)};`,
      );
    } catch {
      failures.push("transaction");
    }
    try {
      await admin.post("/api/auth/logout", { headers });
    } finally {
      await admin.dispose();
    }
    expect(
      failures,
      "Every isolated integration fixture was cleaned up",
    ).toEqual([]);
  }
});
