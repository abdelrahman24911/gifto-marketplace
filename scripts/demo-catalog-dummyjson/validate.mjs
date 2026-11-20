#!/usr/bin/env node
import {
  DATASET_ID,
  DATASET_VERSION,
  IMAGE_DIR,
  validateLocalDataset,
} from "./shared.mjs";

async function main() {
  const result = await validateLocalDataset();
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`- ${error}`);
    throw new Error(`DummyJSON demo dataset has ${result.errors.length} issue(s).`);
  }
  console.log(
    `Validated ${DATASET_ID}@${DATASET_VERSION}: ${result.products.length} products, ${Object.keys(result.groupCounts).length} curation groups, ${Object.keys(result.vendorCounts).length} vendors, ${result.products.length} local WebP images in ${IMAGE_DIR}.`,
  );
  console.log("Categories:", result.categoryCounts, "Source stock, ratings and reviews: not imported.");
}

main().catch((error) => {
  console.error(`DummyJSON demo dataset validation failed: ${error.message}`);
  process.exit(1);
});
