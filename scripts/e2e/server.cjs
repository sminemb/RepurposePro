// Test-only bootstrap: normal app entrypoints never load this module.
const { createRequire } = require("node:module");
const { createServer } = require("node:http");
const { randomUUID } = require("node:crypto");
const { join, resolve } = require("node:path");
const { readFile, writeFile } = require("node:fs/promises");
const root = resolve(__dirname, "../..");
const apiRequire = createRequire(join(root, "apps/api/package.json"));
apiRequire("reflect-metadata");
const { Test } = apiRequire("@nestjs/testing");
const { Logger } = apiRequire("nestjs-pino");
const { loadApiConfig, loadWorkerConfig } = apiRequire("@repurposepro/config");
const api = (file) => require(join(root, "apps/api/dist", file));
const worker = (file) => require(join(root, "apps/worker/dist", file));
const allowed = { isDenied: () => false, isErrored: () => false, conclusion: "ALLOW" };

if (process.env.APP_ENV !== "test" || !process.env.E2E_RUN_ROOT) {
  throw new Error("This bootstrap requires an isolated E2E test environment.");
}

async function startApi() {
  // Retain real guards, authentication, policies and outcome logging; replace the remote SDK boundary.
  api("common/protection/arcjet-client.js").createProtectionClient = () => ({
    protect: async () => allowed,
  });
  const Stripe = apiRequire("stripe");
  const config = loadApiConfig();
  const sessions = new Map();
  const events = new Map();
  const { STRIPE_CHECKOUT_GATEWAY } = api("modules/billing/checkout.service.js");
  const { STRIPE_WEBHOOK_GATEWAY, StripeWebhookGateway } = api(
    "modules/billing/stripe-webhook.gateway.js",
  );
  const gateway = new StripeWebhookGateway();
  const moduleRef = await Test.createTestingModule({ imports: [api("app.module.js").AppModule] })
    .overrideProvider(STRIPE_CHECKOUT_GATEWAY)
    .useValue({
      createSession: async (request) => {
        const id = `cs_test_${randomUUID().replaceAll("-", "")}`;
        sessions.set(id, {
          id,
          client_reference_id: request.userId,
          metadata: { checkoutAttemptId: request.attemptId },
          amount_total: 1000,
          currency: "usd",
          livemode: false,
          mode: "payment",
          payment_status: "paid",
          status: "complete",
          payment_intent: `pi_${id}`,
          line_items: { data: [{ quantity: 1, price: { id: request.priceId } }] },
        });
        return {
          id,
          expires_at: Math.floor(Date.now() / 1000) + 1800,
          url: `https://checkout.stripe.com/c/pay/${id}`,
        };
      },
    })
    .overrideProvider(STRIPE_WEBHOOK_GATEWAY)
    .useValue({
      constructEvent: (...args) => gateway.constructEvent(...args),
      retrieveCheckoutSession: async (id) => {
        if (!sessions.has(id)) throw new Error("Unknown fixture purchase.");
        return sessions.get(id);
      },
    })
    .compile();
  const app = moduleRef.createNestApplication({ rawBody: true, bufferLogs: true });
  app.useBodyParser("json", { limit: "2mb" });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api/v1");
  app.enableCors(api("cors.config.js").apiCorsOptions(config.appUrl));
  await app.listen(config.apiPort, "127.0.0.1");
  async function deliver(id) {
    if (!sessions.has(id)) throw new Error("Unknown fixture purchase.");
    const event = events.get(id) ?? {
      id: `evt_${id}`,
      type: "checkout.session.completed",
      data: { object: { id } },
    };
    events.set(id, event);
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: config.stripe.webhookSecret,
    });
    const response = await fetch(`http://127.0.0.1:${config.apiPort}/api/v1/billing/webhook`, {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json", "stripe-signature": signature },
    });
    if (!response.ok) throw new Error(`Fixture webhook failed: ${response.status}`);
  }
  const fixture = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://fixture");
      if (url.pathname === "/ready") {
        response.end("ready");
        return;
      }
      const match = /^\/(checkout|complete|replay)\/(cs_test_[a-f0-9]+)$/.exec(url.pathname);
      if (!match || !sessions.has(match[2])) {
        response.writeHead(404).end();
        return;
      }
      if (match[1] === "checkout" && request.method === "GET") {
        response.setHeader("content-type", "text/html");
        response.end(
          `<html lang="en"><title>Test Checkout</title><h1>Stripe provider fixture</h1><form method="post" action="/complete/${match[2]}"><button>Complete test payment</button></form></html>`,
        );
      } else if (request.method === "POST") {
        const control = JSON.parse(
          await readFile(join(process.env.E2E_RUN_ROOT, "control.json"), "utf8"),
        );
        if (match[1] === "complete" && control.purchaseDelayMs)
          setTimeout(
            () => void deliver(match[2]).catch(() => response.destroy()),
            control.purchaseDelayMs,
          );
        else await deliver(match[2]);
        if (match[1] === "replay") response.end("replayed");
        else response.writeHead(303, { location: config.stripe.successUrl }).end();
      } else response.writeHead(405).end();
    } catch {
      response.writeHead(500).end("Fixture action failed.");
    }
  });
  await new Promise((resolve) =>
    fixture.listen(Number(process.env.E2E_FIXTURE_PORT), "127.0.0.1", resolve),
  );
  process.on("SIGTERM", async () => {
    fixture.close();
    await app.close();
    process.exit(0);
  });
}

