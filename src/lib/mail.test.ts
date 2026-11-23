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
  customerOrderUrl,
  enqueueMailOutbox,
  getMailConfig,
  guestOrderRecoveryEmail,
  orderPlacedCustomerEmail,
  orderPlacedVendorEmail,
  orderStatusEmail,
  passwordResetEmail,
  processMailOutbox,
  notifyOrderPlaced,
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

  it("redacts the recipient in skip logs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await sendMail(
      {
        to: "customer@example.com",
        subject: "Test",
        text: "hello",
      },
      { config: null },
    );
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("customer@example.com");
    expect(logged).toContain("c***@example.com");
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

  it("redacts addresses from transport failure logs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failingTransport = {
      sendMail: async () => {
        throw new Error("550 customer@example.com rejected");
      },
    } as never;
    await sendMail(
      { to: "customer@example.com", subject: "Test", text: "hello" },
      { transport: failingTransport },
    );
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("customer@example.com");
    expect(logged).toContain("c***@example.com");
    errorSpy.mockRestore();
  });
});

describe("customerOrderUrl", () => {
  const siteUrl = "https://gifto.example";
  const id = "11111111-1111-4111-8111-111111111111";

  it("sends signed-in customers to their account order page", () => {
    expect(
      customerOrderUrl(
        {
          id,
          user_id: "user-1",
          public_reference: "GFT-ABCDEF123456",
        },
        siteUrl,
      ),
    ).toBe(`${siteUrl}/account/orders/${id}`);
  });

  it("sends guests to recovery with the public reference, never a token", () => {
    const url = customerOrderUrl(
      {
        id,
        user_id: null,
        public_reference: "GFT-ABCDEF123456",
      },
      siteUrl,
    );
    expect(url).toBe(
      `${siteUrl}/orders/recover?reference=GFT-ABCDEF123456`,
    );
    expect(url).not.toMatch(/token|guest_/i);
  });

  it("falls back to the guest order page when no public reference exists", () => {
    expect(
      customerOrderUrl(
        { id, user_id: null, public_reference: null },
        siteUrl,
      ),
    ).toBe(`${siteUrl}/orders/${id}`);
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

  it("S-07: shows the recovery link and the recovery code separately", () => {
    const code = "b".repeat(64);
    const message = guestOrderRecoveryEmail({
      reference: "GFT-ABCDEF123456",
      recoveryUrl: `https://gifto.example/orders/recover/confirm?order=11111111-1111-1111-1111-111111111111#token=${code}`,
      recoveryCode: code,
    });
    expect(message.text).toContain(
      "https://gifto.example/orders/recover/confirm?order=11111111-1111-1111-1111-111111111111#token=",
    );
    // The code on its own line, so a customer whose link lost its
    // fragment can paste it on the confirmation page.
    expect(message.text).toContain(code);
    expect(message.text).toContain("expires after one hour");
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
  requeue_count?: number;
  first_error?: string | null;
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
          requeue_count: 0,
          first_error: (row.first_error as string | null) ?? null,
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
          // S-14: an update applies only to rows matching *all* of its
          // filters, and reports the rows it actually touched — like
          // PostgREST, where a conditional update that matches nothing
          // returns an empty array, not an error.
          const matched = filtered;
          for (const row of matched) {
            Object.assign(row, patch);
            updates.push({ id: row.id, patch });
          }
          resolve({ data: matched, error: null });
          return;
        }
        if ((builder as { _maybeSingle?: boolean })._maybeSingle) {
          // A single-row read returns a snapshot copy, like the JSON
          // PostgREST returns — not a live reference to the stored row.
          // Without the copy, a concurrent mutation would leak into a
          // caller's already-read snapshot and hide the race S-14
          // guards against.
          const row = filtered[0];
          resolve({ data: row ? { ...row } : null, error: null });
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
        // Real rows always carry the column (migration 65, default 0);
        // the S-14 conditional update filters on it, so the fixture
        // must carry it too.
        requeue_count: 0,
      },
    ];
    const fake = makeOutboxFake(rows);
    serviceState.client = fake;
    expect(await requeueMailOutbox("row-1")).toEqual({ ok: true });
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
    expect(await requeueMailOutbox("row-1")).toEqual({
      ok: false,
      reason: "not_failed",
    });
    expect(await requeueMailOutbox("no-such-row")).toEqual({
      ok: false,
      reason: "not_failed",
    });
    expect(await requeueMailOutbox("")).toEqual({
      ok: false,
      reason: "not_failed",
    });
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(1);
    expect(fake.updates).toHaveLength(0);
  });

  it("S-10: requeue preserves the original failure reason and counts the requeue", async () => {
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
        first_error: "connection refused",
        requeue_count: 0,
      },
    ];
    const fake = makeOutboxFake(rows);
    serviceState.client = fake;
    expect(await requeueMailOutbox("row-1")).toEqual({ ok: true });
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(0);
    expect(rows[0].requeue_count).toBe(1);
    // The original failure reason stays on the row — it is no longer
    // overwritten with a generic requeue note.
    expect(rows[0].last_error).toBe("connection refused");
    expect(rows[0].first_error).toBe("connection refused");
  });

  it("S-10: requeue is refused once the row has already been requeued twice", async () => {
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
        first_error: "connection refused",
        requeue_count: 2,
      },
    ];
    const fake = makeOutboxFake(rows);
    serviceState.client = fake;
    expect(await requeueMailOutbox("row-1")).toEqual({
      ok: false,
      reason: "cap_reached",
    });
    expect(rows[0].status).toBe("failed");
    expect(rows[0].requeue_count).toBe(2);
    expect(fake.updates).toHaveLength(0);
  });

  it("S-14: two concurrent requeues at count 1 grant only one extra cycle", async () => {
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
        first_error: "connection refused",
        requeue_count: 1,
      },
    ];
    const fake = makeOutboxFake(rows);
    serviceState.client = fake;
    // Both calls read the same snapshot (failed, count 1) before either
    // updates — the conditional update must let exactly one through.
    const outcomes = await Promise.all([
      requeueMailOutbox("row-1"),
      requeueMailOutbox("row-1"),
    ]);
    expect(outcomes).toHaveLength(2);
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(
      outcomes.filter((o) => !o.ok),
    ).toEqual([{ ok: false, reason: "not_failed" }]);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(0);
    expect(rows[0].requeue_count).toBe(2);
    expect(fake.updates).toHaveLength(1);
  });

  it("S-10: enqueue records the first failure reason on the row", async () => {
    const fake = makeOutboxFake([]);
    serviceState.client = fake;
    const result = await sendMail(
      { to: "customer@example.com", subject: "Your order shipped", text: "Hi" },
      { config: null, kind: "order_status" },
    );
    expect(result).toEqual({ sent: false, skipped: "unconfigured" });
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]).toMatchObject({
      last_error: "SMTP is not configured",
      first_error: "SMTP is not configured",
    });
  });

  it("S-10: a failed retry keeps the first failure reason and updates the latest one", async () => {
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
        last_error: "SMTP is not configured",
        first_error: "SMTP is not configured",
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
    expect(outcome).toEqual({ sent: 0, failed: 1, remaining: 1 });
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].last_error).toBe("connection refused");
    expect(rows[0].first_error).toBe("SMTP is not configured");
  });
});

