import { describe, expect, it } from "vitest";

import {
  checkoutReturnNoticeState,
  checkoutReturnUrlWithoutStatus,
} from "./checkout-return-notice-state";

describe("checkoutReturnNoticeState", () => {
  it("shows a pending state only for a successful Checkout return", () => {
    expect(checkoutReturnNoticeState("success")).toBe("pending");
  });

  it("shows a warning state when Checkout was cancelled", () => {
    expect(checkoutReturnNoticeState("cancelled")).toBe("cancelled");
  });

  it.each([null, "failed", "successfully"])("hides unknown return state: %s", (checkoutStatus) => {
    expect(checkoutReturnNoticeState(checkoutStatus)).toBeNull();
  });
});

describe("checkoutReturnUrlWithoutStatus", () => {
  it("clears only the temporary Checkout status from the current URL", () => {
    expect(checkoutReturnUrlWithoutStatus("/billing", "checkout=success&tab=history")).toBe(
      "/billing?tab=history",
    );
  });

  it("returns the pathname when Checkout is the only query parameter", () => {
    expect(checkoutReturnUrlWithoutStatus("/billing", "checkout=success")).toBe("/billing");
  });
});
