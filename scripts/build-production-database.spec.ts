import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildProductionDatabaseTemplate } from "./build-production-database";

describe("production database infrastructure safety", () => {
  it("retains data independently of compute and keeps backup objects private", () => {
    const template = buildProductionDatabaseTemplate() as {
      Resources: Record<
        string,
        {
          DeletionPolicy?: string;
          UpdateReplacePolicy?: string;
          Properties: Record<string, unknown>;
        }
      >;
    };
    for (const name of ["DataVolume", "BackupBucket"]) {
      expect(template.Resources[name]).toMatchObject({
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
      });
    }
    expect(template.Resources.DataVolume!.Properties).toMatchObject({ Encrypted: true, Size: 12 });
    expect(template.Resources.BackupBucket!.Properties.PublicAccessBlockConfiguration).toEqual({
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    expect(JSON.stringify(template)).not.toContain("__DATABASE_USER_DATA__");
  });

  it("ships bootstrap within EC2 limits and requires IMDSv2", () => {
    const template = buildProductionDatabaseTemplate() as {
      Resources: {
        DatabaseLaunchTemplate: {
          Properties: {
            LaunchTemplateData: {
              MetadataOptions: unknown;
              UserData: { "Fn::Base64": { "Fn::Sub": string } };
            };
          };
        };
      };
    };
    const launch = template.Resources.DatabaseLaunchTemplate.Properties.LaunchTemplateData;
    expect(launch.MetadataOptions).toMatchObject({
      HttpTokens: "required",
      HttpPutResponseHopLimit: 1,
    });
    expect(Buffer.byteLength(launch.UserData["Fn::Base64"]["Fn::Sub"])).toBeLessThanOrEqual(16_384);
  });

  it("only admits the web role publicly and refuses cleartext database traffic", () => {
    const script = readFileSync(resolve("infra/database/configure-tls.sh"), "utf8");
    const publicRules = script
      .split("\n")
      .filter((line) => line.startsWith("hostssl") && line.includes("0.0.0.0/0"));
    expect(publicRules).toEqual([
      "hostssl repurposepro repurposepro_runtime 0.0.0.0/0 scram-sha-256",
    ]);
    expect(script).toContain("hostnossl all all 0.0.0.0/0 reject");
    expect(script).not.toContain(" trust");
  });
});