/**
 * Demo-environment mail boundary (P5): a demo deployment must never
 * send a real email to a real customer, even when SMTP is configured
 * and a transport is available. Only an explicit
 * GIFTO_DEMO_ALLOW_EMAIL=true opt-in lifts the block.
 */
describe("demo environment mail guard", () => {
  const originalEnv = { ...process.env };
  // Installed per test (not at describe level): an earlier describe's
  // per-test mockRestore() detaches a describe-level console.error spy.
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    serviceState.client = null;
    delete process.env.GIFTO_ENVIRONMENT;
    delete process.env.GIFTO_DEMO_ALLOW_EMAIL;
    workingTransport.sendMail.mockClear();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    serviceState.client = null;
    delete process.env.GIFTO_ENVIRONMENT;
    delete process.env.GIFTO_DEMO_ALLOW_EMAIL;
    Object.assign(process.env, originalEnv);
  });

  const workingTransport = {
    sendMail: vi.fn(async () => ({ messageId: "abc" })),
  };

  it("refuses a send in a demo environment even with a working transport", async () => {
    process.env.GIFTO_ENVIRONMENT = "demo";
    const result = await sendMail(
      { to: "customer@example.com", subject: "Test", text: "hello" },
      { transport: workingTransport as never },
    );
    expect(result).toEqual({ sent: false, skipped: "demo-environment" });
    expect(workingTransport.sendMail).not.toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("demo environment");
    expect(logged).not.toContain("customer@example.com");
  });

  it("sends in a demo environment only with the explicit opt-in", async () => {
    process.env.GIFTO_ENVIRONMENT = "demo";
    process.env.GIFTO_DEMO_ALLOW_EMAIL = "true";
    const result = await sendMail(
      { to: "customer@example.com", subject: "Test", text: "hello" },
      { transport: workingTransport as never },
    );
    expect(result).toEqual({ sent: true, messageId: "abc" });
    expect(workingTransport.sendMail).toHaveBeenCalledTimes(1);
  });

  it("does not block sends outside a demo environment", async () => {
    process.env.GIFTO_ENVIRONMENT = "production";
    const result = await sendMail(
      { to: "customer@example.com", subject: "Test", text: "hello" },
      { transport: workingTransport as never },
    );
    expect(result.sent).toBe(true);
  });

  it("enqueues a demo-blocked notification instead of losing it", async () => {
    process.env.GIFTO_ENVIRONMENT = "demo";
    const fake = makeOutboxFake([]);
    serviceState.client = fake;
    const result = await sendMail(
      { to: "customer@example.com", subject: "Your order shipped", text: "Hi" },
      { transport: workingTransport as never, kind: "order_status" },
    );
    expect(result).toEqual({ sent: false, skipped: "demo-environment" });
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]).toMatchObject({
      kind: "order_status",
      status: "pending",
      last_error: "demo environment: sending disabled",
      first_error: "demo environment: sending disabled",
    });
  });

  it("refuses an outbox retry run in a demo environment without touching a row", async () => {
    process.env.GIFTO_ENVIRONMENT = "demo";
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
    const outcome = await processMailOutbox({
      transport: workingTransport as never,
    });
    expect(outcome).toEqual({
      sent: 0,
      failed: 0,
      remaining: 1,
      skipped: "demo-environment",
    });
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(4);
    expect(fake.updates).toHaveLength(0);
  });
});

