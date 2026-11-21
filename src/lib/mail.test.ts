import { createServer } from "node:net";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// src/lib/mail.ts is server-only; the guard package throws outside React
// Server Components, so tests stub it out.
vi.mock("server-only", () => ({}));

// The service client is unavailable by default (the historical behaviour
// for the mail tests); outbox tests install a recording fake instead.
const serviceState = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    if (!serviceState.client) {
      throw new Error("service client is not available in unit tests");
    }
    return serviceState.client;
  },
}));

import {
  enqueueMailOutbox,
  getMailConfig,
  orderPlacedCustomerEmail,
  orderPlacedVendorEmail,
  orderStatusEmail,
  passwordResetEmail,
  processMailOutbox,
  refundCaseResolvedEmail,
  requeueMailOutbox,
  sendMail,
  vendorStaffAddedEmail,
  vendorStaffInviteEmail,
} from "./mail";

describe("getMailConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("SMTP_") || key === "MAIL_FROM") delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("SMTP_") || key === "MAIL_FROM") delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("returns null when no provider is configured", () => {
    expect(getMailConfig()).toBeNull();
  });

  it("returns null when only the host is set (no sender)", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    expect(getMailConfig()).toBeNull();
  });

  it("parses host, port, auth and sender from env names only", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "gifto";
    process.env.SMTP_PASS = "secret";
    process.env.MAIL_FROM = "Gifto <orders@gifto.example>";
    const config = getMailConfig();
    expect(config).toMatchObject({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "gifto",
      from: "Gifto <orders@gifto.example>",
    });
    // The password is read into memory only; it is never part of a result.
    expect(config?.pass).toBe("secret");
  });

  it("defaults to port 587 without implicit TLS", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.MAIL_FROM = "Gifto <orders@gifto.example>";
    expect(getMailConfig()).toMatchObject({ port: 587, secure: false });
  });
});

