#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_LINES = 300;

const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const EXCLUDED_PATH_SEGMENTS = ["/e2e/"];
const EXCLUDED_NAME_PATTERNS = [".test.", ".stories."];

function collectSourceFiles(directory) {
  const entries = readdirSync(directory);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) {
        continue;
      }
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!SOURCE_EXTENSIONS.some((extension) => fullPath.endsWith(extension))) {
      continue;
    }
    const normalized = `/${fullPath}`;
    if (
      EXCLUDED_PATH_SEGMENTS.some((segment) => normalized.includes(segment)) ||
      EXCLUDED_NAME_PATTERNS.some((pattern) => normalized.includes(pattern))
    ) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function countLines(filePath) {
  const content = readFileSync(filePath, "utf8");
  if (content.length === 0) {
    return 0;
  }

  const lineBreaks = content.match(/\n/g);
  return (lineBreaks?.length ?? 0) + 1;
}

function main() {
  const files = collectSourceFiles("src");

  const offenders = files
    .map((filePath) => ({
      filePath,
      lineCount: countLines(filePath),
    }))
    .filter((entry) => entry.lineCount > MAX_LINES)
    .sort((left, right) => right.lineCount - left.lineCount);

  if (offenders.length === 0) {
    process.stdout.write(
      `OK: all scoped source files are <= ${MAX_LINES} lines.\n`,
    );
    return;
  }

  process.stderr.write(
    `Found ${offenders.length} source files above ${MAX_LINES} lines:\n`,
  );
  offenders.forEach((offender) => {
    process.stderr.write(`- ${offender.lineCount}\t${offender.filePath}\n`);
  });

  process.exit(1);
}

main();
