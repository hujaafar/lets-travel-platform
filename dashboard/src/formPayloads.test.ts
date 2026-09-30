import { describe, expect, it } from "vitest";
import { gatewayPayload, travelPayload, userPayload } from "./formPayloads";
import type { Stop } from "./types";

const fields = {
  title: " Island journey ",
  startDate: "2028-02-28",
  endDate: "2028-03-01",
  price: "1234.56",
  capacity: "3",
  status: "DRAFT",
  image: "bali",
  description: "A small group.",
};
const stop: Stop = {
  destination: " Ubud ",
  country: "Indonesia",
  activities: "Walking",
  accommodation: "Hotel",
  transportation: "Car",
};
const person = {
  name: " New person ",
  email: "PERSON@EXAMPLE.TEST",
  role: "VIEWER",
  status: "ACTIVE",
  password: "A strong password 123",
};
const gateway = {
  name: " Stripe sandbox ",
  provider: "STRIPE",
  currency: "USD",
  enabled: "on",
};

describe("travel editor payload", () => {
  it("sends validated numeric values, ordered stops, participants and the original edit version", () => {
    const stops = [stop, { ...stop, destination: "Uluwatu" }];
    const participants = ["person-a", "person-b"];
    const payload = travelPayload(
      { ...fields, unexpected: "not part of the API" },
      stops,
      participants,
      7,
    );
    expect(payload).toEqual({
      ...fields,
      title: "Island journey",
      price: 1234.56,
      capacity: 3,
      stops: [{ ...stop, destination: "Ubud" }, stops[1]],
      participantIds: participants,
      version: 7,
    });
    expect(payload.stops).not.toBe(stops);
    expect(payload.participantIds).not.toBe(participants);
    expect(stop.destination).toBe(" Ubud ");
  });
  it("allows a one-day trip without inventing a client duration", () => {
    expect(
      travelPayload({ ...fields, endDate: fields.startDate }, [stop], []),
    ).toMatchObject({
      startDate: "2028-02-28",
      endDate: "2028-02-28",
      version: 0,
    });
  });
  it.each([
    [{ startDate: "2027-02-29" }, "valid calendar date"],
    [{ endDate: "2028-02-27" }, "End date must be on or after"],
    [{ startDate: "2028-13-01" }, "valid calendar date"],
  ])("rejects invalid or reversed date boundaries: %j", (change, message) => {
    expect(() => travelPayload({ ...fields, ...change }, [stop], [])).toThrow(
      message,
    );
  });
  it.each(["", "-1", "12.345", "1000000", "NaN"])(
    "rejects invalid price %s",
    (price) => {
      expect(() => travelPayload({ ...fields, price }, [stop], [])).toThrow(
        /Price/,
      );
    },
  );
  it.each(["0", "3.5", "10001"])("rejects invalid capacity %s", (capacity) => {
    expect(() => travelPayload({ ...fields, capacity }, [stop], [])).toThrow(
      /capacity/,
    );
  });
  it("requires a bounded itinerary and all accommodation/activity/transport details", () => {
    expect(() => travelPayload(fields, [], [])).toThrow("between 1 and 30");
    expect(() =>
      travelPayload(
        fields,
        Array.from({ length: 31 }, () => stop),
        [],
      ),
    ).toThrow("between 1 and 30");
    for (const key of [
      "destination",
      "country",
      "activities",
      "accommodation",
      "transportation",
    ] as const)
      expect(() =>
        travelPayload(fields, [{ ...stop, [key]: " " }], []),
      ).toThrow("required");
  });
  it("rejects duplicate memberships and assignments exceeding capacity", () => {
    expect(() => travelPayload(fields, [stop], ["a", "a"])).toThrow(
      "only once",
    );
    expect(() =>
      travelPayload({ ...fields, capacity: "1" }, [stop], ["a", "b"]),
    ).toThrow("Participants exceed capacity");
  });
  it("rejects unsupported state/image choices and invalid edit versions", () => {
    expect(() =>
      travelPayload({ ...fields, status: "REMOVED" }, [stop], []),
    ).toThrow("travel status");
    expect(() =>
      travelPayload({ ...fields, image: "external-url" }, [stop], []),
    ).toThrow("cover image");
    expect(() => travelPayload(fields, [stop], [], -1)).toThrow("Refresh");
  });
});