async function startWorker() {
  const config = loadWorkerConfig();
  const client = {
    generateContent: async (request) => {
      const control = JSON.parse(
        await readFile(join(process.env.E2E_RUN_ROOT, "control.json"), "utf8"),
      );
      if (control.failAnalysis) throw new Error("Deterministic provider failure.");
      if (control.analysisDelayMs)
        await new Promise((resolve) => setTimeout(resolve, control.analysisDelayMs));
      const summary = request.config.responseJsonSchema.properties.summarySegments;
      return {
        text: JSON.stringify(
          summary
            ? {
                summarySegments: [
                  { startTime: 1, endTime: 4, reason: "Context" },
                  { startTime: 30, endTime: 33, reason: "Conclusion" },
                ],
              }
            : {
                primary: [
                  {
                    startTime: 0,
                    endTime: 16,
                    title: "Opening idea",
                    reason: "Clear opening",
                    score: 0.9,
                  },
                  {
                    startTime: 25,
                    endTime: 41,
                    title: "Conclusion",
                    reason: "Clear conclusion",
                    score: 0.8,
                  },
                ],
                backup: [],
              },
        ),
      };
    },
  };
  const { GeminiClipSelector } = worker("services/gemini-clip-selector.service.js");
  const { GeminiSummarySelector } = worker("services/gemini-summary-selector.service.js");
  const moduleRef = await Test.createTestingModule({ imports: [worker("app.module.js").AppModule] })
    .overrideProvider(worker("services/whisper-transcriber.service.js").WhisperTranscriber)
    .useValue({
      transcribe: async () => ({
        durationSeconds: 60,
        language: "en",
        text: "An opening idea and a conclusion.",
        segments: [
          {
            sequence: 0,
            startSeconds: 0,
            endSeconds: 15,
            text: "An opening idea for creators.",
            words: null,
          },
          {
            sequence: 1,
            startSeconds: 25,
            endSeconds: 40,
            text: "A useful conclusion for creators.",
            words: null,
          },
        ],
      }),
    })
    .overrideProvider(GeminiClipSelector)
    .useValue(new GeminiClipSelector(client, config.gemini))
    .overrideProvider(GeminiSummarySelector)
    .useValue(new GeminiSummarySelector(client, config.gemini))
    .compile();
  await moduleRef.init();
  await writeFile(join(process.env.E2E_RUN_ROOT, "worker-ready"), "ready");
  process.on("SIGTERM", async () => {
    await moduleRef.close();
    process.exit(0);
  });
}
(process.argv[2] === "api" ? startApi() : startWorker()).catch((error) => {
  console.error(error);
  process.exit(1);
});
