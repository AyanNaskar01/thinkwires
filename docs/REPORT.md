# Full Application Security Audit Report: ThinkWires

**Audit ID**: `thinkwires-run-1`  
**Repository**: `thinkwires`  
**Target Commit Hash**: `9111ab2021dec762988de9ddfa48b73cff6f7728`  
**Run Profile**: `standard`  
**Execution Policy**: Sandboxed Source and Local Only (Offline, Dummy Principals, No External Network Probing)  
**Audit Standard**: Cloudflare Security Audit Skill Framework (Six-Phase Source-First Discipline)

---

## 1. Executive Summary & Security Posture Assessment

A comprehensive, defense-in-depth security audit of the **ThinkWires** Applicant Tracking System (ATS), Technical Screening, and Bench Workforce Management platform was conducted across all ten target domains:
1. Frontend Security (React 19 / Vite SPA)
2. Backend Security (Node.js 22 / Express 5 API Gateway)
3. Authentication & Authorization (JWT Domain Separation, RBAC, Sessions)
4. Database Security & Tenant Isolation (PostgreSQL 16, MongoDB 7, Redis 7)
5. AI / LLM Security (FastAPI Microservice, Prompt Injection Defense, Fallback Cascade)
6. File Upload & Storage Security (Multer, S3/R2 Storage Adapter, Path Traversal)
7. Dependency & Supply-Chain Security (Rootless Docker, Lockfile Integrity)
8. Cloud Infrastructure & Deployment Configuration (Docker Compose, Vercel, Host Binding)
9. Admin Dashboard & Privileged Operations (manpowerGuard, CMS Isolation, Anti-CSRF)
10. Logging, Monitoring & Secrets Management (Pino Masking, Token Revocation, Rate Limits)

### Posture Assessment
ThinkWires exhibits an exceptionally strong foundational security posture as a result of earlier remediation milestones (Sprint 7 / Milestones 1–6):
- **Authentication & RBAC**: Strict cryptographic domain separation between Admin and Candidate JWTs with 256-bit entropy requirements. Robust module-level RBAC (`manpowerGuard`, `cmsGuard`) enforces complete separation between recruitment ATS workflows and marketing content management.
- **Tenant Isolation & BOLA Defense**: Candidate routes strictly scope queries to the authenticated candidate identifier, preventing horizontal cross-candidate dossier or timesheet tampering.
- **Injection Defenses**: Input sanitizers neutralize NoSQL operators; dynamic CSP nonces and zero client-side `dangerouslySetInnerHTML` / `eval()` usage eliminate XSS attack surfaces.
- **AI Microservice Confinement**: Internal FastAPI endpoints enforce `X-Internal-AI-Key` constant-time `hmac.compare_digest` verification; untrusted candidate text is isolated within XML delimiters and filtered against adversarial prompt injection directives.
- **Availability & Process Safety**: Distributed Redis Lua rate limiting throttles abusive traffic atomically, with strict production fail-closed policies for admin authentication routes.

**Areas Requiring Action Prior to Production Deployment**:
1. **Object Storage Persistence & Pre-Signed URLs (SEC-STA-01, High)**: The S3 storage driver in `storage.adapter.js` does not transmit file buffers to AWS S3 / Cloudflare R2, causing uploaded resumes to be dropped, and `downloadResume` issues unauthenticated direct public redirects rather than generating time-limited pre-signed URLs.
2. **Candidate Portal Anti-CSRF Hardening (SEC-CSRF-02, Medium)**: Candidate mutating routes rely solely on origin/referer inspection that permits requests when headers are stripped, while authentication cookies default to `SameSite=None` in production.
3. **Cloud Infrastructure Verification (3 Leads)**: Live S3 bucket public access blocks, cloud PostgreSQL TLS CA certificate bundles, and microservice container network isolation require operator verification.

---

## 2. Confirmed Findings Summary

| Severity | Fingerprint | Title | Affected Boundary | Observed Result |
| :---: | :---: | :--- | :--- | :--- |
| **HIGH** | `SEC-STA-01` | S3 Storage Driver Missing Object Upload & Public Redirect Bypassing Pre-Signed Access Control | Uploaded File vs Server Disk & Cloud Object Store | Resumes are never transmitted to S3, and download requests redirect to unauthenticated public URLs resulting in 403/404 errors or authorization bypass. |
| **MEDIUM** | `SEC-CSRF-02` | Candidate Portal Missing Synchronizer CSRF Token with SameSite None Cookie Default | Cross-Site Browser vs Candidate Session | Candidate routes lack CSRF synchronizer tokens and allow state mutations if origin headers are omitted while cookies default to SameSite=None. |

