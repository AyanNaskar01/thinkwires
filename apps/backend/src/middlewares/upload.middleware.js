import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Temporary staging directory for incoming multipart uploads before object storage persistence
const tempUploadDir = process.env.VERCEL
  ? path.resolve('/tmp', 'uploads', 'temp_resumes')
  : path.resolve(process.cwd(), 'uploads/temp_resumes');

const quarantineDir = process.env.VERCEL
  ? path.resolve('/tmp', 'uploads', 'quarantine')
  : path.resolve(process.cwd(), 'uploads/quarantine');

// Ensure staging and quarantine directories exist
[tempUploadDir, quarantineDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.warn('[Upload] Directory init notice:', dir, err.message);
    }
  }
});

export const cleanUpFile = async (filePath) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    console.warn('[Upload] Failed to unlink file:', filePath, err.message);
  }
};

/**
 * Isolates suspicious or malicious files into a dedicated quarantine store.
 */
export const quarantineFile = async (
  filePath,
  reason = 'Security policy violation',
  metadata = {}
) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;

    if (!fs.existsSync(quarantineDir)) {
      await fs.promises.mkdir(quarantineDir, { recursive: true });
    }

    const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const quarantineFilename = `quarantine-${uniqueId}.quarantined`;
    const targetPath = path.join(quarantineDir, quarantineFilename);

    await fs.promises.copyFile(filePath, targetPath);
    await fs.promises.unlink(filePath);

    // Strip write/execute permissions for defense-in-depth
    try {
      await fs.promises.chmod(targetPath, 0o400);
    } catch {
      // Best-effort on Windows
    }

    const metaPath = path.join(quarantineDir, `quarantine-${uniqueId}.meta.json`);
    await fs.promises.writeFile(
      metaPath,
      JSON.stringify(
        {
          quarantinedAt: new Date().toISOString(),
          reason,
          metadata,
          originalPath: filePath,
        },
        null,
        2
      )
    );

    console.warn(
      `[Security Alert: SEC-03] File quarantined: ${quarantineFilename} - Reason: ${reason}`
    );
    return targetPath;
  } catch (err) {
    console.error(
      '[Quarantine] Failed to isolate file, falling back to permanent unlink:',
      err.message
    );
    try {
      if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
    } catch {}
    return null;
  }
};

/**
 * Validates actual binary file signatures (magic bytes) against the claimed extension.
 * Eliminates reliance on client-supplied Content-Type headers.
 */
