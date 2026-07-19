export const HealthState = {
  Down: "down",
  Up: "up",
} as const;

export type HealthState = (typeof HealthState)[keyof typeof HealthState];

export type ServiceName = "api" | "worker";

export interface LiveHealthData {
  service: "api";
  status: "ok";
}

export interface DependencyHealthChecks {
  database: HealthState;
  redis: HealthState;
}

export interface ReadyHealthData extends LiveHealthData {
  checks: DependencyHealthChecks;
}

export interface ApiSuccess<TData> {
  data: TData;
}

export interface ApiError<TDetails = null> {
  error: {
    code: string;
    details: TDetails;
    message: string;
    requestId: string;
  };
}

export * from "./billing";
export * from "./processing";
export * from "./projects";
