#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function sanitizeMarkdownLine(line) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\|/g, ' | ')
    .replace(/\*\*/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+$/u, '');
}

function escapePdfText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '')
    .replace(/\n/g, '');
}

function buildPdfBody(lines) {
  const contentLines = ['BT', '/F1 11 Tf', '50 770 Td'];
  for (const raw of lines) {
    const line = sanitizeMarkdownLine(raw);
    if (!line.trim()) {
      contentLines.push('0 -12 Td');
      continue;
    }

    if (/^##/.test(raw) || /^#/.test(raw)) {
      contentLines.push('ET');
      contentLines.push('/F1 13 Tf');
      contentLines.push('0 -20 Td');
      contentLines.push('1 0 0 1 50 770 Tm');
      contentLines.push(`/F1 13 Tf`);
      contentLines.push(`(${escapePdfText(line)}) Tj`);
      contentLines.push('0 -14 Td');
      contentLines.push('ET');
      contentLines.push('BT');
      contentLines.push('/F1 11 Tf');
      continue;
    }

    contentLines.push(`(${escapePdfText(line)}) Tj`);
    contentLines.push('0 -12 Td');
  }

  contentLines.push('ET');
  return `${contentLines.join('\n')}\n`;
}

function writePdf(markdownPath) {
  const markdownPathAbsolute = path.resolve(markdownPath);
  const markdown = fs.readFileSync(markdownPathAbsolute, 'utf8');
  const lines = markdown.split(/\r?\n/);

  const content = buildPdfBody(lines);
  let output = '%PDF-1.4\n';
  const objects = [];
  const offsets = [];

  const addObject = (body) => {
    const id = objects.length + 1;
    offsets[id] = output.length;
    const payload = `${id} 0 obj\n${body}\nendobj\n`;
    objects.push(payload);
    output += payload;
    return id;
  };

  const contentLength = Buffer.byteLength(content, 'utf8');
  const fontId = 4;
  const contentsId = 5;

  const catalog = `<< /Type /Catalog /Pages 2 0 R >>`;
  const pages = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  const page = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentsId} 0 R >>`;
  const font = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  const stream = `<< /Length ${contentLength} >>\nstream\n${content}endstream`;

  const catalogId = addObject(catalog);
  const pagesId = addObject(pages);
  const pageId = addObject(page);
  const fontObj = addObject(font);
  const contentsObj = addObject(stream);

  if (catalogId !== 1 || pagesId !== 2 || pageId !== 3 || fontObj !== 4 || contentsObj !== 5) {
    throw new Error('Unexpected PDF object numbering.');
  }

  const xrefOffset = output.length;
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    output += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfPath = markdownPathAbsolute.replace(/\.md$/, '.pdf');
  fs.writeFileSync(pdfPath, output, 'utf8');
  return path.basename(pdfPath);
}

function main() {
  const target = process.argv[2] || 'AI_COST_ANALYSIS.md';
  const filePath = path.resolve(target);
  if (!fs.existsSync(filePath)) {
    console.error(`Cost analysis markdown not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const outputName = writePdf(filePath);
  console.log(`Generated ${outputName}`);
}

main();
