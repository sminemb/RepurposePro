import type { ProcessingJobStatus, ProcessingJobStep } from "./processing";
import type { ProjectOutputType, ProjectStatus } from "./projects";

export type AdminRange = "7d" | "30d" | "90d";
export type AdminCollection = "users" | "projects" | "jobs" | "payments" | "ledger";
export type AdminPaymentStatus = "pending" | "paid" | "failed" | "refunded";
export interface AdminUserSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface AdminProjectSummary {
  readonly id: string;
  readonly userId: string;
  readonly outputType: ProjectOutputType;
  readonly status: ProjectStatus;
  readonly currentJobId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}
export interface AdminJobSummary {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly type: string;
  readonly status: ProcessingJobStatus;
  readonly step: ProcessingJobStep | null;
  readonly errorCode: string | null;
  readonly attemptCount: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface AdminPaymentSummary {
  readonly id: string;
  readonly userId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: AdminPaymentStatus;
  readonly createdAt: string;
}
export interface AdminCreditLedgerEntry {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly amount: number;
  readonly createdAt: string;
}
export interface AdminSearchResult {
  readonly users: readonly AdminUserSummary[];
  readonly projects: readonly AdminProjectSummary[];
  readonly jobs: readonly AdminJobSummary[];
}
export interface AdminOverview {
  readonly range: AdminRange;
  readonly from: string;
  readonly to: string;
  readonly usersCreated: number;
  readonly projectsCreated: number;
  readonly jobOutcomes: readonly { readonly status: ProcessingJobStatus; readonly count: number }[];
  readonly payments: readonly {
    readonly currency: string;
    readonly status: AdminPaymentStatus;
    readonly count: number;
    readonly amountCents: number;
  }[];
  readonly currentQueue: { readonly queued: number; readonly active: number };
}
export interface AdminRecords {
  users: AdminUserSummary;
  projects: AdminProjectSummary;
  jobs: AdminJobSummary;
  payments: AdminPaymentSummary;
  ledger: AdminCreditLedgerEntry;
}
export interface AdminPage<T> {
  readonly data: readonly T[];
  readonly meta: { readonly nextCursor: string | null };
}
export interface AdminUserDetail {
  readonly user: AdminUserSummary;
  readonly projects: AdminPage<AdminProjectSummary>;
  readonly jobs: AdminPage<AdminJobSummary>;
  readonly payments: AdminPage<AdminPaymentSummary>;
  readonly ledger: AdminPage<AdminCreditLedgerEntry>;
}
