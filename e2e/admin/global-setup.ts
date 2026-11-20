import {
  cleanupE2EData,
  resetFixture,
  resetPickerFixture,
  resetTaggingFixture,
  seedAdmin,
  seedVendor,
} from "./fixture-admin";

export default async function globalSetup() {
  await cleanupE2EData();
  await seedAdmin();
  await seedVendor();
  await resetFixture();
  await resetPickerFixture();
  await resetTaggingFixture();
}