export const validateFileSignature = (buffer, ext) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
    return {
      valid: false,
      error: 'File is empty or corrupted.',
      code: 'ERR_EMPTY_FILE',
    };
  }

  const cleanExt = (ext || '').toLowerCase().trim();

  // 1. PDF Document (%PDF- : 0x25 0x50 0x44 0x46 0x2D)
  if (cleanExt === '.pdf') {
    const headerSlice = buffer
      .subarray(0, Math.min(buffer.length, 1024))
      .toString('latin1');
    if (!headerSlice.startsWith('%PDF-') && !headerSlice.includes('%PDF-')) {
      return {
        valid: false,
        error:
          'Invalid file signature: File contents do not match claimed PDF document format.',
        code: 'ERR_INVALID_MAGIC_BYTES',
      };
    }
    return { valid: true, mime: 'application/pdf' };
  }

  // 2. DOCX OpenXML Document (ZIP signature: PK\x03\x04 or PK\x05\x06 or PK\x07\x08)
  if (cleanExt === '.docx') {
    const isZip =
      (buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04) ||
      (buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x05 &&
        buffer[3] === 0x06) ||
      (buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x07 &&
        buffer[3] === 0x08);

    if (!isZip) {
      return {
        valid: false,
        error:
          'Invalid file signature: File contents do not match claimed DOCX document format.',
        code: 'ERR_INVALID_MAGIC_BYTES',
      };
    }
    return {
      valid: true,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  // 3. Legacy Word DOC (OLE Compound File Binary: D0 CF 11 E0 A1 B1 1A E1)
  if (cleanExt === '.doc') {
    const isDoc =
      buffer.length >= 8 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0 &&
      buffer[4] === 0xa1 &&
      buffer[5] === 0xb1 &&
      buffer[6] === 0x1a &&
      buffer[7] === 0xe1;

    if (!isDoc) {
      return {
        valid: false,
        error:
          'Invalid file signature: File contents do not match legacy Word DOC format.',
        code: 'ERR_INVALID_MAGIC_BYTES',
      };
    }
    return { valid: true, mime: 'application/msword' };
  }

  // 4. JPEG Image (FF D8 FF)
  if (cleanExt === '.jpg' || cleanExt === '.jpeg') {
    const isJpg =
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (!isJpg) {
      return {
        valid: false,
        error:
          'Invalid file signature: File contents do not match JPEG image format.',
        code: 'ERR_INVALID_MAGIC_BYTES',
      };
    }
    return { valid: true, mime: 'image/jpeg' };
  }

  // 5. PNG Image (89 50 4E 47 0D 0A 1A 0A)
  if (cleanExt === '.png') {
    const isPng =
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;

    if (!isPng) {
      return {
        valid: false,
        error:
          'Invalid file signature: File contents do not match PNG image format.',
        code: 'ERR_INVALID_MAGIC_BYTES',
      };
    }
    return { valid: true, mime: 'image/png' };
  }

  // 6. WebP Image (RIFF at offset 0, WEBP at offset 8)
  if (cleanExt === '.webp') {
    const isRiff =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46;
    const isWebp =
      buffer.length >= 12 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;

    if (!isRiff || !isWebp) {
      return {
        valid: false,
        error:
          'Invalid file signature: File contents do not match WebP image format.',
        code: 'ERR_INVALID_MAGIC_BYTES',
      };
    }
    return { valid: true, mime: 'image/webp' };
  }

  return {
    valid: false,
    error: `Unsupported file extension: ${cleanExt}`,
    code: 'ERR_UNSUPPORTED_EXTENSION',
  };
};

/**
 * Fast heuristic scanning for executable binaries, script tags, web shells, and standard EICAR signatures.
 */
export const scanBufferForMalware = (buffer, filename = '') => {
  if (!buffer || buffer.length === 0) {
    return {
      clean: false,
      reason: 'Empty buffer provided for malware scanning.',
      code: 'ERR_EMPTY_FILE',
    };
  }

  const strContent = buffer.toString('latin1');

  // 1. EICAR Standard Antivirus Test Signature
  const eicarSig =
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  if (strContent.includes(eicarSig)) {
    return {
      clean: false,
      reason: 'EICAR test virus signature detected.',
      code: 'ERR_EICAR_DETECTED',
    };
  }

  // 2. Windows Executable PE Header ('MZ' at offset 0 pointing to 'PE\0\0')
  if (buffer.length > 64 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    const peOffset = buffer.readUInt32LE(0x3c);
    if (
      peOffset > 0 &&
      peOffset + 4 <= buffer.length &&
      buffer[peOffset] === 0x50 &&
      buffer[peOffset + 1] === 0x45 &&
      buffer[peOffset + 2] === 0x00 &&
      buffer[peOffset + 3] === 0x00
    ) {
      return {
        clean: false,
        reason:
          'Portable Executable (PE / EXE / DLL) binary signature detected.',
        code: 'ERR_EXECUTABLE_DETECTED',
      };
    }
  }

  // 3. Linux/Unix Executable Header (0x7F 'E' 'L' 'F')
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return {
      clean: false,
      reason: 'Linux / Unix ELF binary executable detected.',
      code: 'ERR_EXECUTABLE_DETECTED',
    };
  }

  // 4. Mach-O Executable Binary Header
  if (buffer.length >= 4) {
    const magic = buffer.readUInt32BE(0);
    if (
      magic === 0xfeedface ||
      magic === 0xfeedfacf ||
      magic === 0xcefaedfe ||
      magic === 0xcffaedfe
    ) {
      return {
        clean: false,
        reason: 'Mach-O binary executable detected.',
        code: 'ERR_EXECUTABLE_DETECTED',
      };
    }
  }

  // 5. Shell script execution headers (Shebang: #!/bin/ or #!/usr/bin/)
  if (buffer.length >= 10 && buffer[0] === 0x23 && buffer[1] === 0x21) {
    const firstLine = strContent.slice(0, 100);
    if (/^#!\s*(\/bin\/|\/usr\/bin\/|\/usr\/local\/bin\/)/i.test(firstLine)) {
      return {
        clean: false,
        reason: 'Shell script execution header (shebang) detected.',
        code: 'ERR_SCRIPT_DETECTED',
      };
    }
  }

  // 6. Web shells, PHP tags & active executable server scripts
  const dangerousPatterns = [
    /<\?php\b/i,
    /<\?=\s/i,
    /<script\b[^>]*>/i,
    /\beval\s*\(\s*base64_decode/i,
    /\b(shell_exec|passthru|proc_open|popen)\s*\(/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(strContent)) {
      return {
        clean: false,
        reason:
          'Potentially malicious executable script or web shell pattern detected.',
        code: 'ERR_MALICIOUS_SCRIPT_DETECTED',
      };
    }
  }

  return { clean: true };
};

/**
 * Structural and archive decompression limit validator for DOCX OpenXML packages.
 * Enforces Zip Slip prevention, max uncompressed size, compression ratio limits,
 * entry count bounds, and VBA macro rejection without memory decompression risk.
 */
export const validateDocxArchive = (buffer, options = {}) => {
  const maxEntries = options.maxEntries || 500;
  const maxUncompressedSize = options.maxUncompressedSize || 50 * 1024 * 1024; // 50MB
  const maxCompressionRatio = options.maxCompressionRatio || 50; // 50:1

  let totalEntries = 0;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let hasContentTypes = false;
  let hasWordDirectory = false;
  let hasVbaMacros = false;

  let offset = 0;
  while (offset + 30 <= buffer.length) {
    // Check for PK\x03\x04 (Local File Header)
    if (
      buffer[offset] === 0x50 &&
      buffer[offset + 1] === 0x4b &&
      buffer[offset + 2] === 0x03 &&
      buffer[offset + 3] === 0x04
    ) {
      totalEntries++;
      if (totalEntries > maxEntries) {
        return {
          valid: false,
          error: `Archive contains too many entries (max ${maxEntries}). Potential Zip bomb.`,
          code: 'ERR_ZIP_BOMB_ENTRY_COUNT',
        };
      }

      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLen = buffer.readUInt16LE(offset + 26);
      const extraFieldLen = buffer.readUInt16LE(offset + 28);

      const fileNameStart = offset + 30;
      if (fileNameStart + fileNameLen > buffer.length) {
        return {
          valid: false,
          error: 'Corrupted DOCX archive: truncated filename header.',
          code: 'ERR_CORRUPT_ARCHIVE',
        };
      }

      const fileName = buffer.toString(
        'utf-8',
        fileNameStart,
        fileNameStart + fileNameLen
      );

      // Check for Zip Slip / directory traversal
      if (
        fileName.includes('..') ||
        fileName.startsWith('/') ||
        fileName.startsWith('\\') ||
        path.isAbsolute(fileName)
      ) {
        return {
          valid: false,
          error:
            'Security violation: Path traversal (Zip Slip) sequence detected in DOCX archive.',
          code: 'ERR_ZIP_SLIP_DETECTED',
        };
      }

      // Check for VBA Macros
      if (/vbaProject\.bin$/i.test(fileName)) {
        hasVbaMacros = true;
      }

      // Check for valid OpenXML structures
      if (fileName === '[Content_Types].xml') {
        hasContentTypes = true;
      }
      if (fileName.startsWith('word/')) {
        hasWordDirectory = true;
      }

      // Single entry uncompressed threshold: 25MB
      if (uncompressedSize > 25 * 1024 * 1024) {
        return {
          valid: false,
          error:
            'Single archive entry exceeds 25MB uncompressed limit (Zip bomb protection).',
          code: 'ERR_ZIP_BOMB_UNCOMPRESSED_SIZE',
        };
      }

      totalCompressed += compressedSize;
      totalUncompressed += uncompressedSize;

      if (totalUncompressed > maxUncompressedSize) {
        return {
          valid: false,
          error: `Total archive uncompressed size (${Math.round(
            totalUncompressed / (1024 * 1024)
          )}MB) exceeds maximum permitted limit (${Math.round(
            maxUncompressedSize / (1024 * 1024)
          )}MB).`,
          code: 'ERR_ZIP_BOMB_TOTAL_SIZE',
        };
      }

      offset = fileNameStart + fileNameLen + extraFieldLen + compressedSize;
    } else {
      offset++;
    }
  }

  // Calculate compression ratio
  const effectiveRatio = totalUncompressed / Math.max(totalCompressed, 1);
  if (
    totalUncompressed > 5 * 1024 * 1024 &&
    effectiveRatio > maxCompressionRatio
  ) {
    return {
      valid: false,
      error: `Archive expansion ratio (${Math.round(
        effectiveRatio
      )}:1) exceeds safe limit (${maxCompressionRatio}:1). Potential Zip bomb.`,
      code: 'ERR_ZIP_BOMB_RATIO',
    };
  }

  if (hasVbaMacros) {
    return {
      valid: false,
      error:
        'Security violation: Embedded VBA macros detected in DOCX document. Only macro-free documents are permitted.',
      code: 'ERR_VBA_MACROS_DETECTED',
    };
  }

  if (!hasContentTypes && !hasWordDirectory) {
    return {
      valid: false,
      error:
        'Invalid DOCX structure: Missing required OpenXML [Content_Types].xml or word/ structure.',
      code: 'ERR_INVALID_OPENXML_STRUCTURE',
    };
  }

  return {
    valid: true,
    totalEntries,
    totalCompressed,
    totalUncompressed,
    ratio: effectiveRatio,
  };
};

/**
 * Structural safety validator for PDF documents.
 * Protects against parser resource exhaustion bombs, excessive page counts,
 * and dangerous active actions (/Launch, /JavaScript, /SubmitForm).
 */
export const validatePdfStructure = (buffer, options = {}) => {
  const maxPages = options.maxPages || 20;

  // 1. Validate PDF Header
  const header = buffer
    .subarray(0, Math.min(buffer.length, 1024))
    .toString('latin1');
  if (!header.startsWith('%PDF-') && !header.includes('%PDF-')) {
    return {
      valid: false,
      error: 'Invalid PDF: Missing %PDF- header specification.',
      code: 'ERR_INVALID_PDF_HEADER',
    };
  }

  const pdfStr = buffer.toString('latin1');

  // 2. Reject active scripts and launch actions
  const dangerousPdfPatterns = [
    { pattern: /\/Launch\b/i, name: 'Launch action' },
    { pattern: /\/JavaScript\b/i, name: 'Embedded JavaScript' },
    { pattern: /\/JS\b/i, name: 'Embedded JS stream' },
    { pattern: /\/SubmitForm\b/i, name: 'AcroForm remote data submission' },
    { pattern: /\/ImportData\b/i, name: 'Remote FDF data import' },
  ];

  for (const { pattern, name } of dangerousPdfPatterns) {
    if (pattern.test(pdfStr)) {
      return {
        valid: false,
        error: `Security violation: PDF contains disallowed active action (${name}). Resumes must be static documents.`,
        code: 'ERR_PDF_ACTIVE_CONTENT',
      };
    }
  }

  // 3. Page count limit (resumes should not exceed maxPages)
  const pageMatches = pdfStr.match(/\/Type\s*\/Page\b(?!\s*s)/gi);
  const countMatches = pdfStr.match(/\/Count\s+(\d+)/gi);

  let detectedPages = 0;
  if (pageMatches) {
    detectedPages = pageMatches.length;
  } else if (countMatches) {
    for (const m of countMatches) {
      const num = parseInt(m.replace(/\/Count\s+/i, ''), 10);
      if (!isNaN(num) && num > detectedPages) detectedPages = num;
    }
  }

  if (detectedPages > maxPages) {
    return {
      valid: false,
      error: `PDF document exceeds maximum allowed page count (${detectedPages} pages detected, maximum is ${maxPages} pages for resumes).`,
      code: 'ERR_PDF_EXCESSIVE_PAGES',
      pages: detectedPages,
    };
  }

  // 4. PDF Stream Bomb Protection
  const streamMatches = pdfStr.match(/\/Filter\s*\/FlateDecode/gi);
  if (streamMatches && streamMatches.length > 1000) {
    return {
      valid: false,
      error:
        'PDF contains excessive compressed streams (potential parser resource exhaustion bomb).',
      code: 'ERR_PDF_STREAM_BOMB',
    };
  }

  return {
    valid: true,
    pages: detectedPages || 1,
  };
};

/**
 * Express middleware to perform comprehensive security validation on uploaded resumes.
 */
export const validateUploadedResume = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const filePath = req.file.path;
  const originalname = req.file.originalname || '';
  const ext = path.extname(originalname).toLowerCase();

  try {
    const buffer =
      req.file.buffer ||
      (filePath && fs.existsSync(filePath)
        ? await fs.promises.readFile(filePath)
        : null);

    if (!buffer) {
      if (filePath) await cleanUpFile(filePath);
      return res.status(400).json({
        success: false,
        error: 'Uploaded file is empty or could not be read.',
        code: 'ERR_EMPTY_FILE',
      });
    }

    // 1. Magic-byte signature verification
    const sigCheck = validateFileSignature(buffer, ext);
    if (!sigCheck.valid) {
      await quarantineFile(filePath, sigCheck.error, { originalname, ext });
      delete req.file;
      return res.status(400).json({
        success: false,
        error: sigCheck.error,
        code: sigCheck.code,
      });
    }

    // 2. Malware & executable heuristic scanning
    const malwareCheck = scanBufferForMalware(buffer, originalname);
    if (!malwareCheck.clean) {
      await quarantineFile(filePath, malwareCheck.reason, {
        originalname,
        ext,
        code: malwareCheck.code,
      });
      delete req.file;
      return res.status(400).json({
        success: false,
        error: `Security Alert: ${malwareCheck.reason}`,
        code: malwareCheck.code,
      });
    }

    // 3. DOCX archive expansion limits & zip bomb inspection
    if (ext === '.docx') {
      const docxCheck = validateDocxArchive(buffer);
      if (!docxCheck.valid) {
        await quarantineFile(filePath, docxCheck.error, {
          originalname,
          ext,
          code: docxCheck.code,
        });
        delete req.file;
        return res.status(400).json({
          success: false,
          error: docxCheck.error,
          code: docxCheck.code,
        });
      }
    }

    // 4. PDF resource exhaustion & active content inspection
    if (ext === '.pdf') {
      const pdfCheck = validatePdfStructure(buffer);
      if (!pdfCheck.valid) {
        await quarantineFile(filePath, pdfCheck.error, {
          originalname,
          ext,
          code: pdfCheck.code,
        });
        delete req.file;
        return res.status(400).json({
          success: false,
          error: pdfCheck.error,
          code: pdfCheck.code,
        });
      }
    }

    req.file.securityAudit = {
      signatureVerified: true,
      scannedAt: new Date().toISOString(),
      verifiedMime: sigCheck.mime,
    };

    next();
  } catch (err) {
    console.error('[UploadValidation] Error validating resume:', err);
    if (filePath) await cleanUpFile(filePath);
    delete req.file;
    return res.status(500).json({
      success: false,
      error:
        'An unexpected error occurred during security validation of the uploaded file.',
    });
  }
};

