import { test as base, expect } from "@playwright/test";

export type { Page } from "@playwright/test";

export type BlockedRequest = {
  method: string;
  url: string;
  resourceType: string;
  occurredAt: string;
};

export type ReadOnlyGuard = {
  blocked: BlockedRequest[];
  allowBlocked: boolean;
};

export type BrowserDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: {
    method: string;
    url: string;
    failure: string | null;
  }[];
};

export const test = base.extend<{
  readOnlyGuard: ReadOnlyGuard;
  browserDiagnostics: BrowserDiagnostics;
}>({
  readOnlyGuard: [
    async ({ context }, use, testInfo) => {
      const guard: ReadOnlyGuard = { blocked: [], allowBlocked: false };

      await context.route("**/*", async (route) => {
        const request = route.request();
        const method = request.method().toUpperCase();

        if (method !== "GET" && method !== "HEAD") {
          guard.blocked.push({
            method,
            url: request.url(),
            resourceType: request.resourceType(),
            occurredAt: new Date().toISOString(),
          });
          await route.abort("blockedbyclient");
          return;
        }

        await route.continue();
      });

      await use(guard);

      if (guard.blocked.length > 0) {
        await testInfo.attach("blocked-requests.json", {
          body: JSON.stringify(guard.blocked, null, 2),
          contentType: "application/json",
        });

        if (!guard.allowBlocked) {
          throw new Error(
            `Read-only guard blocked ${guard.blocked.length} non-GET/HEAD request(s): ` +
              guard.blocked
                .map((request) => `${request.method} ${request.url}`)
                .join(", "),
          );
        }
      }
    },
    { auto: true },
  ],

  browserDiagnostics: [
    async ({ page }, use, testInfo) => {
      const diagnostics: BrowserDiagnostics = {
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
      };

      page.on("console", (message) => {
        if (message.type() === "error") {
          diagnostics.consoleErrors.push(message.text());
        }
      });

      page.on("pageerror", (error) => {
        diagnostics.pageErrors.push(error.message);
      });

      page.on("requestfailed", (request) => {
        const failure = request.failure();
        diagnostics.failedRequests.push({
          method: request.method(),
          url: request.url(),
          failure: failure ? failure.errorText : null,
        });
      });

      await use(diagnostics);

      if (
        diagnostics.consoleErrors.length > 0 ||
        diagnostics.pageErrors.length > 0 ||
        diagnostics.failedRequests.length > 0
      ) {
        await testInfo.attach("browser-diagnostics.json", {
          body: JSON.stringify(diagnostics, null, 2),
          contentType: "application/json",
        });
      }
    },
    { auto: true },
  ],

  request: async ({}, use) => {
    throw new Error(
      "The request fixture is disabled in this read-only QA harness. Use page.goto/page.evaluate for GET/HEAD-only navigation.",
    );
  },
});

export { expect };
