import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminDetail, AdminTable } from "./admin-views";

describe("admin record rendering", () => {
  it("preserves filters in next-page navigation and renders explicit empty states", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminTable, {
        collection: "jobs",
        page: { data: [], meta: { nextCursor: "next-cursor" } },
        href: "/admin/jobs?status=failed&userId=user-a",
      }),
    );
    expect(markup).toContain("No jobs found.");
    expect(markup).toContain("status=failed&amp;userId=user-a&amp;cursor=next-cursor");
  });
  it("never renders fields outside the detail allowlist", () => {
    const record = {
      id: "u",
      name: "Operator",
      email: "operator@example.test",
      createdAt: "2026-10-10T12:00:00Z",
      updatedAt: "2026-10-10T12:00:00Z",
      errorMessage: "SECRET_ERROR",
      transcript: "SECRET_CONTENT",
    };
    const markup = renderToStaticMarkup(createElement(AdminDetail, { record }));
    expect(markup).toContain("operator@example.test");
    expect(markup).not.toContain("SECRET");
  });
});
