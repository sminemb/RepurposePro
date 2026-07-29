import { randomUUID } from "node:crypto";
import { createServer, createConnection, type Server, type Socket } from "node:net";
import { resolve } from "node:path";

import { type VideoAnalysisJobPayload, VIDEO_ANALYSIS_QUEUE_NAME } from "@repurposepro/shared";
import { type ConnectionOptions, Queue, Worker } from "bullmq";
import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "@repurposepro/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BullMqConnectionFactory } from "../infrastructure/bullmq-connection.factory";
import { AnalysisDispatchRepository } from "./analysis-dispatch.repository";
import { AnalysisDispatcherService } from "./analysis-dispatcher.service";
import {
  AnalysisQueueFailureListener,
  createAnalysisQueueEventsClient,
} from "./analysis-queue-failure.listener";
import { BullMqAnalysisQueueGateway } from "./analysis-queue.gateway";
import { ProcessingExecutionLeaseRepository } from "./processing-execution-lease.repository";
import { ProcessingFailureIntentRepository } from "./processing-failure-intent.repository";
import { ProcessingFailureIntentService } from "./processing-failure-intent.service";
import { ProcessingFailureRepository } from "./processing-failure.repository";
import { ProcessingFailureSweeperService } from "./processing-failure-sweeper.service";
import { ProcessingFailureService } from "./processing-failure.service";

const bootstrapUrl = process.env.TEST_DATABASE_BOOTSTRAP_URL;
const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_RUNTIME_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeIntegration =
  bootstrapUrl && migrationUrl && runtimeUrl && redisUrl ? describe : describe.skip;
const skippedDatabaseUrl = "postgresql://localhost/postgres";

function withDatabase(url: string | undefined, database: string): string {
  const target = new URL(url ?? skippedDatabaseUrl);
  target.pathname = `/${database}`;
  target.search = "";
  return target.toString();
}

function withRole(url: string | undefined, role: string): string {
  const target = new URL(url ?? skippedDatabaseUrl);
  target.username = role;
  return target.toString();
}

function createClient(connectionString: string): DatabaseClient {
  return createDatabaseClient({ connectionString, poolMax: 2, ssl: false });
}

