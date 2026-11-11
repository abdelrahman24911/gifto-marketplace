import {
  cleanupE2EData,
  resetFixture,
  resetPickerFixture,
  resetTaggingFixture,
  seedAdmin,
} from "./fixture-admin";

export default async function globalSetup() {
  await cleanupE2EData();
  await seedAdmin();
  await resetFixture();
  await resetPickerFixture();
  await resetTaggingFixture();
}