/**
 * Express middleware to perform comprehensive security validation on uploaded avatars.
 */
export const validateUploadedAvatar = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const filePath = req.file.path;
  const originalname = req.file.originalname || '';
  const ext = path.extname(originalname).toLowerCase();

  try {
    const buffer =
      req.file.buffer ||
      (filePath && fs.existsSync(filePath)
        ? await fs.promises.readFile(filePath)
        : null);

    if (!buffer) {
      if (filePath) await cleanUpFile(filePath);
      return res.status(400).json({
        success: false,
        error: 'Uploaded image is empty or could not be read.',
        code: 'ERR_EMPTY_FILE',
      });
    }

    // 1. Magic-byte signature verification
    const sigCheck = validateFileSignature(buffer, ext);
    if (!sigCheck.valid) {
      await quarantineFile(filePath, sigCheck.error, { originalname, ext });
      delete req.file;
      return res.status(400).json({
        success: false,
        error: sigCheck.error,
        code: sigCheck.code,
      });
    }

    // 2. Malware & executable heuristic scanning
    const malwareCheck = scanBufferForMalware(buffer, originalname);
    if (!malwareCheck.clean) {
      await quarantineFile(filePath, malwareCheck.reason, {
        originalname,
        ext,
        code: malwareCheck.code,
      });
      delete req.file;
      return res.status(400).json({
        success: false,
        error: `Security Alert: ${malwareCheck.reason}`,
        code: malwareCheck.code,
      });
    }

    req.file.securityAudit = {
      signatureVerified: true,
      scannedAt: new Date().toISOString(),
      verifiedMime: sigCheck.mime,
    };

    next();
  } catch (err) {
    console.error('[UploadValidation] Error validating avatar:', err);
    if (filePath) await cleanUpFile(filePath);
    delete req.file;
    return res.status(500).json({
      success: false,
      error:
        'An unexpected error occurred during security validation of the uploaded avatar.',
    });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.pdf', '.doc', '.docx'].includes(rawExt)
      ? rawExt
      : '.pdf';
    const rawBase = path.basename(file.originalname || 'resume', rawExt);
    const sanitizedBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    cb(null, `${sanitizedBase}-${uniqueSuffix}${safeExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    return cb(
      new Error(
        'Invalid file type. Only PDF, DOC, and DOCX files are allowed.'
      ),
      false
    );
  }

  // Guard against double-extensions (e.g. payload.php.pdf)
  const lowerName = (file.originalname || '').toLowerCase();
  const dangerousPatterns = [
    '.html',
    '.htm',
    '.svg',
    '.js',
    '.exe',
    '.sh',
    '.php',
    '.bat',
    '.py',
  ];
  if (dangerousPatterns.some((pattern) => lowerName.includes(pattern))) {
    return cb(new Error('Potentially unsafe file format detected.'), false);
  }

  const extensionMimeMap = {
    '.pdf': ['application/pdf'],
    '.doc': ['application/msword', 'application/octet-stream'],
    '.docx': [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
      'application/zip',
    ],
  };

  const validMimes = extensionMimeMap[ext] || [];
  if (
    validMimes.includes(file.mimetype) ||
    file.mimetype === 'application/octet-stream'
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Invalid file content. Uploaded file MIME type does not match the permitted document format.'
      ),
      false
    );
  }
};

export const resumeUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter,
});

// Avatar image upload setup
const avatarDir = process.env.VERCEL
  ? path.resolve('/tmp', 'uploads', 'avatars')
  : path.resolve(process.cwd(), 'uploads/avatars');

if (!fs.existsSync(avatarDir)) {
  try {
    fs.mkdirSync(avatarDir, { recursive: true });
  } catch (err) {
    console.warn('[AvatarUpload] Directory init notice:', err.message);
  }
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarDir);
  },
  filename: (req, file, cb) => {
    const candidateId = req.candidate?._id || req.candidate?.id || 'cand';
    const sanitizedCandidateId = String(candidateId)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 36);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(rawExt)
      ? rawExt
      : '.jpg';
    cb(null, `avatar-${sanitizedCandidateId}-${uniqueSuffix}${safeExt}`);
  },
});

const avatarFileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowed.includes(ext)) {
    return cb(
      new Error(
        'Invalid image format. Only JPG, JPEG, PNG, and WebP are permitted.'
      ),
      false
    );
  }

  // Guard against double-extensions (e.g. payload.php.png or script.svg.jpg)
  const lowerName = (file.originalname || '').toLowerCase();
  const dangerousPatterns = [
    '.html',
    '.htm',
    '.svg',
    '.js',
    '.exe',
    '.sh',
    '.php',
    '.bat',
    '.py',
  ];
  if (dangerousPatterns.some((pattern) => lowerName.includes(pattern))) {
    return cb(new Error('Potentially unsafe file format detected.'), false);
  }

  const extensionMimeMap = {
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.webp': ['image/webp'],
  };

  const validMimes = extensionMimeMap[ext] || [];
  if (validMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Invalid file content. Uploaded file MIME type does not match the permitted image format.'
      ),
      false
    );
  }
};

export const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: avatarFileFilter,
});

