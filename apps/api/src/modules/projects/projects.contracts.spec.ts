import { describe, expect, it } from "vitest";

import {
  decodeProjectsCursor,
  encodeProjectsCursor,
  parseCreateProjectInput,
  parseListProjectsInput,
} from "./projects.contracts";

describe("project contract validation", () => {
  it("trims a valid project name and accepts either supported output type", () => {
    expect(parseCreateProjectInput({ name: "  Creator breakdown  ", outputType: "clips" })).toEqual({
      name: "Creator breakdown",
      outputType: "clips",
    });
  });

  it("rejects empty and overlong project names", () => {
    expect(() => parseCreateProjectInput({ name: "   ", outputType: "clips" })).toThrow(
      "Project name must be between 1 and 120 characters.",
    );
    expect(() => parseCreateProjectInput({ name: "a".repeat(121), outputType: "summary" })).toThrow(
      "Project name must be between 1 and 120 characters.",
    );
  });

  it("uses safe list defaults and accepts documented filters", () => {
    expect(
      parseListProjectsInput({ limit: "5", outputType: "summary", status: "draft" }),
    ).toMatchObject({ limit: 5, outputType: "summary", status: "draft" });
    expect(parseListProjectsInput({})).toMatchObject({ limit: 20 });
  });

  it("rejects malformed pagination parameters", () => {
    expect(() => parseListProjectsInput({ cursor: "invalid", limit: "51" })).toThrow(
      "Invalid project list query.",
    );
  });

  it("round-trips a cursor used for newest-first ordering", () => {
    const cursor = encodeProjectsCursor({ createdAt: "2026-07-12T09:06:00.000Z", id: "project-id" });

    expect(decodeProjectsCursor(cursor)).toEqual({
      createdAt: "2026-07-12T09:06:00.000Z",
      id: "project-id",
    });
  });
});
