import http from "node:http";
import type { AddressInfo } from "node:net";

import { test, expect } from "./fixtures";

test.describe("read-only network guard", () => {
  test("allows GET/HEAD and blocks every other method locally", async ({
    page,
    readOnlyGuard,
  }) => {
    const received: string[] = [];
    const server = http.createServer((request, response) => {
      received.push(`${request.method} ${request.url}`);
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(
        "<!doctype html><html><body><p>guard-check</p></body></html>",
      );
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/`;

    try {
      await page.goto(url);
      await expect(page.getByText("guard-check")).toBeVisible();
      expect(received).toContain("GET /");

      const headOutcome = await page.evaluate(async () => {
        try {
          const response = await fetch("/head-check", { method: "HEAD" });
          return response.ok ? "allowed" : `status-${response.status}`;
        } catch {
          return "blocked";
        }
      }, undefined);

      expect(headOutcome, "HEAD must be allowed").toBe("allowed");
      expect(received).toContain("HEAD /head-check");

      readOnlyGuard.allowBlocked = true;
      const methods = ["POST", "PUT", "PATCH", "DELETE"] as const;

      for (const method of methods) {
        const outcome = await page.evaluate(async (requestMethod) => {
          try {
            await fetch("/mutation", { method: requestMethod });
            return "sent";
          } catch {
            return "blocked";
          }
        }, method);

        expect(outcome, `${method} must be blocked`).toBe("blocked");
      }

      expect(readOnlyGuard.blocked.map((request) => request.method)).toEqual([
        ...methods,
      ]);
      expect(
        received.filter(
          (entry) => !entry.startsWith("GET ") && !entry.startsWith("HEAD "),
        ),
      ).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
