import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const rootDir = process.cwd();

const fileList = execSync("rg --files -g '*.ts' -g '*.tsx'", {
  cwd: rootDir,
  stdio: ["ignore", "pipe", "ignore"],
})
  .toString("utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .filter((line) => !line.endsWith(".d.ts"))
  .filter((line) => !line.startsWith("node_modules/"))
  .filter((line) => !line.startsWith(".next/"))
  .filter((line) => !line.startsWith("storybook-static/"))
  .filter((line) => !line.startsWith("playwright-report/"))
  .filter((line) => !line.startsWith("test-results/"));

function toDisplayName(name) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toSummary(name, kind) {
  const displayName = toDisplayName(name || "function");
  if (kind === "constructor") {
    return "Initializes this class instance";
  }

  if (displayName.startsWith("is ")) {
    return `Returns whether ${displayName.slice(3)} is true`;
  }

  if (displayName.startsWith("get ")) {
    return `Gets ${displayName.slice(4)}`;
  }

  if (displayName.startsWith("set ")) {
    return `Sets ${displayName.slice(4)}`;
  }

  if (displayName.startsWith("create ")) {
    return `Creates ${displayName.slice(7)}`;
  }

  if (displayName.startsWith("build ")) {
    return `Builds ${displayName.slice(6)}`;
  }

  if (displayName.startsWith("parse ")) {
    return `Parses ${displayName.slice(6)}`;
  }

  return `Handles ${displayName}`;
}

function getLineIndent(sourceText, position) {
  const lineStart = sourceText.lastIndexOf("\n", position - 1) + 1;
  const before = sourceText.slice(lineStart, position);
  const match = before.match(/^\s*/);
  return match ? match[0] : "";
}

function hasJsDoc(node) {
  return ts.getJSDocCommentsAndTags(node).length > 0;
}

function nodeName(node) {
  if (!node.name) {
    return null;
  }

  if (ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  if (ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)) {
    return node.name.text;
  }

  return node.name.getText();
}

let changedFiles = 0;
let insertedBlocks = 0;

for (const relativePath of fileList) {
  const absolutePath = path.join(rootDir, relativePath);
  const originalText = await fs.readFile(absolutePath, "utf8");
  const scriptKind = relativePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    relativePath,
    originalText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const insertions = new Map();
  const variableStatementPositions = new Set();

  function queueInsertion(node, name, kind = "function") {
    const start = node.getStart(sourceFile, false);
    if (insertions.has(start)) {
      return;
    }

    const indent = getLineIndent(originalText, start);
    const summary = toSummary(name, kind);
    const comment = `${indent}/**\n${indent} * ${summary}.\n${indent} */\n`;
    insertions.set(start, comment);
  }

  function visit(node) {
    if (ts.isFunctionDeclaration(node)) {
      if (node.body && node.name && !hasJsDoc(node)) {
        queueInsertion(node, node.name.text);
      }
    } else if (ts.isMethodDeclaration(node)) {
      if (node.body && !hasJsDoc(node)) {
        queueInsertion(node, nodeName(node) ?? "method");
      }
    } else if (ts.isConstructorDeclaration(node)) {
      if (node.body && !hasJsDoc(node)) {
        queueInsertion(node, "constructor", "constructor");
      }
    } else if (ts.isVariableDeclaration(node)) {
      const isFunctionInitializer =
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer));

      if (
        isFunctionInitializer &&
        ts.isIdentifier(node.name) &&
        ts.isVariableDeclarationList(node.parent) &&
        ts.isVariableStatement(node.parent.parent)
      ) {
        const variableStatement = node.parent.parent;
        const statementStart = variableStatement.getStart(sourceFile, false);

        if (
          !hasJsDoc(node) &&
          !hasJsDoc(variableStatement) &&
          !variableStatementPositions.has(statementStart)
        ) {
          queueInsertion(variableStatement, node.name.text);
          variableStatementPositions.add(statementStart);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (insertions.size === 0) {
    continue;
  }

  const sorted = Array.from(insertions.entries()).sort(
    (left, right) => right[0] - left[0],
  );
  let nextText = originalText;

  for (const [position, comment] of sorted) {
    nextText = `${nextText.slice(0, position)}${comment}${nextText.slice(position)}`;
  }

  if (nextText !== originalText) {
    await fs.writeFile(absolutePath, nextText, "utf8");
    changedFiles += 1;
    insertedBlocks += insertions.size;
  }
}

console.info(
  `Inserted ${insertedBlocks} JSDoc blocks across ${changedFiles} files.`,
);
