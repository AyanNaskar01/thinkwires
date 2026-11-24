/**
 * ============================================================================
 * Thinkwires ATS: MongoDB Least-Privilege Role Provisioning Script
 * Reference: CIS MongoDB Benchmark & Principle of Least Privilege
 * ============================================================================
 * Run this script via mongosh connected as cluster administrator.
 * Do NOT configure application services using 'root' or 'clusterAdmin'.
 * ============================================================================
 */

const targetDb = db.getSiblingDB('thinkwire_db');
const adminDb = db.getSiblingDB('admin');

print('Configuring least-privilege MongoDB users for thinkwire_db...');

// 1. Read-Write Application User (app_rw_user)
// Granted 'readWrite' strictly on 'thinkwire_db'.
// Has NO permissions on 'admin', 'config', or 'local' databases.
// Cannot drop databases, create other users, or modify cluster topology.
const rwUser = targetDb.getUser('app_rw_user');
if (!rwUser) {
  targetDb.createUser({
    user: 'app_rw_user',
    pwd: process.env.MONGODB_APP_RW_PASSWORD || 'CHANGE_ME_IN_PRODUCTION_SECURE_VAULT_PW_1',
    roles: [
      { role: 'readWrite', db: 'thinkwire_db' },
    ],
  });
  print('✔ Created least-privilege readWrite user: app_rw_user');
} else {
  print('ℹ app_rw_user already exists');
}

// 2. Read-Only Analytical / Health Probe User (app_ro_user)
// Used for secondary read replica queries, analytics, and non-mutating reporting.
const roUser = targetDb.getUser('app_ro_user');
if (!roUser) {
  targetDb.createUser({
    user: 'app_ro_user',
    pwd: process.env.MONGODB_APP_RO_PASSWORD || 'CHANGE_ME_IN_PRODUCTION_SECURE_VAULT_PW_2',
    roles: [
      { role: 'read', db: 'thinkwire_db' },
    ],
  });
  print('✔ Created least-privilege read-only user: app_ro_user');
} else {
  print('ℹ app_ro_user already exists');
}

// 3. Verification Report
print('\n--- Role Verification ---');
printjson(targetDb.getUsers());
