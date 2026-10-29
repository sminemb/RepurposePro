import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(process.cwd());

export function buildProductionDatabaseTemplate(): Record<string, unknown> {
  const assets = Object.fromEntries(
    ["bootstrap.sh", "configure-tls.sh", "monitor.py", "backup.sh", "restore-drill.sh"].map(
      (name) => [
        name,
        readFileSync(resolve(root, "infra/database", name), "utf8").replaceAll("\r\n", "\n"),
      ],
    ),
  );
  const payload = gzipSync(JSON.stringify(assets)).toString("base64");
  const userData = `#!/bin/bash
set -euo pipefail
umask 077
install -d -m 700 /opt/repurposepro-database
python3 - <<'PY'
import base64, gzip, json, pathlib
assets = json.loads(gzip.decompress(base64.b64decode('${payload}')))
for name, content in assets.items():
    pathlib.Path('/opt/repurposepro-database', name).write_text(content)
PY
export DB_VOLUME_ID='\${DataVolume}'
export DB_BACKUP_BUCKET='\${BackupBucket}'
export DB_REGION='\${AWS::Region}'
export DB_HOSTNAME='\${DatabaseHostname}'
bash /opt/repurposepro-database/bootstrap.sh
`;
  if (Buffer.byteLength(userData) > 16_384) throw new Error("EC2 user data exceeds 16 KiB.");
  const template = readFileSync(
    resolve(root, "infra/database/production-database.template.json"),
    "utf8",
  );
  // String replacement keeps the declarative template independent of deployment code.
  return JSON.parse(
    template.replace(
      '"__DATABASE_USER_DATA__"',
      JSON.stringify({ "Fn::Base64": { "Fn::Sub": userData } }),
    ),
  ) as Record<string, unknown>;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/build-production-database.ts")) {
  const output = resolve(root, ".artifacts/database/production-database.cloudformation.json");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(buildProductionDatabaseTemplate(), null, 2)}\n`);
  console.info(output);
}
