import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./create-project.ts", import.meta.url), "utf8");

describe("createProjectAction server module", () => {
  it("exports only the async Server Action at runtime", () => {
    expect(source.match(/^export .+$/gm)).toEqual([
      "export async function createProjectAction(",
    ]);
  });
});
