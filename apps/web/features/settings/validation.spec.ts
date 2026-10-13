import { describe, expect, it } from "vitest";

import { validateEmail, validateName, validatePassword } from "./validation";

describe("Settings validation", () => {
  it("rejects empty names and trims valid names", () => {
    expect(validateName("  ")).toBeTruthy();
    expect(validateName("  Creator  ")).toBeNull();
  });

  it("rejects invalid and unchanged email addresses", () => {
    expect(validateEmail("invalid", "old@example.com")).toBeTruthy();
    expect(validateEmail(" OLD@example.com ", "old@example.com")).toBeTruthy();
    expect(validateEmail("new@example.com", "old@example.com")).toBeNull();
  });

  it("requires all password fields and matching new values", () => {
    expect(validatePassword("", "12345678", "12345678")).toBeTruthy();
    expect(validatePassword("current", "", "")).toBeTruthy();
    expect(validatePassword("current", "12345678", "87654321")).toBeTruthy();
  });

  it.each([7, 129])("rejects a new password of %i characters", (length) => {
    const password = "p".repeat(length);
    expect(validatePassword("current", password, password)).toBeTruthy();
  });

  it.each([8, 128])("accepts a new password of %i characters", (length) => {
    const password = "p".repeat(length);
    expect(validatePassword("current", password, password)).toBeNull();
  });
});
