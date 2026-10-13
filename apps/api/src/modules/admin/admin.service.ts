import { Injectable } from "@nestjs/common";
import type {
  AdminCollection,
  AdminOverview,
  AdminPage,
  AdminRange,
  AdminRecords,
  AdminSearchResult,
  AdminUserDetail,
} from "@repurposepro/shared";
import { AdminDatabaseService } from "./admin-database.service";
import { encodeAdminCursor, type AdminListInput } from "./admin.contracts";

const definitions = {
  users: { table: "users", columns: ["id", "name", "email", "created_at", "updated_at"] },
  projects: {
    table: "projects",
    columns: [
      "id",
      "user_id",
      "output_type",
      "status",
      "current_job_id",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  jobs: {
    table: "admin_job_metadata",
    columns: [
      "id",
      "user_id",
      "project_id",
      "type",
      "status",
      "step",
      "error_code",
      "attempt_count",
      "started_at",
      "completed_at",
      "created_at",
      "updated_at",
    ],
  },
  payments: {
    table: "stripe_payments",
    columns: ["id", "user_id", "amount_cents", "currency", "status", "created_at"],
  },
  ledger: { table: "credit_ledger", columns: ["id", "user_id", "type", "amount", "created_at"] },
} as const;

// Only server-authored identifiers enter SQL; request values always use parameters.
function projection(collection: AdminCollection): string {
  return definitions[collection].columns
    .map((column) => {
      const alias = column.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
      const expression = column.endsWith("_at")
        ? `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
        : column;
      return `${expression} AS "${alias}"`;
    })
    .join(", ");
}

@Injectable()
export class AdminService {
  public constructor(private readonly database: AdminDatabaseService) {}

  public async list<C extends AdminCollection>(
    collection: C,
    input: AdminListInput,
  ): Promise<AdminPage<AdminRecords[C]>> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    const add = (column: string, value: string) => {
      values.push(value);
      conditions.push(`${column} = $${values.length}`);
    };
    if (input.userId) add("user_id", input.userId);
    if (input.projectId) add("project_id", input.projectId);
    if (input.status) add("status", input.status);
    if (input.cursor) {
      values.push(input.cursor.createdAt, input.cursor.id);
      conditions.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length})`);
    }
    values.push(input.limit + 1);
    const result = await this.database.pool.query<AdminRecords[C]>(
      `SELECT ${projection(collection)} FROM public.${definitions[collection].table} ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
      values,
    );
    const data = result.rows.slice(0, input.limit);
    const last = data.at(-1);
    return {
      data,
      meta: {
        nextCursor:
          result.rows.length > input.limit && last
            ? encodeAdminCursor({ id: last.id, createdAt: last.createdAt })
            : null,
      },
    };
  }

  public async detail<C extends "users" | "projects" | "jobs">(
    collection: C,
    id: string,
  ): Promise<AdminRecords[C] | null> {
    if (collection !== "users" && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
      return null;
    const result = await this.database.pool.query<AdminRecords[C]>(
      `SELECT ${projection(collection)} FROM public.${definitions[collection].table} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  public async userDetail(id: string): Promise<AdminUserDetail | null> {
    const user = await this.detail("users", id);
    if (!user) return null;
    const input = { userId: id, limit: 20 };
    const [projects, jobs, payments, ledger] = await Promise.all([
      this.list("projects", input),
      this.list("jobs", input),
      this.list("payments", input),
      this.list("ledger", input),
    ]);
    return { user, projects, jobs, payments, ledger };
  }

  public async search(q: string): Promise<AdminSearchResult> {
    const result = await this.database.pool.query<AdminRecords["users"]>(
      `SELECT ${projection("users")} FROM public.users WHERE ${q.includes("@") ? "lower(email) = lower($1)" : "id = $1"} ORDER BY id LIMIT 50`,
      [q],
    );
    const [project, job] = q.includes("@")
      ? [null, null]
      : await Promise.all([this.detail("projects", q), this.detail("jobs", q)]);
    return { users: result.rows, projects: project ? [project] : [], jobs: job ? [job] : [] };
  }

  public async overview(range: AdminRange, now = new Date()): Promise<AdminOverview> {
    const from = new Date(now.getTime() - Number(range.slice(0, -1)) * 86_400_000).toISOString();
    const to = now.toISOString();
    const bounds = [from, to];
    const pool = this.database.pool;
    const [users, projects, jobs, payments, queue] = await Promise.all([
      pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM public.users WHERE created_at >= $1 AND created_at < $2",
        bounds,
      ),
      pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM public.projects WHERE created_at >= $1 AND created_at < $2",
        bounds,
      ),
      pool.query<AdminOverview["jobOutcomes"][number]>(
        "SELECT status, count(*)::int AS count FROM public.admin_job_metadata WHERE created_at >= $1 AND created_at < $2 GROUP BY status ORDER BY status",
        bounds,
      ),
      pool.query<AdminOverview["payments"][number]>(
        `SELECT currency, status, count(*)::int AS count, sum(amount_cents)::text AS "amountCents" FROM public.stripe_payments WHERE created_at >= $1 AND created_at < $2 GROUP BY currency,status ORDER BY currency,status`,
        bounds,
      ),
      pool.query<{ queued: number; active: number }>(
        "SELECT count(*) FILTER(WHERE status='queued')::int AS queued, count(*) FILTER(WHERE status='active')::int AS active FROM public.admin_job_metadata",
      ),
    ]);
    const summaries = payments.rows.map((payment) => {
      const amountCents = Number(payment.amountCents);
      if (!Number.isSafeInteger(amountCents)) throw new Error("Payment total unavailable.");
      return { ...payment, amountCents };
    });
    return {
      range,
      from,
      to,
      usersCreated: users.rows[0]!.count,
      projectsCreated: projects.rows[0]!.count,
      jobOutcomes: jobs.rows,
      payments: summaries,
      currentQueue: queue.rows[0]!,
    };
  }
}