describe("people editor payload", () => {
  it("normalizes the name/email and preserves the actual password characters", () => {
    expect(
      userPayload({ ...person, password: "  secure password  " }, true),
    ).toEqual({
      ...person,
      name: "New person",
      email: "person@example.test",
      password: "  secure password  ",
    });
  });
  it("omits a blank edit password so changing account details keeps the current password", () => {
    expect(userPayload({ ...person, password: "" }, false)).not.toHaveProperty(
      "password",
    );
  });
  it.each(["", "short", "            "])(
    "requires a usable 12-character password for creation: %j",
    (password) => {
      expect(() => userPayload({ ...person, password }, true)).toThrow(
        "at least 12",
      );
    },
  );
  it("validates replacement passwords and maximum password size", () => {
    expect(() => userPayload({ ...person, password: "short" }, false)).toThrow(
      "at least 12",
    );
    expect(() =>
      userPayload({ ...person, password: "a".repeat(73) }, false),
    ).toThrow("at most 72 UTF-8 bytes");
  });
  it.each([true, false])(
    "preserves passwords at the ASCII and multibyte bcrypt boundary (creating=%s)",
    (creating) => {
      for (const password of ["a".repeat(72), "é".repeat(36)]) {
        expect(userPayload({ ...person, password }, creating).password).toBe(
          password,
        );
      }
    },
  );
  it.each([true, false])(
    "rejects ASCII and multibyte passwords over the byte boundary without truncation (creating=%s)",
    (creating) => {
      for (const password of ["a".repeat(73), "é".repeat(37)]) {
        expect(() => userPayload({ ...person, password }, creating)).toThrow(
          "at most 72 UTF-8 bytes",
        );
      }
    },
  );
  it("supports role/status edits while rejecting unknown privileges and malformed email", () => {
    expect(
      userPayload(
        {
          ...person,
          role: "TRAVEL_MANAGER",
          status: "SUSPENDED",
          password: "",
        },
        false,
      ),
    ).toMatchObject({ role: "TRAVEL_MANAGER", status: "SUSPENDED" });
    expect(() => userPayload({ ...person, role: "OWNER" }, false)).toThrow(
      "valid role",
    );
    expect(() => userPayload({ ...person, status: "DELETED" }, false)).toThrow(
      "account status",
    );
    expect(() =>
      userPayload({ ...person, email: "not an email" }, false),
    ).toThrow("valid email");
  });
});

describe("payment-method editor payload", () => {
  it("maps browser checkbox presence to a boolean and keeps secret fields out of the payload", () => {
    expect(
      gatewayPayload({ ...gateway, secret: "must-not-be-submitted" }),
    ).toEqual({
      name: "Stripe sandbox",
      provider: "STRIPE",
      currency: "USD",
      enabled: true,
    });
    expect(gatewayPayload({ ...gateway, enabled: undefined }).enabled).toBe(
      false,
    );
  });
  it("supports PayPal and currency changes", () => {
    expect(
      gatewayPayload({ ...gateway, provider: "PAYPAL", currency: "EUR" }),
    ).toMatchObject({ provider: "PAYPAL", currency: "EUR" });
  });
  it("rejects incomplete or unsupported gateway configuration", () => {
    expect(() => gatewayPayload({ ...gateway, name: " " })).toThrow(
      "Display name",
    );
    expect(() => gatewayPayload({ ...gateway, provider: "UNKNOWN" })).toThrow(
      "provider",
    );
    expect(() => gatewayPayload({ ...gateway, currency: "XYZ" })).toThrow(
      "currency",
    );
  });
});
