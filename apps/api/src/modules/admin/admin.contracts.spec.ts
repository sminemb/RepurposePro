import { describe, expect, it } from "vitest";
import {
  decodeAdminCursor,
  encodeAdminCursor,
  parseAdminList,
  parseAdminSearch,
  parseAdminRange,
} from "./admin.contracts";
describe("admin read contracts", () => {
  it("defaults and validates historical ranges", () => {
    expect(parseAdminRange({})).toBe("30d");
    for (const range of ["7d", "30d", "90d"]) expect(parseAdminRange({ range })).toBe(range);
    expect(() => parseAdminRange({ range: "1d" })).toThrow();
  });
  it("bounds input and accepts only exact lookup values", () => {
    expect(parseAdminSearch({ q: " Operator@Example.com " })).toBe("Operator@Example.com");
    expect(parseAdminSearch({ q: "user_opaque-1" })).toBe("user_opaque-1");
    for (const q of ["", "  ", "partial name", "x".repeat(321)])
      expect(() => parseAdminSearch({ q })).toThrow();
  });
  it("validates endpoint-specific filters and stable cursors", () => {
    expect(parseAdminList("users", {})).toMatchObject({ limit: 20 });
    expect(() => parseAdminList("users", { limit: 51 })).toThrow();
    expect(() => parseAdminList("jobs", { status: "paid" })).toThrow();
    expect(() => parseAdminList("payments", { status: "active" })).toThrow();
    expect(() => parseAdminList("ledger", {})).toThrow();
    expect(() => parseAdminList("users", { userId: "u" })).toThrow();
    const cursor = { createdAt: "2026-10-10T10:00:00.123456Z", id: "opaque" };
    expect(decodeAdminCursor(encodeAdminCursor(cursor))).toEqual(cursor);
    expect(parseAdminList("users", { cursor: encodeAdminCursor(cursor) }).cursor).toEqual(cursor);
    for (const collection of ["projects", "jobs", "payments", "ledger"] as const)
      expect(() =>
        parseAdminList(collection, { userId: "u", cursor: encodeAdminCursor(cursor) }),
      ).toThrow();
    for (const value of ["!", "e30", "a".repeat(1025)])
      expect(() => decodeAdminCursor(value)).toThrow();
  });
});