describeIntegration("processing recovery across PostgreSQL and Redis", () => {
  const database = `repurposepro_recovery_${randomUUID().replaceAll("-", "")}`;
  const prefix = `repurposepro-recovery-${randomUUID()}`;
  const adminClient = createClient(bootstrapUrl ?? skippedDatabaseUrl);
  const migrationClient = createClient(withDatabase(migrationUrl, database));
  const processingClientA = createClient(
    withDatabase(withRole(runtimeUrl, "repurposepro_processing"), database),
  );
  const processingClientB = createClient(
    withDatabase(withRole(runtimeUrl, "repurposepro_processing"), database),
  );
  const inspectionConnection = new Redis(redisUrl ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
  });
  const inspectionQueue = new Queue<VideoAnalysisJobPayload>(VIDEO_ANALYSIS_QUEUE_NAME, {
    connection: inspectionConnection as unknown as ConnectionOptions,
    prefix,
  });
  const factory = connectionFactory(redisUrl ?? "redis://localhost:6379");
  const gateway = analysisGateway(factory, prefix);
  const dispatcher = createDispatcher(processingClientA, gateway, "dispatcher-a");

  beforeAll(async () => {
    inspectionConnection.on("error", () => undefined);
    const runtimePassword = decodeURIComponent(new URL(runtimeUrl ?? skippedDatabaseUrl).password);
    await adminClient.pool.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_checkout') THEN
           CREATE ROLE repurposepro_checkout LOGIN;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_webhook') THEN
           CREATE ROLE repurposepro_webhook LOGIN;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_processing') THEN
           CREATE ROLE repurposepro_processing LOGIN;
         END IF;
       END;
       $$`,
    );
    for (const role of [
      "repurposepro_checkout",
      "repurposepro_webhook",
      "repurposepro_processing",
    ]) {
      const statement = await adminClient.pool.query<{ sql: string }>(
        "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql",
        [role, runtimePassword],
      );
      await adminClient.pool.query(statement.rows[0]!.sql);
    }
    await adminClient.pool.query(`CREATE DATABASE ${database} OWNER repurposepro_owner`);
    await migrate(migrationClient.db, {
      migrationsFolder: resolve(process.cwd(), "packages/db/drizzle"),
    });
    await migrationClient.pool.query(
      `INSERT INTO users (id, name, email)
       VALUES ('recovery-user', 'Recovery User', 'recovery@example.test')`,
    );
    await migrationClient.pool.query(
      `INSERT INTO credit_ledger (user_id, type, amount, description, idempotency_key)
       VALUES ('recovery-user', 'manual_adjustment', 500, 'Recovery credits', 'recovery-credit')`,
    );
    await inspectionQueue.waitUntilReady();
  }, 30_000);

  afterAll(async () => {
    await inspectionQueue.obliterate({ force: true });
    await gateway.onModuleDestroy();
    await factory.onModuleDestroy();
    await inspectionQueue.close();
    await inspectionConnection.quit();
    await closeDatabaseClient(processingClientA);
    await closeDatabaseClient(processingClientB);
    await closeDatabaseClient(migrationClient);
    await adminClient.pool.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await closeDatabaseClient(adminClient);
  });

  it("fails fast during a real disconnect and publishes after recovery in the same process", async () => {
    const proxy = new RedisTcpProxy(redisUrl!);
    await proxy.start();
    const proxyFactory = connectionFactory(proxy.url);
    const proxyGateway = analysisGateway(proxyFactory, `${prefix}-proxy`);
    const proxyDispatcher = createDispatcher(processingClientA, proxyGateway, "dispatcher-proxy");
    const proxyInspectionConnection = new Redis(redisUrl!, { maxRetriesPerRequest: 1 });
    const proxyInspectionQueue = new Queue<VideoAnalysisJobPayload>(VIDEO_ANALYSIS_QUEUE_NAME, {
      connection: proxyInspectionConnection as unknown as ConnectionOptions,
      prefix: `${prefix}-proxy`,
    });
    const started = await startPaidAnalysis("Redis outage");

    try {
      await proxyGateway.inspect({ jobId: started.jobId, projectId: started.projectId });
      await proxy.stop();

      await expect(proxyDispatcher.dispatchPending("outage")).resolves.toBe(0);
      await expect(dispatchState(started.jobId)).resolves.toMatchObject({
        status: "pending",
      });

      await proxy.start();
      await waitFor(async () => {
        await migrationClient.pool.query(
          `UPDATE processing_job_dispatches
           SET next_attempt_at = now()
           WHERE processing_job_id = $1`,
          [started.jobId],
        );
        return (await proxyDispatcher.dispatchPending("recovered")) === 1;
      });

      await expect(proxyInspectionQueue.getJob(started.jobId)).resolves.toMatchObject({
        data: { jobId: started.jobId, projectId: started.projectId },
        id: started.jobId,
      });
      await expect(financialCounts(started.jobId)).resolves.toMatchObject({
        deductions: 1,
        jobs: 1,
      });
    } finally {
      await proxyInspectionQueue.obliterate({ force: true });
      await proxyGateway.onModuleDestroy();
      await proxyFactory.onModuleDestroy();
      await proxyInspectionQueue.close();
      await proxyInspectionConnection.quit();
      await proxy.stop();
    }
  }, 20_000);

  it("restores one stale published queued job while two reconcilers race", async () => {
    const started = await startPaidAnalysis("Published stale queue job");
    await migrationClient.pool.query(
      `UPDATE processing_job_dispatches
       SET status = 'published',
           bullmq_job_id = $2,
           published_at = now() - interval '1 hour',
           next_attempt_at = now()
       WHERE processing_job_id = $1`,
      [started.jobId, started.jobId],
    );
    await migrationClient.pool.query(
      "UPDATE processing_jobs SET bullmq_job_id = $2 WHERE id = $1",
      [started.jobId, started.jobId],
    );
    const secondFactory = connectionFactory(redisUrl!);
    const secondGateway = analysisGateway(secondFactory, prefix);
    const secondDispatcher = createDispatcher(processingClientB, secondGateway, "dispatcher-b");

    try {
      const results = await Promise.all([
        dispatcher.dispatchPending("reconcile-a"),
        secondDispatcher.dispatchPending("reconcile-b"),
      ]);

      expect(results.reduce((sum, count) => sum + count, 0)).toBe(1);
      await expect(inspectionQueue.getJob(started.jobId)).resolves.toBeDefined();
      await expect(inspectionQueue.getJobCounts("waiting")).resolves.toMatchObject({
        waiting: 1,
      });

      await migrationClient.pool.query(
        `UPDATE processing_job_dispatches
         SET next_attempt_at = now()
         WHERE processing_job_id = $1`,
        [started.jobId],
      );
      await expect(dispatcher.dispatchPending("matching-job")).resolves.toBe(1);
      await expect(inspectionQueue.getJobCounts("waiting")).resolves.toMatchObject({
        waiting: 1,
      });
    } finally {
      await secondGateway.onModuleDestroy();
      await secondFactory.onModuleDestroy();
    }
  });

  it("waits on a valid active lease, then refunds once after that lease expires", async () => {
    const started = await startPaidAnalysis("Active lease recovery");
    await dispatcher.dispatchJob(started.jobId, "initial-publish");
    await inspectionQueue.getJob(started.jobId).then((job) => job?.remove());
    await migrationClient.pool.query(
      `UPDATE processing_jobs
       SET status = 'active',
           execution_lease_token = gen_random_uuid(),
           execution_lease_owner = 'worker-test',
           execution_lease_expires_at = now() + interval '1 minute',
           execution_heartbeat_at = now()
       WHERE id = $1`,
      [started.jobId],
    );
    await migrationClient.pool.query(
      `UPDATE processing_job_dispatches SET next_attempt_at = now()
       WHERE processing_job_id = $1`,
      [started.jobId],
    );

    await expect(dispatcher.dispatchPending("valid-lease")).resolves.toBe(1);
    await expect(inspectionQueue.getJob(started.jobId)).resolves.toBeUndefined();
    await expect(financialCounts(started.jobId)).resolves.toMatchObject({ refunds: 0 });

    await migrationClient.pool.query(
      `UPDATE processing_jobs
       SET execution_lease_expires_at = now() - interval '1 second'
       WHERE id = $1`,
      [started.jobId],
    );
    await migrationClient.pool.query(
      `UPDATE processing_job_dispatches SET next_attempt_at = now()
       WHERE processing_job_id = $1`,
      [started.jobId],
    );
    await expect(dispatcher.dispatchPending("expired-lease")).resolves.toBe(1);

    await waitFor(async () => (await financialCounts(started.jobId)).refunds === 1);
    await expect(financialCounts(started.jobId)).resolves.toMatchObject({
      refunds: 1,
      status: "refunded",
    });
  });

  it("persists and finalizes a real exhausted BullMQ Worker failure exactly once", async () => {
    const started = await startPaidAnalysis("Worker terminal failure");
    const eventConnection = factory.createBlockingConsumer();
    const queueEvents = createAnalysisQueueEventsClient(eventConnection, prefix, (connection) =>
      factory.close(connection),
    );
    const bundle = processingFailureBundle(processingClientA, "event-sweeper");
    const listener = new AnalysisQueueFailureListener(
      bundle.intentService,
      new ProcessingExecutionLeaseRepository({
        database: processingClientA,
      }),
      queueEvents,
    );
    const workerConnection = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    workerConnection.on("error", () => undefined);
    const worker = new Worker<VideoAnalysisJobPayload>(
      VIDEO_ANALYSIS_QUEUE_NAME,
      async (job) => {
        if (job.id === started.jobId) {
          throw new Error("expected worker failure");
        }
      },
      {
        connection: workerConnection as unknown as ConnectionOptions,
        prefix,
      },
    );

    try {
      await listener.onModuleInit();
      await worker.waitUntilReady();
      await dispatcher.dispatchJob(started.jobId, "worker-failure");
      await waitFor(async () => (await financialCounts(started.jobId)).refunds === 1);

      await expect(financialCounts(started.jobId)).resolves.toMatchObject({
        refunds: 1,
        status: "refunded",
      });
      await waitFor(async () => (await failureIntentStatus(started.jobId)) === "finalized");
      await expect(failureIntentStatus(started.jobId)).resolves.toBe("finalized");
    } finally {
      await worker.close();
      await workerConnection.quit();
      await listener.onModuleDestroy();
      bundle.sweeper.onModuleDestroy();
    }
  }, 20_000);

  it("recovers a retained failed job when the Redis failure event was never observed", async () => {
    const started = await startPaidAnalysis("Lost queue event");
    const workerConnection = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    workerConnection.on("error", () => undefined);
    const worker = new Worker<VideoAnalysisJobPayload>(
      VIDEO_ANALYSIS_QUEUE_NAME,
      async (job) => {
        if (job.id === started.jobId) {
          throw new Error("expected unobserved worker failure");
        }
      },
      {
        connection: workerConnection as unknown as ConnectionOptions,
        prefix,
      },
    );

    try {
      await worker.waitUntilReady();
      await dispatcher.dispatchJob(started.jobId, "lost-event-publish");
      await waitFor(async () => {
        const job = await inspectionQueue.getJob(started.jobId);
        return (await job?.getState()) === "failed";
      });
      await migrationClient.pool.query(
        `UPDATE processing_job_dispatches
         SET next_attempt_at = now()
         WHERE processing_job_id = $1`,
        [started.jobId],
      );

      await expect(dispatcher.dispatchPending("lost-event-reconcile")).resolves.toBe(1);
      await waitFor(async () => (await financialCounts(started.jobId)).refunds === 1);
      await expect(financialCounts(started.jobId)).resolves.toMatchObject({
        refunds: 1,
        status: "refunded",
      });
    } finally {
      await worker.close();
      await workerConnection.quit();
    }
  }, 20_000);

  function createDispatcher(
    client: DatabaseClient,
    queueGateway: BullMqAnalysisQueueGateway,
    dispatcherId: string,
  ): AnalysisDispatcherService {
    const repository = new AnalysisDispatchRepository({
      database: client,
    });
    const bundle = processingFailureBundle(client, `${dispatcherId}-sweeper`);
    return new AnalysisDispatcherService(
      repository,
      queueGateway,
      { dispatcherId, intervalMs: 60_000, maxBatchSize: 10 },
      bundle.intentService,
    );
  }

  function processingFailureBundle(client: DatabaseClient, sweeperId: string) {
    const intentRepository = new ProcessingFailureIntentRepository({
      database: client,
    });
    const failureService = new ProcessingFailureService(
      new ProcessingFailureRepository({ database: client }),
    );
    const sweeper = new ProcessingFailureSweeperService(intentRepository, failureService, {
      intervalMs: 60_000,
      maxBatchSize: 10,
      sweeperId,
    });
    const intentService = new ProcessingFailureIntentService(intentRepository, sweeper);
    return { intentService, sweeper };
  }

  async function startPaidAnalysis(name: string): Promise<{ jobId: string; projectId: string }> {
    const projectId = randomUUID();
    await migrationClient.pool.query(
      `INSERT INTO projects (id, user_id, name, output_type, status)
       VALUES ($1, 'recovery-user', $2, 'clips', 'uploaded')`,
      [projectId, name],
    );
    await migrationClient.pool.query(
      `INSERT INTO uploaded_videos (
        project_id, original_file_name, storage_path, mime_type, file_size_bytes,
        duration_seconds, width, height, has_audio, expires_at
      )
      VALUES ($1, $2, $3, 'video/mp4', 1024, 600.001, 1920, 1080, true, now() + interval '7 days')`,
      [projectId, `${projectId}.mp4`, `/private/${projectId}.mp4`],
    );
    const result = await processingClientA.pool.query<{ jobId: string }>(
      `SELECT job_id AS "jobId"
       FROM public.start_paid_video_analysis($1, $2)`,
      ["recovery-user", projectId],
    );
    return { jobId: result.rows[0]!.jobId, projectId };
  }

  async function dispatchState(jobId: string): Promise<{ status: string }> {
    const result = await migrationClient.pool.query<{ status: string }>(
      `SELECT status::text AS status
       FROM processing_job_dispatches
       WHERE processing_job_id = $1`,
      [jobId],
    );
    return result.rows[0]!;
  }

  async function financialCounts(jobId: string): Promise<{
    deductions: number;
    jobs: number;
    refunds: number;
    status: string;
  }> {
    const result = await migrationClient.pool.query<{
      deductions: number;
      jobs: number;
      refunds: number;
      status: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE ledger.type = 'processing_deduction')::integer AS deductions,
        COUNT(DISTINCT job.id)::integer AS jobs,
        COUNT(*) FILTER (WHERE ledger.type = 'refund')::integer AS refunds,
        job.status::text AS status
       FROM processing_jobs AS job
       LEFT JOIN credit_ledger AS ledger ON ledger.processing_job_id = job.id
       WHERE job.id = $1
       GROUP BY job.status`,
      [jobId],
    );
    return result.rows[0]!;
  }

  async function failureIntentStatus(jobId: string): Promise<string | undefined> {
    const result = await migrationClient.pool.query<{ status: string }>(
      `SELECT status::text AS status
       FROM processing_failure_intents
       WHERE processing_job_id = $1`,
      [jobId],
    );
    return result.rows[0]?.status;
  }
});