---

## 3. Confirmed Vulnerability Details

### 3.1 SEC-STA-01: S3 Storage Driver Missing Object Upload & Public Redirect Bypassing Pre-Signed Access Control
- **Source Location**: [`apps/backend/src/utils/storage.adapter.js:61-75`](file:///c:/Users/Tanjil%20Alam/Desktop/ThinkWires/thinkwires/apps/backend/src/utils/storage.adapter.js#L61-L75), [`apps/backend/src/controllers/candidatePortal.controller.js:1561-1564`](file:///c:/Users/Tanjil%20Alam/Desktop/ThinkWires/thinkwires/apps/backend/src/controllers/candidatePortal.controller.js#L1561-L1564)
- **Lower-Trust Principal**: Authenticated Candidate / Public Applicant
- **Target-Native Bounded Reproduction**:
  1. Configure `STORAGE_DRIVER=s3`, `S3_BUCKET=thinkwires-prod` in environment.
  2. Candidate submits job application with resume file via `POST /api/candidate/apply`.
  3. Verify S3 bucket: Observe file buffer was never uploaded to AWS S3.
  4. Access resume download endpoint `GET /uploads/resumes/:filename`.
  5. Backend issues HTTP 302 redirecting to `https://thinkwires-prod.s3.us-east-1.amazonaws.com/resumes/:filename`.
  6. Client receives HTTP 403 Access Denied from S3 on private buckets, or bypasses backend access control on public buckets.
- **Conditions**: `STORAGE_DRIVER` set to `'s3'` in production.
- **Actual Result**: Permanent loss of uploaded resume files; download redirection fails or bypasses authorization.
- **Impact & Priority Rationale**: High impact on recruitment operations and candidate data integrity; deterministic failure on cloud deployments.
- **Smallest Effective Source Fix**: Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Implement `PutObjectCommand` inside `StorageService.saveFile()`, and generate a 15-minute time-limited signed URL using `getSignedUrl(s3Client, new GetObjectCommand(...))` in `downloadResume()`.

---

### 3.2 SEC-CSRF-02: Candidate Portal Missing Synchronizer CSRF Token with SameSite None Cookie Default
- **Source Location**: [`apps/backend/src/routes/candidate.route.js:46-72`](file:///c:/Users/Tanjil%20Alam/Desktop/ThinkWires/thinkwires/apps/backend/src/routes/candidate.route.js#L46-L72), [`apps/backend/src/utils/auth.util.js:235-245`](file:///c:/Users/Tanjil%20Alam/Desktop/ThinkWires/thinkwires/apps/backend/src/utils/auth.util.js#L235-L245)
- **Lower-Trust Principal**: Untrusted Cross-Origin Web Application
- **Target-Native Bounded Reproduction**:
  1. Candidate logs into Candidate Portal; browser stores `thinkwires_candidate_jwt` with `SameSite=None; Secure`.
  2. Candidate visits attacker website containing an auto-submitting form targeting `/api/candidate/applications/:id/withdraw` with `<meta name="referrer" content="no-referrer">`.
  3. Browser transmits the authenticated cookie while omitting the `Referer` header.
  4. Backend middleware `candidateOriginProtection` observes `effectiveOrigin` as null and passes request to controller.
  5. Application is withdrawn without candidate consent.
- **Conditions**: Active candidate session; `COOKIE_SAME_SITE` unset in environment (defaulting to `'none'`).
- **Actual Result**: State-changing operations execute without anti-CSRF token verification.
- **Impact & Priority Rationale**: Medium impact; unauthorized mutations are restricted to candidate's own records and require specific referrer-stripping browser conditions.
- **Smallest Effective Source Fix**: Set default `sameSite` to `'lax'` in `apps/backend/src/utils/auth.util.js`, and mount anti-CSRF token validation (`adminCsrfProtection` or dedicated candidate CSRF middleware) on mutating candidate routes in `apps/backend/src/routes/candidate.route.js`.

---

## 4. Unresolved Security Leads (NEEDS-VALIDATION)

These leads represent critical cloud, network, and provider dependencies that cannot be verified solely from repository source code and require non-destructive operator inspection.

| Lead ID | Target Subsystem | Boundary | Exact Blocker | Safe Operator Validation Plan |
| :---: | :--- | :--- | :--- | :--- |
| **`NV-CLD-01`** | Cloud Object Storage (`storage.adapter.js:17`) | Public Internet vs Private S3 Resume Bucket | S3 Block Public Access and bucket ACL settings cannot be observed from source code. | Inspect AWS S3 Console for bucket `thinkwires-storage` to confirm "Block all public access" is enabled and no public `s3:GetObject` permission exists. |
| **`NV-DB-01`** | Relational Datastore Gateway (`db.js:32-44`) | Network / VPC vs PostgreSQL Engine | Production container environment variables cannot be observed to confirm if `DB_CA_CERT` or `DB_SSL_REJECT_UNAUTHORIZED=true` is set. | Verify production environment sets `DB_SSL_REJECT_UNAUTHORIZED=true` and injects provider root CA certificate into `DB_CA_CERT` to prevent MITM attacks. |
| **`NV-NET-01`** | AI Microservice Ingress (`docker-compose.yml:45`) | Public Internet vs Internal AI Engine | Production cloud VPC security groups and Kubernetes Service network policies cannot be inspected from source code. | Verify AI microservice is deployed behind private VPC / Kubernetes `ClusterIP` with no external ingress route to port 8000. |

---

## 5. Security Hardening Notes & Positive Findings

During the audit, the following enterprise security controls were independently verified in repository source code:
1. **Dynamic CSP Nonce Generation (`apps/backend/src/app.js:58-84`)**: Per-request 128-bit cryptographic nonces (`res.locals.cspNonce`) dynamically injected into Helmet's `styleSrc` directive.
2. **Atomic Rate Limiting (`apps/backend/src/middlewares/rateLimiter.middleware.js`)**: Atomic Redis Lua script (`INCR` + `PEXPIRE` + `PTTL`) eliminates race conditions; production admin authentication strictly fails closed if Redis is unavailable.
3. **NoSQL Injection Sanitization (`apps/backend/src/middlewares/sanitize.middleware.js`)**: Input sanitizer recursively strips MongoDB query operators (`$gt`, `$where`, `$regex`) from `req.body`, `req.query`, and `req.params`.
4. **JWT Cryptographic Domain Separation (`apps/backend/src/utils/auth.util.js`)**: Candidate and Admin JWTs are signed with strictly isolated secrets. In production, `JWT_ADMIN_SECRET` must be distinct from `JWT_SECRET` and meet 256-bit entropy thresholds.
5. **Token Versioning & Blacklisting (`apps/backend/src/middlewares/auth.middleware.js`)**: Dual revocation system: Redis distributed blacklist (`revoked:<token>`) for instant session logout, and database `tokenVersion` check on every request for global credential invalidation.
6. **AI Service Authentication (`apps/ai_services/app/api/deps.py`)**: `X-Internal-AI-Key` service-to-service header authenticated using constant-time `hmac.compare_digest` to prevent side-channel timing leaks.
7. **Prompt Injection Delimiter Isolation (`apps/ai_services/app/services/resume_parser.py`)**: Untrusted candidate resume text is encapsulated within `<candidate_document_untrusted>` XML tags, with XML delimiter escaping and adversarial prompt instruction regex filtering.
8. **Client-Side Storage Hardening (`apps/frontend/src/utils/apiConfig.js`)**: Zero credential persistence in `localStorage`; Candidate JWTs maintained in volatile memory and HttpOnly cookies, eliminating XSS token harvesting vectors.

---

## 6. Coverage Ledger Summary

- **Total Units Planned & Audited**: 12 units
- **Units Fully Covered**: 7 units
- **Units Generating Candidate / Leads**: 5 units (2 confirmed findings, 3 needs-validation leads)
- **Units Blocked / Deferred**: 0 units
- **Total Passing Automated Tests**: 592/592 passing tests (275 backend tests, 317 frontend tests)
- **Validator Status**:
  - `coverage-ledger.json`: Validated (12 units valid, 0 structural or canonical reference errors)
  - `findings.json`: Validated against `report-schema.json` (5 records valid, 0 schema or trace errors)