describe("notifyOrderPlaced never breaks checkout", () => {
  const originalEnv = { ...process.env };
  let errorSpy: ReturnType<typeof vi.spyOn>;

  // Fake service client: fetchOrderForMail reads one order row; the
  // outbox insert records enqueued notifications.
  function makeOrderPlacedFake() {
    const inserts: Record<string, unknown>[] = [];
    const orderRow = {
      id: "order-1",
      user_id: null,
      public_reference: "GFT-ABCDEF123456",
      contact_email: "customer@example.com",
      total_minor: 52000,
      recipient_name: "Test Customer",
      contact_phone: "+201001234567",
      order_vendors: [
        {
          subtotal_minor: 52000,
          vendor: { name: "Test Shop", contact_email: "shop@example.com" },
          order_items: [{ quantity: 2 }],
        },
      ],
    };
    const client = {
      inserts,
      from(table: string) {
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: orderRow, error: null }),
              }),
            }),
          };
        }
        if (table === "mail_outbox") {
          return {
            insert: async (row: Record<string, unknown>) => {
              inserts.push(row);
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    return client;
  }

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    serviceState.client = null;
    delete process.env.GIFTO_ENVIRONMENT;
    delete process.env.GIFTO_DEMO_ALLOW_EMAIL;
  });

  afterEach(() => {
    errorSpy.mockRestore();
    serviceState.client = null;
    delete process.env.GIFTO_ENVIRONMENT;
    delete process.env.GIFTO_DEMO_ALLOW_EMAIL;
    Object.assign(process.env, originalEnv);
  });

  it("resolves (never throws) when the site URL is unusable in production", async () => {
    // getSiteUrl() throws for a localhost site URL under NODE_ENV=production
    // — the exact combination a local `next start` run has. The order is
    // already placed at that point, so the notification must fail soft.
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3100";
    const fake = makeOrderPlacedFake();
    serviceState.client = fake;

    await expect(notifyOrderPlaced("order-1")).resolves.toBeUndefined();
    expect(fake.inserts).toHaveLength(0);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain(
      "order-placed notification failed",
    );
  });

  it("enqueues vendor + customer notifications on the happy path", async () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://gifto.example";
    const fake = makeOrderPlacedFake();
    serviceState.client = fake;

    await expect(notifyOrderPlaced("order-1")).resolves.toBeUndefined();
    expect(fake.inserts).toHaveLength(2);
    expect(fake.inserts.map((row) => row.kind)).toEqual([
      "order_placed_vendor",
      "order_placed_customer",
    ]);
  });
});
