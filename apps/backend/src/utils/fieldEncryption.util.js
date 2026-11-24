import crypto from 'crypto';
import config from '../configs/dotenv.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const PREFIX = 'enc:v1:';

/**
 * Resolves the 256-bit encryption key from FIELD_ENCRYPTION_KEY or deterministically
 * derives it from the application master JWT_SECRET to ensure seamless operation
 * across local and cloud environments.
 *
 * @param {string} [customKey] Optional override key
 * @returns {Buffer} 32-byte encryption key buffer
 */
export const resolveEncryptionKey = (customKey) => {
  const rawKey = customKey || process.env.FIELD_ENCRYPTION_KEY;

  if (rawKey) {
    if (typeof rawKey === 'string') {
      // 64-char hex string
      if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
        return Buffer.from(rawKey, 'hex');
      }
      // 32-char utf-8 string
      if (Buffer.byteLength(rawKey, 'utf8') === 32) {
        return Buffer.from(rawKey, 'utf8');
      }
      // Base64 32 bytes
      if (rawKey.length === 44 && /^[A-Za-z0-9+/=]+$/.test(rawKey)) {
        const buf = Buffer.from(rawKey, 'base64');
        if (buf.length === 32) return buf;
      }
    }
    // Hash to exactly 32 bytes if length is non-standard
    return crypto.createHash('sha256').update(String(rawKey)).digest();
  }

  // Fallback: derive from master secret with dedicated cryptographic domain separation
  const masterSecret =
    process.env.JWT_SECRET ||
    config.JWT_SECRET ||
    'thinkwires-dev-ephemeral-secret-key-32b!';
  return crypto
    .createHmac('sha256', masterSecret)
    .update('thinkwires-field-level-encryption-domain-v1')
    .digest();
};

/**
 * Checks whether a given string is an encrypted token.
 *
 * @param {*} value
 * @returns {boolean}
 */
export const isEncrypted = (value) => {
  return typeof value === 'string' && value.startsWith(PREFIX);
};

/**
 * Encrypts a plaintext string or object using AES-256-GCM.
 *
 * @param {string|object|number} plaintext Data to encrypt
 * @param {string} [aad] Optional Additional Authenticated Data (e.g. document ID or field name)
 * @param {Buffer} [key] Optional custom key
 * @returns {string} Serialized encrypted token: enc:v1:<iv_b64>:<ciphertext_b64>:<authTag_b64>
 */
export const encryptField = (plaintext, aad = '', key = null) => {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return plaintext;
  }

  // Already encrypted
  if (isEncrypted(plaintext)) {
    return plaintext;
  }

  const encKey = key || resolveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  if (aad) {
    cipher.setAAD(Buffer.from(String(aad), 'utf8'));
  }

  const textToEncrypt =
    typeof plaintext === 'object' ? JSON.stringify(plaintext) : String(plaintext);

  let encrypted = cipher.update(textToEncrypt, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  const ivStr = iv.toString('base64');

  return `${PREFIX}${ivStr}:${encrypted}:${authTag}`;
};

/**
 * Decrypts an AES-256-GCM encrypted token.
 *
 * @param {string} ciphertext Encrypted token
 * @param {string} [aad] Optional AAD matching encryption
 * @param {Buffer} [key] Optional custom key
 * @returns {string|null} Decrypted plaintext string or original value if not encrypted
 */
export const decryptField = (ciphertext, aad = '', key = null) => {
  if (!isEncrypted(ciphertext)) {
    return ciphertext;
  }

  try {
    const encKey = key || resolveEncryptionKey();
    const payload = ciphertext.slice(PREFIX.length);
    const parts = payload.split(':');

    if (parts.length !== 3) {
      throw new Error('Malformed encrypted field token');
    }

    const [ivB64, encryptedB64, authTagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid IV or auth tag length in encrypted token');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, encKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    if (aad) {
      decipher.setAAD(Buffer.from(String(aad), 'utf8'));
    }

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedB64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Attempt to parse JSON if stringified object
    if (
      (decrypted.startsWith('{') && decrypted.endsWith('}')) ||
      (decrypted.startsWith('[') && decrypted.endsWith(']'))
    ) {
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    }

    return decrypted;
  } catch (err) {
    console.error(`[FieldEncryption] Decryption failed: ${err.message}`);
    throw new Error(`Field decryption failed or data was tampered: ${err.message}`);
  }
};

/**
 * Generates a deterministic blind index hash (HMAC-SHA256) for exact match searching
 * on encrypted fields without decrypting the entire database.
 *
 * @param {string} plaintext Field value to index
 * @param {string} [saltKey] Optional domain salt
 * @returns {string} 64-character hex hash
 */
export const hashSearchableField = (plaintext, saltKey = 'search-blind-index') => {
  if (!plaintext || typeof plaintext !== 'string') return '';
  const key = resolveEncryptionKey();
  const blindKey = crypto
    .createHmac('sha256', key)
    .update(saltKey)
    .digest();
  return crypto
    .createHmac('sha256', blindKey)
    .update(plaintext.trim().toLowerCase())
    .digest('hex');
};

/**
 * Mongoose Plugin: Transparently encrypts specified fields on save/update and decrypts on retrieval.
 *
 * @param {object} schema Mongoose Schema
 * @param {object} options Configuration options
 * @param {Array<string>} options.fields List of field names to encrypt
 */
export const fieldEncryptionPlugin = (schema, options = {}) => {
  const fields = options.fields || [];
  if (!Array.isArray(fields) || fields.length === 0) return;

  // Pre-save hook: encrypt fields before writing to MongoDB
  schema.pre('save', function (next) {
    for (const field of fields) {
      if (this.isModified(field) && this[field]) {
        if (!isEncrypted(this[field])) {
          this[field] = encryptField(this[field], field);
        }
      }
    }
    next();
  });

  // Decrypt on document instantiation
  const decryptDoc = (doc) => {
    if (!doc) return;
    for (const field of fields) {
      if (doc[field] && isEncrypted(doc[field])) {
        try {
          doc[field] = decryptField(doc[field], field);
        } catch {
          // If decryption fails, retain encrypted value
        }
      }
    }
  };

  schema.post('init', function (doc) {
    decryptDoc(doc);
  });

  schema.post('findOne', function (res) {
    if (res) decryptDoc(res);
  });

  schema.post('find', function (docs) {
    if (Array.isArray(docs)) {
      docs.forEach((doc) => decryptDoc(doc));
    }
  });
};

export default {
  encryptField,
  decryptField,
  isEncrypted,
  resolveEncryptionKey,
  hashSearchableField,
  fieldEncryptionPlugin,
};