function connectionFactory(targetRedisUrl: string): BullMqConnectionFactory {
  return new BullMqConnectionFactory({
    createClient: (url, options) => new Redis(url, options),
    random: () => 0.5,
    redisUrl: targetRedisUrl,
  });
}

function analysisGateway(
  factory: BullMqConnectionFactory,
  prefix: string,
): BullMqAnalysisQueueGateway {
  const connection = factory.createProducer();
  return new BullMqAnalysisQueueGateway(connection, prefix, undefined, (ownedConnection) =>
    factory.close(ownedConnection),
  );
}

async function waitFor(assertion: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await assertion()) {
        return;
      }
    } catch {
      // The bounded retry covers expected transient infrastructure recovery.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error("Timed out waiting for the recovery condition.");
}

class RedisTcpProxy {
  private readonly activeSockets = new Set<Socket>();
  private readonly target: URL;
  private port = 0;
  private server: Server | undefined;

  public constructor(targetUrl: string) {
    this.target = new URL(targetUrl);
  }

  public get url(): string {
    const proxyUrl = new URL(this.target);
    proxyUrl.hostname = "127.0.0.1";
    proxyUrl.port = String(this.port);
    return proxyUrl.toString();
  }

  public async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((downstream) => {
      const upstream = createConnection({
        host: this.target.hostname,
        port: Number(this.target.port || 6379),
      });
      this.track(downstream);
      this.track(upstream);
      downstream.pipe(upstream).pipe(downstream);
    });
    await new Promise<void>((resolvePromise, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, "127.0.0.1", () => {
        this.server!.off("error", reject);
        const address = this.server!.address();
        if (typeof address === "object" && address) {
          this.port = address.port;
        }
        resolvePromise();
      });
    });
  }

  public async stop(): Promise<void> {
    for (const socket of this.activeSockets) {
      socket.destroy();
    }
    this.activeSockets.clear();

    const current = this.server;
    this.server = undefined;
    if (!current) {
      return;
    }
    await new Promise<void>((resolvePromise) => {
      current.close(() => resolvePromise());
    });
  }

  private track(socket: Socket): void {
    this.activeSockets.add(socket);
    socket.once("close", () => this.activeSockets.delete(socket));
    socket.on("error", () => undefined);
  }
}