describe("sendMail without a provider", () => {
  it("skips the send and never throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendMail(
      {
        to: "customer@example.com",
        subject: "Test",
        text: "hello",
      },
      { config: null },
    );
    expect(result).toEqual({ sent: false, skipped: "unconfigured" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("rejects an invalid recipient without throwing", async () => {
    const result = await sendMail(
      { to: "not-an-email", subject: "Test", text: "hello" },
      { config: null },
    );
    expect(result.sent).toBe(false);
  });

  it("returns a failure result instead of throwing when the transport fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failingTransport = {
      sendMail: async () => {
        throw new Error("connection refused");
      },
    } as never;
    const result = await sendMail(
      { to: "customer@example.com", subject: "Test", text: "hello" },
      { transport: failingTransport },
    );
    expect(result).toEqual({ sent: false, error: "connection refused" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("mail templates", () => {
  it("formats the customer order email in EGP and includes the order link", () => {
    const message = orderPlacedCustomerEmail({
      reference: "GFT-ABCDEF123456",
      totalMinor: 17500,
      orderUrl: "https://gifto.example/orders/123",
    });
    expect(message.subject).toContain("GFT-ABCDEF123456");
    expect(message.text).toContain("EGP 175.00");
    expect(message.text).toContain("https://gifto.example/orders/123");
    expect(message.text).toContain("cash on delivery");
  });

  it("formats the vendor order email with the shop subtotal", () => {
    const message = orderPlacedVendorEmail({
      vendorName: "Flower Shop",
      reference: "GFT-ABCDEF123456",
      subtotalMinor: 25000,
      itemCount: 2,
      recipientName: "Mona",
      contactPhone: "01000000000",
    });
    expect(message.subject).toContain("Flower Shop");
    expect(message.text).toContain("EGP 250.00");
    expect(message.text).toContain("2 items");
  });

  it("labels the status change in plain language", () => {
    const message = orderStatusEmail({
      reference: "GFT-ABCDEF123456",
      vendorName: "Flower Shop",
      previousStatus: "confirmed",
      status: "shipped",
      orderUrl: "https://gifto.example/orders/123",
    });
    expect(message.text).toContain("Confirmed");
    expect(message.text).toContain("On the way");
  });

  it("states the approved refund amount and never a token", () => {
    const message = refundCaseResolvedEmail({
      reference: "GFT-ABCDEF123456",
      vendorName: "Flower Shop",
      approved: true,
      refundAmountMinor: 12000,
      note: "Damaged on arrival.",
    });
    expect(message.text).toContain("EGP 120.00");
    expect(message.text).toContain("Damaged on arrival.");
    expect(message.text).not.toMatch(/token|password/i);
  });

  it("includes the reset link and an expiry warning, and nothing else secret", () => {
    const message = passwordResetEmail({
      resetUrl: "https://gifto.example/auth/callback?code=abc",
    });
    expect(message.text).toContain(
      "https://gifto.example/auth/callback?code=abc",
    );
    expect(message.text).toContain("expires after one hour");
    expect(message.text).not.toMatch(/password is|your password:/i);
  });

  it("invites staff with the shop, role and a single-use link", () => {
    const message = vendorStaffInviteEmail({
      shopName: "Flower Shop",
      role: "manager",
      inviteUrl: "https://gifto.example/auth/accept-invite?code=abc",
    });
    expect(message.subject).toContain("Flower Shop");
    expect(message.text).toContain("as manager");
    expect(message.text).toContain(
      "https://gifto.example/auth/accept-invite?code=abc",
    );
    expect(message.text).toContain("expires after 24 hours");
  });

  it("tells an existing account they were added, with no link to leak", () => {
    const message = vendorStaffAddedEmail({
      shopName: "Flower Shop",
      role: "staff",
    });
    expect(message.text).toContain("Flower Shop");
    expect(message.text).toContain("as staff");
    expect(message.text).not.toMatch(/https?:\/\//);
  });
});

/**
 * End-to-end SMTP check against a local sink: the mail module really speaks
 * SMTP and delivers a message a local test inbox can read. This is the
 * closest verification possible without the owner's SMTP account — the
 * provider itself is still BLOCKED (see docs/HOSTED_STATE.md).
 */
describe("sendMail over real SMTP to a local sink", () => {
  it("delivers a vendor order email to a local SMTP inbox", async () => {
    const received: string[] = [];

    const server = createServer((socket) => {
      socket.write("220 localhost test sink\r\n");
      let dataMode = false;
      let dataBuffer = "";
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        while (buffer.includes("\r\n")) {
          const lineEnd = buffer.indexOf("\r\n");
          const line = buffer.slice(0, lineEnd);
          buffer = buffer.slice(lineEnd + 2);
          if (dataMode) {
            if (line === ".") {
              dataMode = false;
              received.push(dataBuffer);
              dataBuffer = "";
              socket.write("250 OK\r\n");
            } else {
              dataBuffer += `${line}\r\n`;
            }
            continue;
          }
          if (line.startsWith("EHLO") || line.startsWith("HELO")) {
            socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
          } else if (line.startsWith("MAIL FROM")) {
            socket.write("250 OK\r\n");
          } else if (line.startsWith("RCPT TO")) {
            socket.write("250 OK\r\n");
          } else if (line === "DATA") {
            dataMode = true;
            socket.write("354 End data\r\n");
          } else if (line === "QUIT") {
            socket.write("221 Bye\r\n");
            socket.end();
          } else {
            socket.write("250 OK\r\n");
          }
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port =
      typeof address === "object" && address !== null ? address.port : 0;

    const originalEnv = { ...process.env };
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(port);
    process.env.SMTP_SECURE = "false";
    process.env.MAIL_FROM = "Gifto <orders@gifto.test>";

    try {
      const result = await sendMail({
        ...orderPlacedVendorEmail({
          vendorName: "Flower Shop",
          reference: "GFT-ABCDEF123456",
          subtotalMinor: 25000,
          itemCount: 2,
          recipientName: "Mona",
          contactPhone: "01000000000",
        }),
        to: "shop@example.com",
      });
      expect(result.sent).toBe(true);
      expect(received.length).toBe(1);
      expect(received[0]).toContain("New Gifto order GFT-ABCDEF123456");
      expect(received[0]).toContain("shop@example.com");
    } finally {
      for (const key of Object.keys(process.env)) {
        if (key.startsWith("SMTP_") || key === "MAIL_FROM") {
          delete process.env[key];
        }
      }
      Object.assign(process.env, originalEnv);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

/**
 * Mail outbox (migration 63): skipped/failed notification sends are
 * queued durably for admin retry; single-use-link sends are never queued.
 */
type OutboxRow = {
  id: string;
  kind: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  attempts: number;
  status: string;
  last_error?: string;
};

function makeOutboxFake(rows: OutboxRow[]) {
  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const client = {
    inserts,
    updates,
    from(table: string) {
      if (table !== "mail_outbox") throw new Error(`unexpected table ${table}`);
      const builder: Record<string, unknown> = {};
      builder.insert = async (row: Record<string, unknown>) => {
        inserts.push(row);
        rows.push({
          id: `row-${rows.length + 1}`,
          kind: String(row.kind),
          to_email: String(row.to_email),
          subject: String(row.subject),
          body_text: String(row.body_text),
          body_html: (row.body_html as string | null) ?? null,
          attempts: 0,
          status: "pending",
        });
        return { error: null };
      };
      builder.select = (
        _columns: string,
        opts?: { count?: string; head?: boolean },
      ) => {
        builder._head = Boolean(opts?.head);
        return builder;
      };
      builder.maybeSingle = () => {
        builder._maybeSingle = true;
        return builder;
      };
      builder.eq = (column: string, value: unknown) => {
        builder._eq = [column, value];
        const eqs = (builder as { _eqs?: [string, unknown][] })._eqs ?? [];
        eqs.push([column, value]);
        builder._eqs = eqs;
        return builder;
      };
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.update = (patch: Record<string, unknown>) => {
        builder._patch = patch;
        return builder;
      };
      // Supabase builders are thenable: awaiting the chain resolves to
      // the query result.
      builder.then = (resolve: (value: unknown) => void) => {
        const eqs =
          (builder as { _eqs?: [string, unknown][] })._eqs ?? [];
        const filtered = rows.filter((r) =>
          eqs.every(
            ([column, value]) =>
              String((r as Record<string, unknown>)[column]) ===
              String(value),
          ),
        );
        if ((builder as { _head?: boolean })._head) {
          resolve({
            count: filtered.length,
            error: null,
          });
          return;
        }
        if ((builder as { _patch?: Record<string, unknown> })._patch) {
          const patch = (builder as { _patch: Record<string, unknown> })
            ._patch;
          const [, id] = (builder as { _eq?: [string, unknown] })._eq ?? [];
          const row = rows.find((r) => r.id === id);
          if (row) {
            Object.assign(row, patch);
            updates.push({ id: String(id), patch });
          }
          resolve({ error: null });
          return;
        }
        if ((builder as { _maybeSingle?: boolean })._maybeSingle) {
          resolve({ data: filtered[0] ?? null, error: null });
          return;
        }
        resolve({
          data: filtered,
          error: null,
        });
      };
      return builder;
    },
  };
  return client;
}

describe("mail outbox", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    serviceState.client = null;
  });

  afterEach(() => {
    serviceState.client = null;
    errorSpy.mockClear();
  });

  it("enqueues a skipped send (no provider) instead of losing it to the log", async () => {
    const fake = makeOutboxFake([]);
    serviceState.client = fake;
    const result = await sendMail(
      { to: "customer@example.com", subject: "Your order shipped", text: "Hi" },
      { config: null, kind: "order_status" },
    );
    expect(result).toEqual({ sent: false, skipped: "unconfigured" });
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]).toMatchObject({
      kind: "order_status",
      to_email: "customer@example.com",
      subject: "Your order shipped",
      status: "pending",
    });
  });

  it("enqueues a failed transport send with the error, and never throws when the service client is missing", async () => {
    const failingTransport = {
      sendMail: async () => {
        throw new Error("connection refused");
      },
    } as never;
    const result = await sendMail(
      { to: "customer@example.com", subject: "Test", text: "hello" },
      { transport: failingTransport },
    );
    expect(result).toEqual({ sent: false, error: "connection refused" });
    // No service client in this test: enqueue fails silently, send result kept.
    expect(await enqueueMailOutbox(
      { to: "customer@example.com", subject: "Test", text: "hello" },
      "notification",
      "connection refused",
    )).toBe(false);
  });

  it("does not enqueue when enqueue:false (single-use-link sends)", async () => {
    const fake = makeOutboxFake([]);
    serviceState.client = fake;
    const result = await sendMail(
      { to: "customer@example.com", subject: "Test", text: "hello" },
      { config: null, enqueue: false },
    );
    expect(result.sent).toBe(false);
    expect(fake.inserts).toHaveLength(0);
  });

  it("retries pending rows and marks them sent", async () => {
    const rows: OutboxRow[] = [
      {
        id: "row-1",
        kind: "order_status",
        to_email: "customer@example.com",
        subject: "Your order shipped",
        body_text: "Hi",
        body_html: null,
        attempts: 0,
        status: "pending",
      },
    ];
    const fake = makeOutboxFake(rows);
    serviceState.client = fake;
    const workingTransport = {
      sendMail: async () => ({ messageId: "abc" }),
    } as never;
    const outcome = await processMailOutbox({
      transport: workingTransport,
      config: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        user: null,
        pass: null,
        from: "Gifto <orders@gifto.example>",
        timeoutMs: 5000,
      },
    });
    expect(outcome).toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(rows[0].status).toBe("sent");
    expect(rows[0].attempts).toBe(1);
  });

  it("leaves a failed retry pending (and marks it failed after 5 attempts)", async () => {
    const rows: OutboxRow[] = [
      {
        id: "row-1",
        kind: "order_status",
        to_email: "customer@example.com",
        subject: "Your order shipped",
        body_text: "Hi",
        body_html: null,
        attempts: 4,
        status: "pending",
      },
    ];
    const fake = makeOutboxFake(rows);
    serviceState.client = fake;
    const failingTransport = {
      sendMail: async () => {
        throw new Error("connection refused");
      },
    } as never;
    const outcome = await processMailOutbox({ transport: failingTransport });
    expect(outcome).toEqual({ sent: 0, failed: 1, remaining: 0 });
    expect(rows[0].status).toBe("failed");
    expect(rows[0].attempts).toBe(5);
    expect(rows[0].last_error).toBe("connection refused");
  });

  it("S-06: a retry run with no provider configured touches no row", async () => {
    const rows: OutboxRow[] = [
      {
        id: "row-1",
        kind: "order_status",
        to_email: "customer@example.com",
        subject: "Your order shipped",
        body_text: "Hi",
        body_html: null,
        attempts: 4,
        status: "pending",
      },
    ];
    const fake = makeOutboxFake(rows);
    serviceState.client = fake;
    // No transport and an explicit null config: the run is refused
    // before any row is read, so the 5th attempt is not burned.
    const outcome = await processMailOutbox({ config: null });
    expect(outcome).toEqual({
      sent: 0,
      failed: 0,
      remaining: 1,
      skipped: "unconfigured",
    });
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(4);
    expect(fake.updates).toHaveLength(0);
  });

  it("S-06: requeue restores a failed row to pending with a fresh attempt count", async () => {
    const rows: OutboxRow[] = [
      {
        id: "row-1",
        kind: "order_status",
        to_email: "customer@example.com",
        subject: "Your order shipped",
        body_text: "Hi",
        body_html: null,
        attempts: 5,
        status: "failed",
        last_error: "connection refused",
      },
    ];
    const fake = makeOutboxFake(rows);
    serviceState.client = fake;
    expect(await requeueMailOutbox("row-1")).toBe(true);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(0);
  });

  it("S-06: requeue refuses a pending row and an unknown row", async () => {
    const rows: OutboxRow[] = [
      {
        id: "row-1",
        kind: "order_status",
        to_email: "customer@example.com",
        subject: "Your order shipped",
        body_text: "Hi",
        body_html: null,
        attempts: 1,
        status: "pending",
      },
    ];
    const fake = makeOutboxFake(rows);
    serviceState.client = fake;
    expect(await requeueMailOutbox("row-1")).toBe(false);
    expect(await requeueMailOutbox("no-such-row")).toBe(false);
    expect(await requeueMailOutbox("")).toBe(false);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(1);
    expect(fake.updates).toHaveLength(0);
  });
});
