import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createTransactionalEmailSender } from "./transactional-email";

afterEach(() => vi.unstubAllGlobals());

describe("transactional account email", () => {
  it.each(["current", "approval", "new"] as const)(
    "sends a %s message with text and escaped HTML",
    async (kind) => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "delivery-1" }));
      vi.stubGlobal("fetch", fetchMock);
      const send = createTransactionalEmailSender({
        apiKey: "re_private",
        from: "account@example.com",
      });
      await send({
        kind,
        to: "creator@example.com",
        url: "https://app.example.com/verify?token=private&callback=x",
      });
      const [endpoint, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(endpoint).toBe("https://api.resend.com/emails");
      const body = JSON.parse(options.body as string) as {
        text: string;
        html: string;
        to: string[];
      };
      expect(body.text).toContain("https://app.example.com/verify?token=private&callback=x");
      expect(body.html).toContain("&amp;callback=x");
      expect(body.to).toEqual(["creator@example.com"]);
      expect(options.redirect).toBe("error");
    },
  );

  it.each([400, 429, 500])("sanitizes provider errors (%i)", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("secret-provider-response", { status })),
    );
    const send = createTransactionalEmailSender({
      apiKey: "re_private",
      from: "account@example.com",
    });
    await expect(
      send({ kind: "approval", to: "creator@example.com", url: "https://app.example.com" }),
    ).rejects.toThrow("We could not send the email. Please try again.");
  });

  it("sanitizes network failures and refuses sending without configuration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-network-error")));
    const input = {
      kind: "current",
      to: "creator@example.com",
      url: "https://app.example.com",
    } as const;
    await expect(
      createTransactionalEmailSender({ apiKey: "re_private", from: "account@example.com" })(input),
    ).rejects.toThrow("We could not send the email. Please try again.");
    await expect(createTransactionalEmailSender(null)(input)).rejects.toThrow(
      "Email delivery is unavailable",
    );
  });
});
