#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_LINES = 300;

const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const EXCLUDED_PATH_SEGMENTS = ["/e2e/"];
const EXCLUDED_NAME_PATTERNS = [".test.", ".stories."];

function isScopedSourceFile(filePath) {
  const normalized = `/${filePath}`;
  const hasExtension = SOURCE_EXTENSIONS.some((extension) =>
    normalized.endsWith(extension),
  );
  if (!hasExtension) {
    return false;
  }

  if (!normalized.startsWith("/src/")) {
    return false;
  }

  if (
    EXCLUDED_PATH_SEGMENTS.some((segment) => normalized.includes(segment)) ||
    EXCLUDED_NAME_PATTERNS.some((pattern) => normalized.includes(pattern))
  ) {
    return false;
  }

  return true;
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
  const fileListRaw = execSync("git ls-files", { encoding: "utf8" });
  const files = fileListRaw
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter(isScopedSourceFile);

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
