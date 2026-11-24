# Thinkwires ATS: Enterprise Database Security, Backup & Disaster Recovery Architecture

This document establishes the comprehensive database security posture, least-privilege role architecture, network boundary controls, field-level encryption standards, and Disaster Recovery (DR) runbooks for Thinkwires ATS.

---

## 1. Least-Privilege Database Role Architecture

Neither the backend application nor administrative microservices connect to MongoDB or PostgreSQL using superuser accounts (`root`, `postgres`, `admin`, `clusterAdmin`).

### PostgreSQL Role Matrix

| Role Name | Ingress Type | Privileges | Prohibited Privileges | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `app_rw_user` | Primary Connection | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on schema `public` tables & sequences | `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `DROP DATABASE`, `ALTER SYSTEM` | Primary backend transactional writes & migrations |
| `app_ro_user` | Read Replica Connection | `SELECT` on schema `public` tables & sequences | All write/DDL mutations (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`) | Read-only reporting, analytics, health probes |
| `dba_migrator` | CI/CD Pipeline Only | `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `DROP INDEX` | Superuser system-level execution | Automated schema migrations (`npm run migrate`) |

```sql
-- PostgreSQL Least-Privilege Provisioning
CREATE ROLE app_rw_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '...';
GRANT USAGE, CREATE ON SCHEMA public TO app_rw_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw_user;

CREATE ROLE app_ro_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '...';
GRANT USAGE ON SCHEMA public TO app_ro_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_ro_user;
```

### MongoDB Role Matrix

| User Name | Database | Assigned Roles | Prohibitions | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `app_rw_user` | `thinkwire_db` | `readWrite@thinkwire_db` | `userAdmin`, `dbAdminAnyDatabase`, `root`, `clusterMonitor` | Primary backend document store |
| `app_ro_user` | `thinkwire_db` | `read@thinkwire_db` | All mutating operations (`insert`, `update`, `delete`, `dropCollection`) | Read replica queries, ATS pipeline dashboards |

```javascript
// MongoDB Least-Privilege Provisioning
db.getSiblingDB('thinkwire_db').createUser({
  user: 'app_rw_user',
  pwd: '...',
  roles: [{ role: 'readWrite', db: 'thinkwire_db' }],
});
db.getSiblingDB('thinkwire_db').createUser({
  user: 'app_ro_user',
  pwd: '...',
  roles: [{ role: 'read', db: 'thinkwire_db' }],
});
```

---

## 2. Separate Read/Write Credentials & Connection Splitting

To insulate transactional database workloads from analytical read locks and reporting queries, the backend supports dual-channel connection configurations:

```env
# Primary Transactional Stores (Read-Write)
DATABASE_URL=postgresql://app_rw_user:SECURE_TOKEN@db-primary.thinkwires.internal:5432/thinkwire_db?sslmode=verify-full
MONGODB_URI=mongodb+srv://app_rw_user:SECURE_TOKEN@atlas-cluster.thinkwires.internal/thinkwire_db?retryWrites=true&w=majority

# Read-Only Analytical & Reporting Stores (Read-Only)
DATABASE_READ_URL=postgresql://app_ro_user:SECURE_TOKEN@db-replica.thinkwires.internal:5432/thinkwire_db?sslmode=verify-full
MONGODB_READ_URI=mongodb+srv://app_ro_user:SECURE_TOKEN@atlas-cluster.thinkwires.internal/thinkwire_db?readPreference=secondaryPreferred
```

1. **Sequelize Replication**: In `apps/backend/src/configs/db.js`, `sequelizeRead` directs non-mutating reporting queries to read replicas.
2. **MongoDB Secondary Preferred**: In `apps/backend/src/configs/mongodb.js`, `createReadReplicaConnection` sets `readPreference=secondaryPreferred`.

---

## 3. Production Network Boundary Restrictions

Databases are strictly forbidden from public internet exposure (`0.0.0.0/0`).

1. **Private Subnets & VPC Peering**:
   - PostgreSQL instances run in AWS VPC Private Database Subnets with no internet gateway or public IPv4 addresses.
   - MongoDB Atlas connects to the backend container cluster via AWS VPC Peering or AWS PrivateLink.
2. **Security Group Ingress Filtering**:
   - PostgreSQL security group allows ingress on port `5432` **only** from the backend security group ID (`sg-backend-prod`).
   - Atlas Network Access list contains only the VPC CIDR (`10.0.0.0/16`) or PrivateLink endpoint IDs.
3. **Automated Audit**:
   - `apps/backend/src/utils/databaseSecurity.validator.js` executes on boot and flags any database host resolving to localhost or non-private address space in production.

---

## 4. Sensitive Field-Level Encryption (AES-256-GCM)

While storage-layer encryption (AWS EBS KMS and MongoDB Atlas disk encryption) protects data at rest against physical drive theft, **application-level field encryption** guarantees cryptographic confidentiality even against compromised database backups or unauthorized DBA inspection.

### Architecture

- **Algorithm**: `AES-256-GCM` (Galois/Counter Mode with 128-bit authentication tag).
- **IV**: 96-bit cryptographically secure random bytes generated per field value.
- **Envelope Format**: `enc:v1:<iv_b64>:<ciphertext_b64>:<authTag_b64>`.
- **Searchable Blind Indexing**: Uses HMAC-SHA256 with key derivation (`hashSearchableField`) to permit deterministic exact-match search on encrypted fields (e.g. `governmentIdHash`) without exposing plaintext.

### Protected Fields

- `Candidate.governmentId` (SSN, National ID, Tax Identification).
- `Candidate.bankDetails` (Direct deposit routing & bank accounts).
- `Candidate.sensitiveNotes` (Confidential candidate vetting & salary negotiations).

---

## 5. Backup Encryption, Point-In-Time Recovery (PITR) & Retention

| Tier | Window / Frequency | Encryption | Retention | Target RTO / RPO |
| :--- | :--- | :--- | :--- | :--- |
| **Continuous PITR** | Continuous Streaming | Native Engine Encryption + TLS 1.3 Transport | 7 Days continuous | **RTO**: < 30 min<br>**RPO**: < 60 sec |
| **Daily Snapshots** | Daily at 02:00 UTC | AES-256-GCM via AWS KMS Customer Managed Key (CMK) | 30 Days | **RTO**: < 2 hours<br>**RPO**: < 24 hours |
| **Compliance Archive** | Monthly (1st of month) | AWS S3 Glacier Deep Archive with Object Lock (WORM) | 7 Years (2555 Days) | Regulatory archive (SOC 2, GDPR) |

### Disaster Recovery Runbook

In the event of accidental data deletion, ransomware attack, or regional outage:

1. **Identify Recovery Timestamp**: Identify the exact timestamp before corruption occurred (`targetRecoveryTimestamp`).
2. **Initiate PITR Restoration**:
   - *MongoDB Atlas*: In Atlas Console -> Clusters -> Backup -> Point in Time Restore -> Select cluster, target point in time, and restore to a target staging cluster.
   - *PostgreSQL*: In AWS RDS Console -> Databases -> Restore to Point in Time -> Specify date/time -> Launch restored instance in private subnet.
3. **Validate Restored Data Integrity**: Run `npm run test:dr-verify` to ensure transactional integrity across MongoDB and PostgreSQL.
4. **Update Application Route / Connection Strings**: Point `MONGODB_URI` and `DATABASE_URL` to the restored instance endpoints and restart backend containers.
