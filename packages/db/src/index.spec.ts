import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { closeDatabaseClient, createDatabaseClient } from "./index.js";

afterEach(() => vi.restoreAllMocks());

it("waits for every client socket to disconnect even when pool.end resolves early", async () => {
  const database = createDatabaseClient({
    connectionString: "postgresql://localhost/fixture",
    poolMax: 2,
    ssl: false,
  });
  const first = new EventEmitter(),
    second = new EventEmitter();
  database.pool.emit("connect", first);
  database.pool.emit("connect", second);
  vi.spyOn(database.pool, "end").mockResolvedValue(undefined);
  let closed = false;
  const closing = closeDatabaseClient(database).then(() => {
    closed = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(closed).toBe(false);
  first.emit("end");
  await Promise.resolve();
  expect(closed).toBe(false);
  second.emit("end");
  await closing;
  expect(closed).toBe(true);
});

it("does not wait again for a previously disconnected client", async () => {
  const database = createDatabaseClient({
    connectionString: "postgresql://localhost/fixture",
    poolMax: 1,
    ssl: false,
  });
  const connection = new EventEmitter();
  database.pool.emit("connect", connection);
  connection.emit("end");
  vi.spyOn(database.pool, "end").mockResolvedValue(undefined);
  await expect(closeDatabaseClient(database)).resolves.toBeUndefined();
});

it("also waits for a connection that finishes opening while pool.end is running", async () => {
  const database = createDatabaseClient({
    connectionString: "postgresql://localhost/fixture",
    poolMax: 1,
    ssl: false,
  });
  const connection = new EventEmitter();
  vi.spyOn(database.pool, "end").mockImplementation(() => {
    database.pool.emit("connect", connection);
    return Promise.resolve();
  });
  let closed = false;
  const closing = closeDatabaseClient(database).then(() => {
    closed = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(closed).toBe(false);
  connection.emit("end");
  await closing;
  expect(closed).toBe(true);
});
