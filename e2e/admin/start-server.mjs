import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import { readLocalSupabaseEnv } from "./local-supabase.mjs";

const port = process.env.E2E_PORT ?? "3100";
const host = "127.0.0.1";
const local = readLocalSupabaseEnv();
const nextBin = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
  NEXT_PUBLIC_SITE_URL: `http://${host}:${port}`,
  NEXT_TELEMETRY_DISABLED: "1",
};

if (process.env.E2E_SKIP_BUILD !== "1") {
  const build = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  });

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const child = spawn(
  process.execPath,
  [nextBin, "start", "-H", host, "-p", port],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  },
);

function stop() {
  if (child.exitCode !== null || child.killed) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
}

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
