#!/usr/bin/env node
import { validateLocalDataset } from "./shared.mjs";

async function main() {
  const result = await validateLocalDataset();
  if (result.errors.length > 0) {
    console.error(`Demo catalogue validation failed with ${result.errors.length} issue(s):`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `Demo catalogue valid: ${result.products.length} products, ${Object.keys(result.vendorCounts).length} vendors, ${Object.keys(result.categoryCounts).length} categories, ${result.products.length} local JPEGs.`,
  );
  console.log("Collections:", result.collectionCounts);
  console.log("Vendors:", result.vendorCounts);
  console.log(
    "Occasion proposal:",
    result.proposal.occasions.map((occasion) => `${occasion.slug}=${occasion.picks.length}`).join(", "),
  );
}

main().catch((error) => {
  console.error(`Demo catalogue validation failed: ${error.message}`);
  process.exit(1);
});
