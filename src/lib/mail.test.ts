import { createServer } from "node:net";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// src/lib/mail.ts is server-only; the guard package throws outside React
// Server Components, so tests stub it out.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("service client is not available in unit tests");
  },
}));

import {
  getMailConfig,
  orderPlacedCustomerEmail,
  orderPlacedVendorEmail,
  orderStatusEmail,
  passwordResetEmail,
  refundCaseResolvedEmail,
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
