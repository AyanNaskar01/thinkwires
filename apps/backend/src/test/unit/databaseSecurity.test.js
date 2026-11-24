import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  encryptField,
  decryptField,
  isEncrypted,
  resolveEncryptionKey,
  hashSearchableField,
} from '../../utils/fieldEncryption.util.js';
import {
  inspectConnectionUri,
  checkAccountPrivilege,
  checkNetworkRestrictions,
  auditDatabaseSecurityPosture,
} from '../../utils/databaseSecurity.validator.js';
import {
  BACKUP_POLICIES,
  validateBackupConfiguration,
  simulateDisasterRecoveryDrill,
} from '../../utils/backupSecurity.util.js';
import Candidate from '../../models/candidate.mongo.model.js';

describe('Database Security & Defense Architecture Suite', () => {
  describe('1. Sensitive Field-Level Encryption (AES-256-GCM)', () => {
    it('should encrypt plaintext strings into authenticated enc:v1 envelope tokens', () => {
      const plaintext = '123-45-6789'; // Sensitive Tax ID
      const encrypted = encryptField(plaintext);

      expect(typeof encrypted).toBe('string');
      expect(isEncrypted(encrypted)).toBe(true);
      expect(encrypted.startsWith('enc:v1:')).toBe(true);

      const parts = encrypted.slice('enc:v1:'.length).split(':');
      expect(parts).toHaveLength(3); // [iv, ciphertext, authTag]
    });

    it('should decrypt encrypted tokens back to exact original plaintext', () => {
      const original = 'Confidential executive compensation package: $240,000 + 20% bonus';
      const encrypted = encryptField(original);
      const decrypted = decryptField(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should support encrypting and decrypting structured JSON objects', () => {
      const bankDetails = {
        accountNumber: '9876543210',
        routingNumber: '021000021',
        bankName: 'Enterprise Chase Bank',
      };

      const encrypted = encryptField(bankDetails);
      expect(isEncrypted(encrypted)).toBe(true);

      const decrypted = decryptField(encrypted);
      expect(decrypted).toEqual(bankDetails);
    });

    it('should fail closed and throw tamper error if ciphertext or auth tag is corrupted', () => {
      const encrypted = encryptField('Confidential candidate background report');
      const parts = encrypted.split(':');

      // Tamper with the ciphertext component
      parts[2] = Buffer.from('TAMPERED_DATA_BYTES').toString('base64');
      const tampered = parts.join(':');

      expect(() => decryptField(tampered)).toThrow(/Field decryption failed or data was tampered/);
    });

    it('should generate deterministic blind index hashes for exact-match querying', () => {
      const ssn1 = '000-12-3456';
      const ssn2 = '000-12-3456';
      const ssn3 = '999-88-7777';

      const hash1 = hashSearchableField(ssn1);
      const hash2 = hashSearchableField(ssn2);
      const hash3 = hashSearchableField(ssn3);

      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA-256 hex
      expect(hash1).toBe(hash2); // Deterministic
      expect(hash1).not.toBe(hash3);
    });

    it('should resolve a valid 32-byte (256-bit) encryption key from various sources', () => {
      const defaultKey = resolveEncryptionKey();
      expect(Buffer.isBuffer(defaultKey)).toBe(true);
      expect(defaultKey.length).toBe(32);

      // 64-char hex
      const hexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const resolvedHex = resolveEncryptionKey(hexKey);
      expect(resolvedHex.length).toBe(32);
    });
  });

  describe('2. Least-Privilege Database Accounts & Network Auditing', () => {
    it('should safely inspect connection strings and redact passwords', () => {
      const uri = 'postgresql://app_rw_user:SuperSecretPassword123@db-primary.internal:5432/thinkwire_db';
      const inspected = inspectConnectionUri(uri);

      expect(inspected.username).toBe('app_rw_user');
      expect(inspected.host).toBe('db-primary.internal:5432');
      expect(inspected.sanitizedUri).toContain('app_rw_user:***@');
      expect(inspected.sanitizedUri).not.toContain('SuperSecretPassword123');
    });

    it('should flag superuser accounts as security risks under least-privilege checks', () => {
      const postgresCheck = checkAccountPrivilege('postgres', 'postgresql', true);
      expect(postgresCheck.isLeastPrivilege).toBe(false);
      expect(postgresCheck.isSuperuser).toBe(true);
      expect(postgresCheck.warning).toContain('LEAST_PRIVILEGE');

      const rootCheck = checkAccountPrivilege('root', 'mongodb', true);
      expect(rootCheck.isLeastPrivilege).toBe(false);
      expect(rootCheck.isSuperuser).toBe(true);

      const leastPrivCheck = checkAccountPrivilege('app_rw_user', 'postgresql', true);
      expect(leastPrivCheck.isLeastPrivilege).toBe(true);
      expect(leastPrivCheck.isSuperuser).toBe(false);
      expect(leastPrivCheck.warning).toBeNull();
    });

    it('should audit database network restrictions and flag localhost in production', () => {
      const localCheck = checkNetworkRestrictions('localhost:5432', true);
      expect(localCheck.isLocalhost).toBe(true);
      expect(localCheck.warning).toContain('CRITICAL');

      const cloudCheck = checkNetworkRestrictions('atlas-cluster.thinkwires.mongodb.net', true);
      expect(cloudCheck.isNetworkRestricted).toBe(true);
      expect(cloudCheck.isLocalhost).toBe(false);
      expect(cloudCheck.warning).toBeNull();
    });

    it('should generate a comprehensive security posture audit report', () => {
      const audit = auditDatabaseSecurityPosture({
        mongoUri: 'mongodb+srv://app_rw_user:token@atlas-cluster.thinkwires.mongodb.net/thinkwire_db',
        mongoReadUri: 'mongodb+srv://app_ro_user:token@atlas-cluster.thinkwires.mongodb.net/thinkwire_db',
        postgresUrl: 'postgresql://app_rw_user:token@db-primary.internal:5432/thinkwire_db',
        postgresReadUrl: 'postgresql://app_ro_user:token@db-replica.internal:5432/thinkwire_db',
        isProduction: true,
      });

      expect(audit.isCompliant).toBe(true);
      expect(audit.hasSeparateReadCredentials).toBe(true);
      expect(audit.mongodb.isLeastPrivilege).toBe(true);
      expect(audit.postgresql.isLeastPrivilege).toBe(true);
      expect(audit.mongodb.hasReadReplica).toBe(true);
      expect(audit.postgresql.hasReadReplica).toBe(true);
      expect(audit.warnings).toHaveLength(0);
    });
  });

  describe('3. Encrypted Backups, Point-in-Time Recovery & Retention Policies', () => {
    it('should validate enterprise backup policy specifications', () => {
      const compliant = validateBackupConfiguration();
      expect(compliant.isCompliant).toBe(true);
      expect(compliant.errors).toHaveLength(0);
      expect(compliant.details.pitrWindowDays).toBe(7);
      expect(compliant.details.snapshotRetentionDays).toBe(30);
      expect(compliant.details.encryptionAlgorithm).toBe('AES-256-GCM');
    });

    it('should reject non-compliant backup configurations with descriptive errors', () => {
      const invalid = validateBackupConfiguration({
        encryptionEnabled: false,
        pitrWindowDays: 2, // Less than 7 days
        snapshotRetentionDays: 14, // Less than 30 days
        encryptionAlgorithm: 'DES',
      });

      expect(invalid.isCompliant).toBe(false);
      expect(invalid.errors.length).toBeGreaterThanOrEqual(3);
      expect(invalid.errors.some((e) => e.includes('encryption is disabled'))).toBe(true);
      expect(invalid.errors.some((e) => e.includes('INSUFFICIENT_PITR'))).toBe(true);
      expect(invalid.errors.some((e) => e.includes('INSUFFICIENT_RETENTION'))).toBe(true);
    });

    it('should simulate disaster recovery drill and compute RTO/RPO targets', () => {
      // Point in time 2 hours ago (well within 7-day PITR window)
      const targetTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const drill = simulateDisasterRecoveryDrill(targetTime);

      expect(drill.isRestorable).toBe(true);
      expect(drill.strategy).toBe('Point-in-Time Log Replay');
      expect(drill.expectedRpoSeconds).toBeLessThanOrEqual(60); // < 1 minute RPO
      expect(drill.expectedRtoMinutes).toBeLessThanOrEqual(30); // < 30 minutes RTO
      expect(drill.encryptionVerified).toBe(true);
    });
  });

  describe('4. Model Integration (Candidate PII Encryption)', () => {
    it('Candidate model schema should include encrypted governmentId, bankDetails, and sensitiveNotes', () => {
      const paths = Candidate.schema.paths;
      expect(paths.governmentId).toBeDefined();
      expect(paths.governmentIdHash).toBeDefined();
      expect(paths.bankDetails).toBeDefined();
      expect(paths.sensitiveNotes).toBeDefined();
      expect(paths.governmentId.options.select).toBe(false);
    });
  });
});
