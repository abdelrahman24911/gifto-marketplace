import { parseArgs } from "node:util";

import nodemailer from "nodemailer";

const BREVO_HOSTS = new Set([
  "smtp-relay.brevo.com",
  "smtp-relay.sendinblue.com",
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECURE_PORTS = new Set([465]);

class ConfigError extends Error {}

function usage() {
  console.log(`Usage: npm run mail:verify -- [--check-only] [--to=you@example.com]

Reads SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM
and SMTP_TIMEOUT_MS from the environment. The npm script loads .env.local
when it exists. MAIL_TEST_TO may be used instead of --to for the real send.

  --check-only  validate configuration without connecting or sending
  --to=EMAIL    recipient for one real test message
  --help        show this message`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is required.`);
  return value;
}

function parsePort(value, fallback) {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new ConfigError("SMTP_PORT must be an integer between 1 and 65535.");
  }
  return parsed;
}

function parseSecure(value, port) {
  if (!value?.trim()) return SECURE_PORTS.has(port);
  const lowered = value.trim().toLowerCase();
  if (lowered !== "true" && lowered !== "false") {
    throw new ConfigError("SMTP_SECURE must be true or false.");
  }
  return lowered === "true";
}

function emailAddress(value) {
  const bracketed = value.match(/<([^>]+)>/);
  return (bracketed?.[1] ?? value).trim();
}

function redactEmail(value) {
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return "***";
  return `${value.slice(0, 1)}***@${value.slice(at + 1)}`;
}

function redactEmailAddresses(value) {
  return value.replace(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g, redactEmail);
}

function sanitize(value, secrets) {
  let result = redactEmailAddresses(value);
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join("[redacted]");
  }
  return result;
}

function loadConfig() {
  const host = required("SMTP_HOST").toLowerCase();
  if (!BREVO_HOSTS.has(host)) {
    throw new ConfigError(
      "SMTP_HOST must be smtp-relay.brevo.com (or the legacy smtp-relay.sendinblue.com).",
    );
  }

  const port = parsePort(process.env.SMTP_PORT, 587);
  if (![25, 465, 587, 2525].includes(port)) {
    throw new ConfigError("SMTP_PORT must be 25, 465, 587, or 2525 for Brevo.");
  }

  const secure = parseSecure(process.env.SMTP_SECURE, port);
  if (secure !== SECURE_PORTS.has(port)) {
    throw new ConfigError(
      "SMTP_SECURE must be true for port 465 and false for ports 25, 587, and 2525.",
    );
  }

  const user = required("SMTP_USER");
  const pass = required("SMTP_PASS");
  const from = required("MAIL_FROM");
  const fromEmail = emailAddress(from);
  if (!EMAIL_PATTERN.test(fromEmail)) {
    throw new ConfigError("MAIL_FROM must contain a valid email address.");
  }

  const timeoutMs = parsePort(process.env.SMTP_TIMEOUT_MS, 10000);
  if (timeoutMs > 60000) {
    throw new ConfigError("SMTP_TIMEOUT_MS must be 60000 or less.");
  }

  return { host, port, secure, user, pass, from, fromEmail, timeoutMs };
}

function assertSendAllowed() {
  const environment = process.env.GIFTO_ENVIRONMENT?.trim().toLowerCase();
  const allowed = process.env.GIFTO_DEMO_ALLOW_EMAIL?.trim().toLowerCase();
  if (environment === "demo" && allowed !== "true") {
    throw new ConfigError(
      "Refusing to send from a demo environment. Set GIFTO_DEMO_ALLOW_EMAIL=true only for a deliberate demo test send.",
    );
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      "check-only": { type: "boolean" },
      to: { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    usage();
    return;
  }

  const config = loadConfig();
  const recipient = values.to ?? process.env.MAIL_TEST_TO?.trim();

  if (values["check-only"]) {
    console.log(
      `[brevo-smtp] configuration OK: host=${config.host} port=${config.port} secure=${config.secure} from=${redactEmail(config.fromEmail)} user=${redactEmail(config.user)} timeoutMs=${config.timeoutMs}`,
    );
    return;
  }

  if (!recipient) {
    throw new ConfigError(
      "Pass --to=you@example.com (or set MAIL_TEST_TO) for a real test send, or use --check-only.",
    );
  }
  if (!EMAIL_PATTERN.test(recipient)) {
    throw new ConfigError("The test recipient must be a valid email address.");
  }
  assertSendAllowed();

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  });

  try {
    await transport.verify();
    const info = await transport.sendMail({
      from: config.from,
      to: recipient,
      subject: "Gifto Brevo SMTP verification",
      text: [
        "Gifto SMTP verification succeeded.",
        "",
        `Host: ${config.host}:${config.port}`,
        `Time: ${new Date().toISOString()}`,
        "",
        "This is a test message. No action is required.",
      ].join("\n"),
    });
    console.log(
      `[brevo-smtp] relay accepted the test message for ${redactEmail(recipient)} (messageId=${info.messageId ?? "unknown"}).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(
      `verification failed: ${sanitize(message, [config.pass, config.user])}`,
    );
  } finally {
    transport.close?.();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `[brevo-smtp] ${sanitize(message, [process.env.SMTP_PASS, process.env.SMTP_USER])}`,
  );
  process.exitCode = 1;
});
