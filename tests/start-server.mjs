import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const port = process.env.E2E_PORT ?? "3100";
const host = "127.0.0.1";
const nextBin = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

const child = spawn(
  process.execPath,
  [nextBin, "dev", "-H", host, "-p", port],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: `http://${host}:${port}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
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
