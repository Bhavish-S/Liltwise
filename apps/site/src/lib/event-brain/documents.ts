import mammoth from 'mammoth';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 40_000;
const MAX_DOCX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 100;

export class DocumentExtractionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'DocumentExtractionError';
    this.status = status;
    this.code = code;
  }
}

export class UploadTooLargeError extends DocumentExtractionError {
  constructor() {
    super(413, 'FILE_TOO_LARGE', 'Choose a file smaller than 10 MiB.');
  }
}

export async function readLimitedBytes(request: Request, maximumBytes = MAX_UPLOAD_BYTES): Promise<Buffer> {
  const statedLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(statedLength) && statedLength > maximumBytes) throw new UploadTooLargeError();
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new UploadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

function normalizeFilename(filename: string): { filename: string; extension: string } {
  const safeName = filename.split(/[\\/]/u).pop()?.trim() ?? '';
  if (!safeName || safeName.length > 255 || safeName.startsWith('.')) {
    throw new DocumentExtractionError(415, 'UNSUPPORTED_FILE', 'Choose a TXT, Markdown, PDF, or DOCX file.');
  }
  const extension = safeName.split('.').pop()?.toLocaleLowerCase('en-US') ?? '';
  if (!['txt', 'md', 'markdown', 'pdf', 'docx'].includes(extension)) {
    throw new DocumentExtractionError(415, 'UNSUPPORTED_FILE', 'Choose a TXT, Markdown, PDF, or DOCX file.');
  }
  return { filename: safeName, extension };
}

function validateMimeType(extension: string, mimeType: string): void {
  const normalized = mimeType.split(';', 1)[0]?.trim().toLocaleLowerCase('en-US') ?? '';
  if (!normalized) return;
  const accepted = extension === 'pdf'
    ? ['application/pdf']
    : extension === 'docx'
      ? ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      : ['text/plain', 'text/markdown', 'application/octet-stream'];
  if (!accepted.includes(normalized)) {
    throw new DocumentExtractionError(415, 'FILE_TYPE_MISMATCH', 'The file type does not match its extension. Choose a TXT, Markdown, PDF, or DOCX file.');
  }
}

function finalizeText(text: string): string {
  const normalized = text.split(String.fromCharCode(0)).join('').replace(/\r\n?/gu, '\n').trim();
  if (!normalized) {
    throw new DocumentExtractionError(422, 'NO_EXTRACTABLE_TEXT', 'No readable text was found. Scanned PDFs need OCR, which is not included.');
  }
  if (normalized.length > MAX_EXTRACTED_CHARACTERS) {
    throw new DocumentExtractionError(413, 'EXTRACTED_TEXT_TOO_LARGE', 'The extracted text is longer than 40,000 characters. Shorten the document and try again.');
  }
  return normalized;
}

function decodeUtf8(buffer: Buffer): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if ([...text].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 9 || (code > 10 && code < 13) || (code > 13 && code < 32);
    })) {
      throw new Error('Binary text file');
    }
    return text;
  } catch {
    throw new DocumentExtractionError(422, 'UNREADABLE_TEXT', 'This text file is not readable UTF-8. Save it as UTF-8 and try again.');
  }
}

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from('%PDF-'));
}

interface ZipEntryInfo {
  name: string;
  uncompressedBytes: number;
}

