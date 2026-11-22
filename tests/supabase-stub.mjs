import http from "node:http";

// Minimal read-only Supabase surface for the isolated security-header lane.
// It returns empty results, never credentials, and is only bound to loopback.
const host = "127.0.0.1";
const port = Number(process.env.SUPABASE_STUB_PORT ?? "54329");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Range", "*/0");
  res.end(body);
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,POST,PATCH,DELETE,OPTIONS",
  );

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = req.url ?? "/";
  if (url.startsWith("/auth/v1/")) {
    json(res, 200, "{}");
    return;
  }

  if (url.startsWith("/storage/v1/")) {
    json(res, 200, "{}");
    return;
  }

  if (url.startsWith("/rest/v1/")) {
    if ((req.headers.accept ?? "").includes("vnd.pgrst.object+json")) {
      json(res, 200, "null");
      return;
    }
    json(res, 200, "[]");
    return;
  }

  json(res, 200, "[]");
});

server.listen(port, host, () => {
  console.log(`[supabase-stub] listening on http://${host}:${port}`);
});

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
