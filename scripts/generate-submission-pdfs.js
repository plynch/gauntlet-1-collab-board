#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdLineToHtml(line, state) {
  if (/^\s*$/.test(line)) {
    state.inTable = false;
    return "<p>&nbsp;</p>";
  }

  const heading = /^(#{1,3})\s+(.*)$/.exec(line);
  if (heading) {
    state.inTable = false;
    return `<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>`;
  }

  if (/^\|\s?.+\|$/.test(line)) {
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => escapeHtml(cell.trim()) || "&nbsp;");
    state.inTable = true;
    return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  }

  if (/^-\s+/.test(line)) {
    state.inTable = false;
    return `<li>${escapeHtml(line.replace(/^-\s+/, ""))}</li>`;
  }

  const row = escapeHtml(line).replace(/`([^`]+)`/g, (_, text) => `<code>${text}</code>`);
  state.inTable = false;
  return `<p>${row}</p>`;
}

function wrapLists(lines) {
  const out = [];
  let listOpen = false;

  for (const line of lines) {
    const isBullet = /^\s*<li>/.test(line);
    if (isBullet && !listOpen) {
      out.push("<ul>");
      listOpen = true;
    }
    if (!isBullet && listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
    out.push(line);
  }

  if (listOpen) {
    out.push("</ul>");
  }

  return out;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const state = { inTable: false };
  const parsed = [];
  const tableRows = [];

  for (const line of lines) {
    const html = mdLineToHtml(line, state);

    if (/^<tr>/.test(html)) {
      tableRows.push(html);
      continue;
    }

    if (tableRows.length > 0) {
      if (tableRows.length === 1) {
        parsed.push(tableRows.join("\n"));
      } else {
        parsed.push(`<table>${tableRows.join("\n")}</table>`);
      }
      tableRows.length = 0;
    }

    parsed.push(html);
  }

  if (tableRows.length > 0) {
    if (tableRows.length === 1) {
      parsed.push(tableRows.join("\n"));
    } else {
      parsed.push(`<table>${tableRows.join("\n")}</table>`);
    }
  }

  return wrapLists(parsed).join("\n");
}

async function generatePdfFromMarkdown(markdownPath) {
  const absPath = path.resolve(markdownPath);
  const markdown = fs.readFileSync(absPath, "utf8");
  const content = mdToHtml(markdown);
  const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 28px; color: #111; }
    h1, h2, h3 { color: #111; }
    h1 { font-size: 24px; }
    h2 { font-size: 20px; }
    h3 { font-size: 16px; }
    p { font-size: 12px; line-height: 1.45; }
    code { font-family: ui-monospace, Menlo, Consolas, monospace; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
    ul { margin-top: 0; }
    td { border: 1px solid #ccc; padding: 4px 8px; }
    table { border-collapse: collapse; margin: 8px 0 16px; }
  </style></head><body>${content}</body></html>`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  await page.setContent(html, { waitUntil: "load" });

  const pdfPath = absPath.replace(/\.md$/, ".pdf");
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    printBackground: true,
    margin: {
      top: "20px",
      right: "20px",
      bottom: "20px",
      left: "20px",
    },
  });

  await browser.close();
  console.log(`Generated ${pdfPath}`);
}

async function main() {
  const files = process.argv.slice(2);
  const docs = files.length
    ? files
    : [
        "AI_DEVELOPMENT_LOG.md",
        "AI_COST_ANALYSIS.md",
      ];

  for (const file of docs) {
    await generatePdfFromMarkdown(file);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
