import { describe, expect, it } from "vitest";

import { getAuthResponseError } from "./auth-form-errors";

describe("getAuthResponseError", () => {
  it("explains that a sign-up email is already registered", () => {
    const error = getAuthResponseError(
      {
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        message: "User already exists. Use another email.",
        status: 422,
      },
      true,
    );

    expect(error).toEqual({
      title: "An account already exists",
      message: "This email is already registered. Sign in instead or use a different email.",
    });
  });

  it("keeps other sign-up failures generic", () => {
    const error = getAuthResponseError(
      { code: "UNABLE_TO_CREATE_USER", message: "Unable to create user.", status: 500 },
      true,
    );

    expect(error).toEqual({
      title: "We could not create your account",
      message: "Check your details or sign in instead.",
    });
  });
});
