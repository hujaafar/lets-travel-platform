import { describe, it, expect } from "vitest";
import {
  csvCell,
  matchesTravel,
  date,
  initials,
  money,
  type Travel,
} from "./types";
describe("workspace utilities", () => {
  it("escapes spreadsheet formula cells", () => {
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("searches destination names and countries", () => {
    const t = {
      title: "The passage",
      stops: [{ destination: "Kyoto", country: "Japan" }],
    } as Travel;
    expect(matchesTravel(t, "japan")).toBe(true);
    expect(matchesTravel(t, "Paris")).toBe(false);
  });
  it("keeps date-only values on the intended calendar day", () => {
    expect(date("2026-10-08")).toBe("Oct 8");
  });
  it("formats an avatar", () => {
    expect(initials("Workspace admin")).toBe("WA");
  });
  it("shows saved price cents without rounding the displayed amount to dollars", () => {
    expect(money(1234.56)).toBe("$1,234.56");
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(1234)).toBe("$1,234");
    expect(money(0)).toBe("$0");
  });
});
