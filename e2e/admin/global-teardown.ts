import { cleanupE2EData } from "./fixture-admin";

export default async function globalTeardown() {
  await cleanupE2EData();
}
