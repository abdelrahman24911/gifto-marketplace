#!/usr/bin/env node
import crypto from "node:crypto";

import {
  ADMIN_EMAIL,
  assertTarget,
  findUserByEmail,
  loadEnv,
  parseArgs,
  readCredentials,
  serviceClient,
  writeCredentials,
} from "./shared.mjs";

function usage() {
  console.log(`Usage:
  node scripts/demo-seed/reset-admin-password.mjs --verify
  node scripts/demo-seed/reset-admin-password.mjs --apply

Rotates the local demo platform-admin password and stores it only in
.demo-catalog/credentials.json. The password is never printed.`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    usage();
    return;
  }
  if (!args.verify && !args.apply) {
    usage();
    throw new Error("Choose --verify or --apply.");
  }

  loadEnv();
  const target = assertTarget();
  const db = serviceClient(target);

  const user = await findUserByEmail(db, ADMIN_EMAIL);
  if (!user) throw new Error(`${ADMIN_EMAIL} does not exist in this project.`);

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id, email, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(`profile lookup failed: ${profileError.message}`);
  if (!profile) throw new Error(`${ADMIN_EMAIL} has no profile row.`);

  if (args.verify) {
    console.log(
      `Verified ${ADMIN_EMAIL}: profile=${profile.id}, platform-admin=${profile.is_platform_admin}, email-confirmed=${Boolean(user.email_confirmed_at)}.`,
    );
    console.log("No password changed.");
    return;
  }

  if (!profile.is_platform_admin) {
    const { error } = await db
      .from("profiles")
      .update({ is_platform_admin: true })
      .eq("id", user.id);
    if (error) throw new Error(`could not promote ${ADMIN_EMAIL}: ${error.message}`);
  }

  const password = crypto.randomBytes(24).toString("base64url");
  const { error: updateError } = await db.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (updateError) throw new Error(`password update failed: ${updateError.message}`);

  const credentials = await readCredentials();
  credentials["platform-admin"] = {
    email: ADMIN_EMAIL,
    password,
    role: "Platform admin",
    vendor: "Gifto Platform",
    rotatedAt: new Date().toISOString(),
  };
  await writeCredentials(credentials);

  console.log(`Rotated ${ADMIN_EMAIL}; the new password is stored in .demo-catalog/credentials.json.`);
  console.log("Old sessions remain valid until they expire or are revoked.");
}

main().catch((error) => {
  console.error(`Admin reset failed: ${error.message}`);
  process.exit(1);
});
