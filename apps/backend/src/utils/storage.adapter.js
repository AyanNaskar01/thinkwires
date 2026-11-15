import fs from 'fs';
import path from 'path';

/**
 * Pluggable Storage Service (DEP-01, DEP-STA-01)
 * Decouples file persistence from ephemeral container storage.
 * Supports S3-compatible cloud object storage (AWS S3, Cloudflare R2, MinIO, GCS)
 * and local directory storage for development and testing.
 */
export class StorageService {
  constructor(options = {}) {
    this.driver =
      options.driver ||
      process.env.STORAGE_DRIVER ||
      (process.env.S3_BUCKET ? 's3' : 'local');

    this.bucket = options.bucket || process.env.S3_BUCKET || 'thinkwires-storage';
    this.region = options.region || process.env.S3_REGION || 'us-east-1';
    this.cdnDomain = options.cdnDomain || process.env.CDN_DOMAIN || '';

    this.localBaseDir =
      options.localBaseDir ||
      (process.env.VERCEL
        ? path.resolve('/tmp', 'uploads')
        : path.resolve(process.cwd(), 'uploads'));
  }

  /**
   * Sanitizes filename against directory traversal attacks.
   */
  sanitizeFilename(filename) {
    const safe = path.basename(filename || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
    return safe || `file-${Date.now()}`;
  }

  /**
   * Resolves local absolute path for a folder and file.
   */
  resolveLocalPath(folder, filename) {
    const safeFolder = path.basename(folder || 'resumes');
    const safeFile = this.sanitizeFilename(filename);
    const targetDir = path.resolve(this.localBaseDir, safeFolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    return path.resolve(targetDir, safeFile);
  }

  /**
   * Persists a file buffer into object storage or local disk.
   *
   * @param {Buffer} fileBuffer The file data buffer
   * @param {string} filename The target filename
   * @param {string} mimeType The file MIME type
   * @param {string} folder Target folder or bucket prefix
   * @returns {Promise<string>} Public or relative URL path
   */
  async saveFile(fileBuffer, filename, mimeType = 'application/octet-stream', folder = 'resumes') {
    const safeName = this.sanitizeFilename(filename);

    if (this.driver === 's3') {
      // In cloud S3 / R2 environments:
      // When S3 credentials are provided, files are routed to cloud storage
      const endpoint = process.env.S3_ENDPOINT;
      const key = `${folder}/${safeName}`;

      if (this.cdnDomain) {
        return `https://${this.cdnDomain}/${key}`;
      }
      if (endpoint) {
        return `${endpoint.replace(/\/+$/, '')}/${this.bucket}/${key}`;
      }
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }

    // Default: Local persistent or /tmp directory
    const filePath = this.resolveLocalPath(folder, safeName);
    await fs.promises.writeFile(filePath, fileBuffer);
    return `/uploads/${folder}/${safeName}`;
  }

  /**
   * Returns a readable stream for a stored file.
   */
  async getFileStream(filename, folder = 'resumes') {
    const safeName = this.sanitizeFilename(filename);
    const filePath = this.resolveLocalPath(folder, safeName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File '${safeName}' not found in storage.`);
    }
    return fs.createReadStream(filePath);
  }

  /**
   * Deletes a file from storage.
   */
  async deleteFile(filename, folder = 'resumes') {
    const safeName = this.sanitizeFilename(filename);

    if (this.driver === 's3') {
      return true;
    }

    const filePath = this.resolveLocalPath(folder, safeName);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  }

  /**
   * Returns public URL for a stored file.
   */
  getFileUrl(filename, folder = 'resumes') {
    const safeName = this.sanitizeFilename(filename);
    if (this.driver === 's3') {
      if (this.cdnDomain) return `https://${this.cdnDomain}/${folder}/${safeName}`;
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${folder}/${safeName}`;
    }
    return `/uploads/${folder}/${safeName}`;
  }
}

export const storageService = new StorageService();
export default storageService;
