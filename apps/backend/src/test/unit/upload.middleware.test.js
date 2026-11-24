import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  resumeUpload,
  avatarUpload,
  validateFileSignature,
  scanBufferForMalware,
  validateDocxArchive,
  validatePdfStructure,
  validateUploadedResume,
  validateUploadedAvatar,
  quarantineFile,
} from '../../middlewares/upload.middleware.js';

describe('Upload Middleware (Unit Tests)', () => {
  it('has file filter configured for resumes', () => {
    expect(resumeUpload).toBeDefined();
    expect(typeof resumeUpload.single).toBe('function');
  });

  it('accepts allowed resume file extensions (.pdf, .doc, .docx)', () => {
    const fileFilter = resumeUpload.fileFilter;
    const allowedFiles = [
      { originalname: 'alex_resume.pdf', mimetype: 'application/pdf' },
      {
        originalname: 'alex_cv.docx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      { originalname: 'old_resume.doc', mimetype: 'application/msword' },
    ];

    allowedFiles.forEach((file) => {
      const callback = vi.fn();
      fileFilter({}, file, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  it('rejects disallowed file types (.exe, .sh, .svg, .php)', () => {
    const fileFilter = resumeUpload.fileFilter;
    const maliciousFiles = [
      { originalname: 'exploit.exe', mimetype: 'application/x-msdownload' },
      { originalname: 'script.sh', mimetype: 'text/x-shellscript' },
      { originalname: 'xss_vector.svg', mimetype: 'image/svg+xml' },
      { originalname: 'shell.php', mimetype: 'application/x-httpd-php' },
    ];

    maliciousFiles.forEach((file) => {
      const callback = vi.fn();
      fileFilter({}, file, callback);
      expect(callback).toHaveBeenCalled();
      const [error, accepted] = callback.mock.calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(
        /Only PDF, DOC, and DOCX files are allowed/i
      );
      expect(accepted).toBe(false);
    });
  });

  describe('Avatar Upload Security (Issue #176)', () => {
    it('has file filter configured for avatars', () => {
      expect(avatarUpload).toBeDefined();
      expect(typeof avatarUpload.single).toBe('function');
    });

    it('accepts allowed image formats with valid MIME types (.jpg, .jpeg, .png, .webp)', () => {
      const fileFilter = avatarUpload.fileFilter;
      const validImages = [
        { originalname: 'profile.jpg', mimetype: 'image/jpeg' },
        { originalname: 'photo.jpeg', mimetype: 'image/jpeg' },
        { originalname: 'headshot.png', mimetype: 'image/png' },
        { originalname: 'picture.webp', mimetype: 'image/webp' },
      ];

      validImages.forEach((file) => {
        const callback = vi.fn();
        fileFilter({}, file, callback);
        expect(callback).toHaveBeenCalledWith(null, true);
      });
    });

    it('rejects disallowed file extensions (.pdf, .exe, .sh, .txt)', () => {
      const fileFilter = avatarUpload.fileFilter;
      const invalidFiles = [
        { originalname: 'resume.pdf', mimetype: 'application/pdf' },
        { originalname: 'script.sh', mimetype: 'text/x-shellscript' },
        { originalname: 'notes.txt', mimetype: 'text/plain' },
      ];

      invalidFiles.forEach((file) => {
        const callback = vi.fn();
        fileFilter({}, file, callback);
        expect(callback).toHaveBeenCalled();
        const [error, accepted] = callback.mock.calls[0];
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/Only JPG, JPEG, PNG, and WebP are permitted/i);
        expect(accepted).toBe(false);
      });
    });

    it('rejects dangerous double-extension files disguised as images', () => {
      const fileFilter = avatarUpload.fileFilter;
      const doubleExtFiles = [
        { originalname: 'exploit.php.png', mimetype: 'image/png' },
        { originalname: 'payload.html.jpg', mimetype: 'image/jpeg' },
        { originalname: 'xss.svg.png', mimetype: 'image/png' },
        { originalname: 'malware.exe.webp', mimetype: 'image/webp' },
      ];

      doubleExtFiles.forEach((file) => {
        const callback = vi.fn();
        fileFilter({}, file, callback);
        expect(callback).toHaveBeenCalled();
        const [error, accepted] = callback.mock.calls[0];
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/Potentially unsafe file format detected/i);
        expect(accepted).toBe(false);
      });
    });

    it('rejects mismatched MIME types (e.g. .png with text/html MIME)', () => {
      const fileFilter = avatarUpload.fileFilter;
      const mismatchedFiles = [
        { originalname: 'fake.png', mimetype: 'text/html' },
        { originalname: 'payload.jpg', mimetype: 'application/javascript' },
      ];

      mismatchedFiles.forEach((file) => {
        const callback = vi.fn();
        fileFilter({}, file, callback);
        expect(callback).toHaveBeenCalled();
        const [error, accepted] = callback.mock.calls[0];
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/MIME type does not match/i);
        expect(accepted).toBe(false);
      });
    });
  });

  describe('SEC-03: Magic-Byte & File Signature Validation', () => {
    it('accepts valid PDF magic bytes (%PDF-)', () => {
      const pdfBuffer = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj');
      const res = validateFileSignature(pdfBuffer, '.pdf');
      expect(res.valid).toBe(true);
      expect(res.mime).toBe('application/pdf');
    });

    it('rejects PDF file when magic bytes are missing (forged MIME type)', () => {
      const forgedBuffer = Buffer.from('<html><body>Fake PDF with HTML content</body></html>');
      const res = validateFileSignature(forgedBuffer, '.pdf');
      expect(res.valid).toBe(false);
      expect(res.code).toBe('ERR_INVALID_MAGIC_BYTES');
      expect(res.error).toMatch(/File contents do not match claimed PDF document format/i);
    });

    it('accepts valid DOCX ZIP magic bytes (PK\\x03\\x04)', () => {
      const docxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
      const res = validateFileSignature(docxHeader, '.docx');
      expect(res.valid).toBe(true);
      expect(res.mime).toContain('wordprocessingml.document');
    });

    it('rejects DOCX file when magic bytes are not ZIP', () => {
      const fakeDocx = Buffer.from('This is definitely not a zip file');
      const res = validateFileSignature(fakeDocx, '.docx');
      expect(res.valid).toBe(false);
      expect(res.code).toBe('ERR_INVALID_MAGIC_BYTES');
    });

    it('accepts valid legacy Word DOC OLE CFB signature (D0 CF 11 E0 A1 B1 1A E1)', () => {
      const docBuffer = Buffer.from([
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00,
      ]);
      const res = validateFileSignature(docBuffer, '.doc');
      expect(res.valid).toBe(true);
      expect(res.mime).toBe('application/msword');
    });

    it('accepts valid image magic bytes for JPG, PNG, and WebP', () => {
      const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(validateFileSignature(jpgBuf, '.jpg').valid).toBe(true);

      const pngBuf = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
      ]);
      expect(validateFileSignature(pngBuf, '.png').valid).toBe(true);

      const webpBuf = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      expect(validateFileSignature(webpBuf, '.webp').valid).toBe(true);
    });

    it('rejects empty or truncated buffers (< 4 bytes)', () => {
      const res = validateFileSignature(Buffer.from([0x01, 0x02]), '.pdf');
      expect(res.valid).toBe(false);
      expect(res.code).toBe('ERR_EMPTY_FILE');
    });
  });

  describe('SEC-03: Malware & Executable Binary Scanning', () => {
    it('detects and rejects standard EICAR test virus signature', () => {
      const eicar = Buffer.from(
        '%PDF-1.4\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n'
      );
      const res = scanBufferForMalware(eicar);
      expect(res.clean).toBe(false);
      expect(res.code).toBe('ERR_EICAR_DETECTED');
      expect(res.reason).toMatch(/EICAR test virus signature detected/i);
    });

    it('detects and rejects Windows PE executable binary (MZ header + PE pointer)', () => {
      const peBuffer = Buffer.alloc(128);
      peBuffer[0] = 0x4d; // 'M'
      peBuffer[1] = 0x5a; // 'Z'
      peBuffer.writeUInt32LE(0x40, 0x3c); // PE pointer at 0x40
      peBuffer.write('PE\0\0', 0x40, 'latin1'); // PE signature

      const res = scanBufferForMalware(peBuffer);
      expect(res.clean).toBe(false);
      expect(res.code).toBe('ERR_EXECUTABLE_DETECTED');
      expect(res.reason).toMatch(/Portable Executable/i);
    });

    it('detects and rejects Linux ELF binary executable', () => {
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]);
      const res = scanBufferForMalware(elfBuffer);
      expect(res.clean).toBe(false);
      expect(res.code).toBe('ERR_EXECUTABLE_DETECTED');
      expect(res.reason).toMatch(/ELF binary/i);
    });

    it('detects and rejects Unix shell scripts with shebang', () => {
      const shBuffer = Buffer.from('#!/bin/bash\nrm -rf /\n');
      const res = scanBufferForMalware(shBuffer);
      expect(res.clean).toBe(false);
      expect(res.code).toBe('ERR_SCRIPT_DETECTED');
      expect(res.reason).toMatch(/Shell script execution header/i);
    });

    it('detects and rejects web shells and PHP script payloads', () => {
      const phpShell = Buffer.from('%PDF-1.4\n<?php system($_GET["cmd"]); ?>');
      const res = scanBufferForMalware(phpShell);
      expect(res.clean).toBe(false);
      expect(res.code).toBe('ERR_MALICIOUS_SCRIPT_DETECTED');
      expect(res.reason).toMatch(/web shell pattern detected/i);
    });

    it('accepts clean resume content', () => {
      const cleanResume = Buffer.from(
        '%PDF-1.7\nCandidate Name: Jane Doe\nSenior Cloud Engineer\nSkills: AWS, Go, React\n'
      );
      const res = scanBufferForMalware(cleanResume);
      expect(res.clean).toBe(true);
    });
  });

  describe('SEC-03: DOCX Archive & Zip Bomb / Zip Slip Validation', () => {
    // Helper to build a minimal raw ZIP file buffer in memory
    const createZipBuffer = (entries = []) => {
      const localHeaders = [];
      entries.forEach((e) => {
        const nameBuf = Buffer.from(e.name, 'utf-8');
        const cSize = e.compressedSize !== undefined ? e.compressedSize : (e.content ? Buffer.byteLength(e.content) : 0);
        const dataBuf = Buffer.alloc(cSize);
        if (e.content) Buffer.from(e.content, 'utf-8').copy(dataBuf);
        const uSize = e.uncompressedSize !== undefined ? e.uncompressedSize : dataBuf.length;
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
        header.writeUInt16LE(20, 4); // version needed
        header.writeUInt16LE(0, 6); // flags
        header.writeUInt16LE(0, 8); // compression method (stored)
        header.writeUInt32LE(0, 10); // time/date
        header.writeUInt32LE(0, 14); // crc32
        header.writeUInt32LE(cSize, 18);
        header.writeUInt32LE(uSize, 22);
        header.writeUInt16LE(nameBuf.length, 26);
        header.writeUInt16LE(0, 28); // extra field len
        localHeaders.push(Buffer.concat([header, nameBuf, dataBuf]));
      });
      return Buffer.concat(localHeaders);
    };

    it('rejects DOCX archive containing Zip Slip (directory traversal paths)', () => {
      const maliciousZip = createZipBuffer([
        { name: '[Content_Types].xml', content: '<Types/>' },
        { name: '../../etc/passwd', content: 'root:x:0:0::/root:/bin/bash' },
      ]);
      const res = validateDocxArchive(maliciousZip);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('ERR_ZIP_SLIP_DETECTED');
      expect(res.error).toMatch(/Path traversal \(Zip Slip\)/i);
    });

    it('rejects DOCX archive containing embedded VBA macros (vbaProject.bin)', () => {
      const macroZip = createZipBuffer([
        { name: '[Content_Types].xml', content: '<Types/>' },
        { name: 'word/document.xml', content: '<w:document/>' },
        { name: 'word/vbaProject.bin', content: 'VBA MACRO BINARY PAYLOAD' },
      ]);
      const res = validateDocxArchive(macroZip);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('ERR_VBA_MACROS_DETECTED');
      expect(res.error).toMatch(/Embedded VBA macros detected/i);
    });

    it('rejects DOCX archive missing OpenXML structures', () => {
      const nonDocxZip = createZipBuffer([
        { name: 'random_script.js', content: 'console.log(1);' },
        { name: 'data.txt', content: 'test data' },
      ]);
      const res = validateDocxArchive(nonDocxZip);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('ERR_INVALID_OPENXML_STRUCTURE');
      expect(res.error).toMatch(/Missing required OpenXML/i);
    });

    it('rejects archive exceeding uncompressed expansion limit (Zip bomb)', () => {
      const bombZipSingle = createZipBuffer([
        { name: '[Content_Types].xml', content: '<Types/>' },
        {
          name: 'word/document.xml',
          content: 'x',
          compressedSize: 10,
          uncompressedSize: 30 * 1024 * 1024, // 30MB exceeds single entry 25MB limit
        },
      ]);
      const resSingle = validateDocxArchive(bombZipSingle);
      expect(resSingle.valid).toBe(false);
      expect(resSingle.code).toBe('ERR_ZIP_BOMB_UNCOMPRESSED_SIZE');

      const bombZipTotal = createZipBuffer([
        { name: '[Content_Types].xml', content: '<Types/>' },
        {
          name: 'word/document1.xml',
          content: 'x',
          compressedSize: 10,
          uncompressedSize: 20 * 1024 * 1024,
        },
        {
          name: 'word/document2.xml',
          content: 'x',
          compressedSize: 10,
          uncompressedSize: 20 * 1024 * 1024,
        },
        {
          name: 'word/document3.xml',
          content: 'x',
          compressedSize: 10,
          uncompressedSize: 20 * 1024 * 1024,
        },
      ]);
      const resTotal = validateDocxArchive(bombZipTotal);
      expect(resTotal.valid).toBe(false);
      expect(resTotal.code).toBe('ERR_ZIP_BOMB_TOTAL_SIZE');
    });

    it('accepts valid, clean DOCX archive structure', () => {
      const validDocx = createZipBuffer([
        { name: '[Content_Types].xml', content: '<Types><Default/></Types>' },
        { name: 'word/document.xml', content: '<w:document><w:body/></w:document>' },
      ]);
      const res = validateDocxArchive(validDocx);
      expect(res.valid).toBe(true);
      expect(res.totalEntries).toBe(2);
    });
  });

  describe('SEC-03: PDF Resource Exhaustion & Active Content Defense', () => {
    it('rejects PDF exceeding maximum allowed page count (max 20 pages)', () => {
      let excessivePages = '%PDF-1.4\n';
      for (let i = 0; i < 25; i++) {
        excessivePages += `${i + 1} 0 obj\n<< /Type /Page >>\nendobj\n`;
      }
      const res = validatePdfStructure(Buffer.from(excessivePages));
      expect(res.valid).toBe(false);
      expect(res.code).toBe('ERR_PDF_EXCESSIVE_PAGES');
      expect(res.error).toMatch(/exceeds maximum allowed page count/i);
    });

    it('rejects PDF containing disallowed /Launch active actions', () => {
      const launchPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /Launch /F (cmd.exe) >>\nendobj'
      );
      const res = validatePdfStructure(launchPdf);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('ERR_PDF_ACTIVE_CONTENT');
      expect(res.error).toMatch(/Launch action/i);
    });

    it('rejects PDF containing embedded /JavaScript execution actions', () => {
      const jsPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /JavaScript /JS (app.alert("pwned")) >>\nendobj'
      );
      const res = validatePdfStructure(jsPdf);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('ERR_PDF_ACTIVE_CONTENT');
      expect(res.error).toMatch(/Embedded JavaScript/i);
    });

    it('accepts clean static PDF within page limit', () => {
      const cleanPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj'
      );
      const res = validatePdfStructure(cleanPdf);
      expect(res.valid).toBe(true);
      expect(res.pages).toBe(2);
    });
  });

  describe('SEC-03: Quarantine & Express Middleware Enforcement', () => {
    const testTempDir = path.resolve(process.cwd(), 'uploads/test_temp');

    beforeEach(async () => {
      if (!fs.existsSync(testTempDir)) {
        await fs.promises.mkdir(testTempDir, { recursive: true });
      }
    });

    afterEach(async () => {
      try {
        if (fs.existsSync(testTempDir)) {
          await fs.promises.rm(testTempDir, { recursive: true, force: true });
        }
      } catch {}
    });

    it('quarantines malicious files and writes security audit metadata', async () => {
      const tempPath = path.join(testTempDir, 'malicious-sample.exe');
      await fs.promises.writeFile(tempPath, 'MZ_DUMMY_EXECUTABLE_PAYLOAD');

      const targetPath = await quarantineFile(tempPath, 'Executable header detected', {
        originalname: 'malicious-sample.exe',
      });

      expect(targetPath).toBeDefined();
      expect(fs.existsSync(tempPath)).toBe(false); // Original moved
      expect(fs.existsSync(targetPath)).toBe(true);

      // Verify metadata json
      const metaPath = targetPath.replace(/\.quarantined$/, '.meta.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
      expect(meta.reason).toBe('Executable header detected');
      expect(meta.metadata.originalname).toBe('malicious-sample.exe');

      // Cleanup quarantine test artifact
      await fs.promises.unlink(targetPath);
      await fs.promises.unlink(metaPath);
    });

    it('validateUploadedResume middleware rejects forged files and removes temporary file', async () => {
      const fakePdfPath = path.join(testTempDir, 'forged-resume.pdf');
      await fs.promises.writeFile(fakePdfPath, '<html><body>This is an HTML file named .pdf</body></html>');

      const req = {
        file: {
          path: fakePdfPath,
          originalname: 'forged-resume.pdf',
        },
      };

      let statusCalled = null;
      let jsonBody = null;
      const res = {
        status: (code) => {
          statusCalled = code;
          return res;
        },
        json: (data) => {
          jsonBody = data;
          return res;
        },
      };

      let nextCalled = false;
      await validateUploadedResume(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(statusCalled).toBe(400);
      expect(jsonBody.success).toBe(false);
      expect(jsonBody.code).toBe('ERR_INVALID_MAGIC_BYTES');
      expect(req.file).toBeUndefined(); // Cleared to prevent downstream access
      expect(fs.existsSync(fakePdfPath)).toBe(false); // Quarantined or removed
    });

    it('validateUploadedResume middleware allows valid PDF and attaches securityAudit', async () => {
      const validPdfPath = path.join(testTempDir, 'valid-resume.pdf');
      await fs.promises.writeFile(validPdfPath, '%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj');

      const req = {
        file: {
          path: validPdfPath,
          originalname: 'valid-resume.pdf',
        },
      };

      let nextCalled = false;
      const res = {};

      await validateUploadedResume(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.file.securityAudit).toBeDefined();
      expect(req.file.securityAudit.signatureVerified).toBe(true);
      expect(req.file.securityAudit.verifiedMime).toBe('application/pdf');

      await fs.promises.unlink(validPdfPath);
    });
  });
});
