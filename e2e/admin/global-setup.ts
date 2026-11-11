import {
  cleanupE2EData,
  resetFixture,
  resetPickerFixture,
  seedAdmin,
} from "./fixture-admin";

export default async function globalSetup() {
  await cleanupE2EData();
  await seedAdmin();
  await resetFixture();
  await resetPickerFixture();
}
