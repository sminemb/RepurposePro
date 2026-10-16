import { describe, expect, it } from "vitest";

import { validatePasswordConfirmation } from "./validation";

describe("password confirmation", () => {
  it("requires both fields and an exact match", () => {
    expect(validatePasswordConfirmation("", "")).toContain("Complete");
    expect(validatePasswordConfirmation("password123", "")).toContain("Complete");
    expect(validatePasswordConfirmation("password123", "different123")).toContain("match");
    expect(validatePasswordConfirmation(" password123", "password123")).toContain("match");
  });

  it("accepts the password length boundaries without trimming", () => {
    for (const password of ["a".repeat(8), "a".repeat(128), " password "])
      expect(validatePasswordConfirmation(password, password)).toBeNull();
    for (const password of ["a".repeat(7), "a".repeat(129)])
      expect(validatePasswordConfirmation(password, password)).toContain("8 and 128");
  });
});
