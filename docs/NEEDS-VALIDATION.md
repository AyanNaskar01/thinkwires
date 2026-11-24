# Unresolved Security Leads Requiring Operator Validation (NEEDS-VALIDATION)

This document catalogs security-critical architectural assumptions and leads that cannot be definitively established or refuted solely through repository source code and local sandboxed execution. Each lead identifies the claimed root cause, repository source trace, decisive blocker, and a non-destructive verification plan for infrastructure owners.

These items carry no severity score and are not confirmed vulnerabilities; they represent boundary conditions that require live cloud, network, or provider verification.

---

## 1. NV-CLD-01: Unobserved Production S3/R2 Bucket IAM Policies and Public Access Block Configuration

- **Lead Identifier**: `NV-CLD-01`
- **Target Subsystem**: Cloud Object Storage (`apps/backend/src/utils/storage.adapter.js:17-73`)
- **Boundary**: Public Internet vs Private Candidate Resume Bucket
- **Claimed Root Cause**: Cloud infrastructure provisioning files (Terraform, CloudFormation, Pulumi) and bucket security policies are maintained outside repository version control.

### 1.1 Source Trace & Evidence
- **Entrypoint**: `apps/backend/src/utils/storage.adapter.js:17` (`StorageService.constructor`)
  Initializes S3 bucket pointer from `process.env.S3_BUCKET || 'thinkwires-storage'`.
- **Sink**: `apps/backend/src/utils/storage.adapter.js:73` (`StorageService.saveFile`)
  Constructs endpoint URL `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`.
- **Evidence**: `apps/backend/src/utils/storage.adapter.js:17` demonstrates that bucket configuration is derived entirely from environment variables without repository-managed bucket policies.

### 1.2 Exact Blocker
The live AWS S3 or Cloudflare R2 cloud provider account cannot be audited from repository source code alone. Specifically, whether the target S3 bucket has AWS S3 "Block Public Access" enabled and whether bucket policies prevent unauthenticated public `s3:GetObject` read access cannot be verified without cloud account observation.

### 1.3 Safe Owner Validation Plan
- **Local Validation**: Deploy a local MinIO container with simulated private bucket ACL and test client credential retrieval via `StorageService`.
- **Deployment Check**: Infrastructure owner must log into the AWS Management Console (or Cloudflare Dashboard for R2) for bucket `thinkwires-storage`:
  1. Navigate to **Permissions** -> **Block public access (bucket settings)**.
  2. Confirm that **Block all public access** is set to **On**.
  3. Under **Bucket Policy**, verify that no statement grants `"Principal": "*"` with `"Action": "s3:GetObject"`.
  4. Confirm that default encryption is enabled with AWS KMS or AES-256.

---

## 2. NV-DB-01: Cloud PostgreSQL TLS CA Certificate Chain Verification in Managed Environments

- **Lead Identifier**: `NV-DB-01`
- **Target Subsystem**: Relational Datastore Gateway (`apps/backend/src/configs/db.js:27-56`)
- **Boundary**: Untrusted Network / VPC vs Database Engine
- **Claimed Root Cause**: Default cloud database SSL configuration in `db.js` permits connections without certificate authority verification (`rejectUnauthorized: false`) unless explicitly overridden by environment variables.

### 2.1 Source Trace & Evidence
- **Entrypoint**: `apps/backend/src/configs/db.js:27` (`enableSsl`)
  Detects cloud-managed database host from `DATABASE_URL` (`neon.tech`, `supabase.co`, `rds.amazonaws.com`) and enables SSL mode.
- **Propagation**: `apps/backend/src/configs/db.js:32-44` (`rejectUnauthorized`)
  Evaluates `rejectUnauthorized` boolean. Line 40 checks:
  ```javascript
  if (isProduction && !isCloudManaged) {
    return true;
  }
  return false;
  ```
  This skips strict certificate chain verification for cloud-managed instances unless `DB_CA_CERT` or `DB_SSL_REJECT_UNAUTHORIZED=true` is set.
- **Sink**: `apps/backend/src/configs/db.js:56` (`Sequelize.dialectOptions.ssl`)
  Passes `rejectUnauthorized` into Sequelize PostgreSQL connection options.

### 2.2 Exact Blocker
Production deployment environment variables cannot be observed from source code to confirm whether `DB_CA_CERT` or `DB_SSL_REJECT_UNAUTHORIZED=true` is actively injected into container runtime environments.

### 2.3 Safe Owner Validation Plan
- **Local Validation**: Run a local PostgreSQL instance with a self-signed certificate and observe connection rejection behavior when `DB_SSL_REJECT_UNAUTHORIZED` is varied.
- **Deployment Check**: Infrastructure administrator must verify that the production container environment:
  1. Sets `DB_SSL_REJECT_UNAUTHORIZED=true`.
  2. Injects the database provider's root certificate bundle into `DB_CA_CERT` (or sets `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`), ensuring complete TLS chain validation against MITM attacks.

---

## 3. NV-NET-01: Container Network Ingress Isolation for Internal AI Microservice Port 8000

- **Lead Identifier**: `NV-NET-01`
- **Target Subsystem**: AI Microservice Ingress (`docker-compose.yml:45` & `apps/ai_services/app/api/deps.py:9`)
- **Boundary**: Public Internet vs Internal AI Engine
- **Claimed Root Cause**: Port binding in default `docker-compose.yml` maps `8000:8000` to the container host, requiring cloud network security policy validation.

### 3.1 Source Trace & Evidence
- **Entrypoint**: `docker-compose.yml:45` (`services.ai_services.ports`)
  Publishes `"8000:8000"` directly to the host network interface.
- **Sink**: `apps/ai_services/app/api/deps.py:9` (`verify_internal_api_key`)
  Receives requests over HTTP port 8000 to authenticate `X-Internal-AI-Key`.

### 3.2 Exact Blocker
Production cloud cluster topology and security group / VPC ingress firewall rules cannot be inspected from source code. While application-level authentication (`X-Internal-AI-Key`) is verified and functional, network-level ingress firewalling cannot be confirmed without inspecting infrastructure settings.

### 3.3 Safe Owner Validation Plan
- **Local Validation**: Inspect `docker-compose ps` and network bindings locally to verify that `ai_services` is reachable only via the internal Docker bridge network (`thinkwires-net`).
- **Deployment Check**: Cluster administrator must verify that the AI microservice container is deployed behind a private VPC or Kubernetes Service with `ClusterIP` (no public NodePort, LoadBalancer, or ingress route), ensuring that external actors cannot reach port 8000 directly.
