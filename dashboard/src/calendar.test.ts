import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calendarAgenda,
  calendarDateKey,
  calendarPeriod,
  moveCalendarMonth,
  travelsInPeriod,
} from "./calendar";
import type { Travel } from "./types";

const trip = (id: string, start: string, end: string, status = "PUBLISHED") =>
  ({ id, start_date: start, end_date: end, status }) as Travel;
afterEach(() => vi.unstubAllEnvs());

describe("calendar navigation and grouping", () => {
  it("moves safely from month-end across year boundaries without skipping a month", () => {
    const next = moveCalendarMonth(new Date(2027, 11, 31), 1);
    const previous = moveCalendarMonth(new Date(2028, 0, 31), -1);
    expect(calendarDateKey(next, next.getDate())).toBe("2028-01-01");
    expect(calendarDateKey(previous, previous.getDate())).toBe("2027-12-01");
  });
  it("uses leap-year month boundaries and selected-day ranges", () => {
    const month = new Date(2028, 1, 1);
    expect(calendarPeriod(month, null)).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    expect(calendarPeriod(month, 29)).toEqual({
      start: "2028-02-29",
      end: "2028-02-29",
    });
    expect(() => calendarPeriod(new Date(2027, 1, 1), 29)).toThrow(
      "outside this month",
    );
  });
  it("keeps date-only calendar days local in a UTC+14 timezone", () => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
    expect(calendarPeriod(new Date(2028, 0, 1, 12), 1)).toEqual({
      start: "2028-01-01",
      end: "2028-01-01",
    });
  });
  it("includes overlapping journeys at both inclusive boundaries and excludes archived/outside records", () => {
    const travels = [
      trip("ends-on-start", "2028-01-29", "2028-02-01"),
      trip("starts-on-end", "2028-02-29", "2028-03-02"),
      trip("spans-month", "2028-01-01", "2028-03-01"),
      trip("archived", "2028-02-10", "2028-02-15", "ARCHIVED"),
      trip("outside", "2028-03-01", "2028-03-05"),
    ];
    expect(
      calendarAgenda(travels, new Date(2028, 1, 1), null).map((t) => t.id),
    ).toEqual(["ends-on-start", "starts-on-end", "spans-month"]);
    expect(
      calendarAgenda(travels, new Date(2028, 1, 1), 29).map((t) => t.id),
    ).toEqual(["starts-on-end", "spans-month"]);
  });
  it("uses the same date-only grouping for the grid and agenda", () => {
    const travels = [
      trip("same-day", "2028-02-29T00:00:00", "2028-02-29T00:00:00"),
      trip("later", "2028-03-01", "2028-03-03"),
    ];
    expect(travelsInPeriod(travels, "2028-02-29").map((t) => t.id)).toEqual([
      "same-day",
    ]);
    expect(calendarAgenda(travels, new Date(2028, 1, 1), 29)).toEqual(
      travelsInPeriod(travels, "2028-02-29"),
    );
  });
});
