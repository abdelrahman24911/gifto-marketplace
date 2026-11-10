import fs from "node:fs";
import path from "node:path";

const TESTS_DIR = path.join(process.cwd(), "tests");

const FORBIDDEN_RULES = [
  {
    pattern: /from\s+["']@playwright\/test["']/,
    message:
      "importing from '@playwright/test' bypasses the guarded fixture; import { test, expect } from './fixtures' instead.",
  },
  {
    pattern: /require\(\s*["']@playwright\/test["']\s*\)/,
    message:
      "requiring '@playwright/test' bypasses the guarded fixture; import { test, expect } from './fixtures' instead.",
  },
  {
    pattern: /from\s+["']playwright(?:-core)?["']/,
    message:
      "direct playwright/playwright-core imports bypass the guarded fixture.",
  },
  {
    pattern: /\bpage\.request\b|\bcontext\.request\b/,
    message:
      "APIRequestContext requests bypass the browser route guard; use page.goto/page.evaluate GET/HEAD navigation only.",
  },
];

function collectSpecFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSpecFiles(fullPath);
    return entry.name.endsWith(".spec.ts") ? [fullPath] : [];
  });
}

export default async function globalSetup(): Promise<void> {
  const violations: string[] = [];

  for (const file of collectSpecFiles(TESTS_DIR)) {
    const source = fs.readFileSync(file, "utf8");

    for (const rule of FORBIDDEN_RULES) {
      const match = rule.pattern.exec(source);
      if (!match || match.index === undefined) continue;

      const line = source.slice(0, match.index).split("\n").length;
      violations.push(
        `${path.relative(process.cwd(), file)}:${line} - ${rule.message}`,
      );
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Read-only test policy violation(s):\n${violations.join("\n")}`,
    );
  }
}