function inspectDocxArchive(buffer: Buffer): ZipEntryInfo[] {
  const minimumEocd = 22;
  const searchStart = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let index = buffer.length - minimumEocd; index >= searchStart; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new DocumentExtractionError(422, 'UNREADABLE_DOCX', 'This DOCX file is damaged or unreadable.');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount === 0 || entryCount > 1000 || directoryOffset + directorySize > eocd) {
    throw new DocumentExtractionError(422, 'UNREADABLE_DOCX', 'This DOCX file is damaged or unreadable.');
  }

  const entries: ZipEntryInfo[] = [];
  let cursor = directoryOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new DocumentExtractionError(422, 'UNREADABLE_DOCX', 'This DOCX file is damaged or unreadable.');
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const uncompressedBytes = buffer.readUInt32LE(cursor + 24);
    const filenameBytes = buffer.readUInt16LE(cursor + 28);
    const extraBytes = buffer.readUInt16LE(cursor + 30);
    const commentBytes = buffer.readUInt16LE(cursor + 32);
    const entryEnd = cursor + 46 + filenameBytes + extraBytes + commentBytes;
    if (entryEnd > buffer.length || (flags & 1) !== 0 || compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff) {
      throw new DocumentExtractionError(422, 'UNREADABLE_DOCX', 'This DOCX file is encrypted or uses an unsupported archive format.');
    }
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + filenameBytes);
    if (name.startsWith('/') || name.split('/').includes('..')) {
      throw new DocumentExtractionError(422, 'UNREADABLE_DOCX', 'This DOCX contains an unsafe archive path.');
    }
    totalUncompressed += uncompressedBytes;
    if (totalUncompressed > MAX_DOCX_UNCOMPRESSED_BYTES || (compressedBytes === 0 && uncompressedBytes > 0)) {
      throw new DocumentExtractionError(413, 'DOCX_EXPANSION_TOO_LARGE', 'This DOCX expands beyond the safe processing limit.');
    }
    entries.push({ name, uncompressedBytes });
    cursor = entryEnd;
  }
  if (!entries.some(({ name }) => name === '[Content_Types].xml') || !entries.some(({ name }) => name === 'word/document.xml')) {
    throw new DocumentExtractionError(422, 'UNREADABLE_DOCX', 'This file is not a readable Word document.');
  }
  return entries;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    useWasm: false,
    useWorkerFetch: false,
    stopAtErrors: true,
  });
  try {
    const document = await task.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new DocumentExtractionError(413, 'PDF_TOO_MANY_PAGES', 'This PDF has more than 100 pages. Split it into smaller files and try again.');
    }
    const pages: string[] = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.flatMap((item) => 'str' in item ? [item.str] : []).join(' ');
      characterCount += text.length;
      if (characterCount > MAX_EXTRACTED_CHARACTERS) {
        throw new DocumentExtractionError(413, 'EXTRACTED_TEXT_TOO_LARGE', 'The extracted text is longer than 40,000 characters. Shorten the document and try again.');
      }
      pages.push(text);
    }
    return pages.join('\n\n');
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError(422, 'UNREADABLE_PDF', 'This PDF could not be read. Check that it is not damaged or password-protected.');
  } finally {
    await task.destroy();
  }
}

export async function extractEventGuideText(filename: string, mimeType: string, buffer: Buffer): Promise<{ filename: string; text: string }> {
  const safeName = normalizeFilename(filename);
  validateMimeType(safeName.extension, mimeType);
  if (buffer.length === 0) throw new DocumentExtractionError(422, 'EMPTY_FILE', 'This file is empty. Choose a file that contains event notes.');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new UploadTooLargeError();

  if (safeName.extension === 'txt' || safeName.extension === 'md' || safeName.extension === 'markdown') {
    if (isPdf(buffer) || buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new DocumentExtractionError(415, 'FILE_TYPE_MISMATCH', 'The file content does not match its text-file extension.');
    }
    return { filename: safeName.filename, text: finalizeText(decodeUtf8(buffer)) };
  }

  if (safeName.extension === 'pdf') {
    if (!isPdf(buffer)) throw new DocumentExtractionError(415, 'FILE_TYPE_MISMATCH', 'The file content does not appear to be a PDF.');
    return { filename: safeName.filename, text: finalizeText(await extractPdfText(buffer)) };
  }

  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new DocumentExtractionError(415, 'FILE_TYPE_MISMATCH', 'The file content does not appear to be a DOCX document.');
  }
  inspectDocxArchive(buffer);
  try {
    const result = await mammoth.extractRawText({ buffer });
    return { filename: safeName.filename, text: finalizeText(result.value) };
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError(422, 'UNREADABLE_DOCX', 'This DOCX file could not be read. Check that it is not damaged.');
  }
}
