#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MAX_LINES = 800;
const MAX_LINES_PER_FILE = 800;

const root = process.cwd();
const canvasDir = path.join(
  root,
  "src/features/boards/components/realtime-canvas",
);
const exts = new Set([".ts", ".tsx"]);

function walk(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, results);
    } else if (exts.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk(canvasDir);
let failed = false;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const lineCount = source.split("\n").length;
  if (lineCount > MAX_LINES_PER_FILE) {
    failed = true;
    console.error(
      `[canvas-size] ${path.relative(root, file)} has ${lineCount} lines (max ${MAX_LINES}).`,
    );
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(
    `[canvas-size] all ${files.length} realtime-canvas files are <= ${MAX_LINES} lines.`,
  );
}
