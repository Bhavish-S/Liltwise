import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentExtractionError, extractEventGuideText, readLimitedBytes, UploadTooLargeError } from './documents.ts';

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localRecord = Buffer.concat([local, name, content]);
    localParts.push(localRecord);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([central, name]));
    localOffset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function minimalDocx(): Buffer {
  return makeStoredZip([
    { name: '[Content_Types].xml', content: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', content: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', content: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Families are invited to visit the student project tables.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>' },
  ]);
}

function minimalPdf(text: string): Buffer {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(`BT /F1 16 Tf 60 700 Td (${escaped}) Tj ET`)} >>\nstream\nBT /F1 16 Tf 60 700 Td (${escaped}) Tj ET\nendstream`,
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(source);
}

test('extracts UTF-8 text and Markdown for review', async () => {
  const text = await extractEventGuideText('agenda.md', 'text/markdown', Buffer.from('# Run of show\n\nWelcome the families.', 'utf8'));
  assert.equal(text.filename, 'agenda.md');
  assert.equal(text.text, '# Run of show\n\nWelcome the families.');
});

test('extracts real text from a PDF without running OCR', async () => {
  const extracted = await extractEventGuideText('brief.pdf', 'application/pdf', minimalPdf('Families visit the project tables'));
  assert.match(extracted.text, /Families visit the project tables/u);
  await assert.rejects(extractEventGuideText('scan.pdf', 'application/pdf', minimalPdf('')), (error: unknown) => error instanceof DocumentExtractionError && error.code === 'NO_EXTRACTABLE_TEXT' && error.message.includes('OCR'));
});

test('extracts raw text from a valid DOCX archive', async () => {
  const extracted = await extractEventGuideText('organizer.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', minimalDocx());
  assert.match(extracted.text, /student project tables/u);
});

test('rejects unsupported, mismatched, empty, damaged, and oversized files clearly', async () => {
  await assert.rejects(extractEventGuideText('guide.exe', 'application/octet-stream', Buffer.from('run me')), (error: unknown) => error instanceof DocumentExtractionError && error.status === 415);
  await assert.rejects(extractEventGuideText('guide.pdf', 'text/plain', Buffer.from('not pdf')), (error: unknown) => error instanceof DocumentExtractionError && error.code === 'FILE_TYPE_MISMATCH');
  await assert.rejects(extractEventGuideText('empty.txt', 'text/plain', Buffer.alloc(0)), (error: unknown) => error instanceof DocumentExtractionError && error.code === 'EMPTY_FILE');
  await assert.rejects(extractEventGuideText('broken.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK\x03\x04broken')), (error: unknown) => error instanceof DocumentExtractionError && error.code === 'UNREADABLE_DOCX');
  await assert.rejects(readLimitedBytes(new Request('http://localhost', { method: 'POST', body: new Uint8Array(21) }), 20), (error: unknown) => error instanceof UploadTooLargeError);
  await assert.rejects(extractEventGuideText('large.txt', 'text/plain', Buffer.from('a'.repeat(40_001))), (error: unknown) => error instanceof DocumentExtractionError && error.code === 'EXTRACTED_TEXT_TOO_LARGE');
});
