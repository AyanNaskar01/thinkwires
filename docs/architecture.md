# Architecture & Security Boundary Map: ThinkWires

## 1. Product, Principals, and Protected Resources
ThinkWires is an enterprise-grade Applicant Tracking System (ATS), Technical Screening, and Bench Workforce Management platform. The platform handles sensitive candidate dossiers, resumes containing Personally Identifiable Information (PII), job requisitions, commercial client bill rates, and administrative audit logs.

### Principals and Authorization Hierarchy
1. **Public Guest**: May browse active job postings, public bench talent cards (with redacted PII), public marketing and industry articles, and submit job applications.
2. **Candidate (`candidate`)**: Authenticated applicant. May manage their profile, view personal job applications, submit weekly timesheets, complete Technical Screening Assessments, and upload/download their own resume and avatar.
3. **CMS Administrator (`cms_admin`)**: Internal operator restricted strictly to managing public marketing content, industry insights, and site settings. Strictly forbidden from viewing recruitment, candidate, or financial records.
4. **Recruitment Administrator (`admin`)**: Internal recruiter. May manage job requirements, review applicants, evaluate screening results, schedule candidate placements, and manage bench resources. Restricted from changing system member credentials or editing core CMS pages.
5. **Superadministrator (`superadmin`)**: Executive authority. Possesses unrestricted system management, user role promotion, system member deactivation, and database audit access.

---

## 2. Comparable Software Baseline
ThinkWires compares directly to modern commercial ATS platforms such as Greenhouse, Lever, and Ashby. Comparable software balances rapid candidate onboarding against enterprise RBAC and PII containment. Modern ATS platforms accept resume document ingestion from untrusted public applicants, relying on sandboxed document parsers, isolated cloud storage, and cryptographic token revocation to prevent cross-tenant dossier leakage.

---

## 3. Technology Stack and Build / Test Execution Model
- **Frontend**: React 19, Vite, Tailwind CSS, Redux Toolkit, MSW. All 28 views lazy-loaded via `React.lazy()` with Suspense boundaries.
- **Backend API Gateway**: Node.js 22, Express 5.2, Helmet, CORS, Cookie-Parser, Pino structured logging, Multer.
- **Datastores**:
  - Primary Operational Store: MongoDB 7 via Mongoose 7.8 (strict schemas, compound Equality-Sort-Range indexes).
  - Relational & Financial Store: PostgreSQL 16 via Sequelize 6.37 with deterministic migration runner (`_pg_migrations`).
  - Distributed Cache & State: Redis 7 client (token revocation, atomic Lua rate limiting).
- **AI Microservice**: Python 3.12, FastAPI, Uvicorn, pypdf, httpx. Multi-LLM provider fallback cascade (Groq -> Gemini -> OpenRouter -> Ollama -> heuristic rule-based engine).
- **Execution & Platform Constraints**: Bounded local Vitest unit test suite (592 passing tests). On Windows platforms, POSIX-specific `O_NOFOLLOW` descriptor traversal is unavailable in Node.js runtime and defaults to standard path-confined validation.

---

## 4. Entry Surfaces and Data Sinks
1. **Public & Candidate Ingress**: Express HTTP endpoints under `/api`, `/api/auth`, `/api/candidate`, and `/uploads/resumes/:filename`. Untrusted multipart payloads and JSON pass through `express.json({ limit: '1mb' })` and `sanitizeInputs`.
2. **Administrative Ingress**: Express HTTP endpoints under `/api/admin`. Protected by HttpOnly JWT cookies, `adminCsrfProtection`, and `manpowerGuard` / `cmsGuard`.
3. **AI Pipeline Ingress**: FastAPI HTTP endpoints under `/api/resume/parse` and `/api/screening/*`. Protected by `X-Internal-AI-Key` service-to-service header.
4. **Security Sinks**: MongoDB document collections (`candidates`, `jobapplications`, `users`, `activities`), PostgreSQL tables (`Users`), Redis key store (`revoked:<token>`, `tw:rl:*`), and S3/R2 storage driver (`uploads/resumes/`).

---

## 5. Trust Boundaries and Primary Controls
1. **Public vs Candidate Data**: Candidate routes enforce `requireCandidateAuth` verifying domain-specific JWTs (`thinkwires_candidate_jwt`), database `tokenVersion` counter, and Redis revocation list. Endpoints strictly scope queries by authenticated candidate ID (`_id: candidateId`).
2. **Candidate vs Candidate Isolation (BOLA/IDOR Defense)**: Candidate dossier and timesheet retrievals enforce `{ _id: id, candidateId: req.candidate._id }`. Direct resume downloads enforce database ownership matching.
3. **Admin Module Isolation (RBAC)**: `manpowerGuard` blocks `cms_admin` from recruitment data with HTTP 403. `cmsGuard` restricts CMS mutations to authorized content editors.
4. **Backend Gateway vs Internal AI Microservice**: Service-to-service boundary enforced by `X-Internal-AI-Key` header with constant-time `hmac.compare_digest` verification and 256-bit entropy. Public `/healthz` probe exposes zero sensitive telemetry.
5. **Untrusted Documents vs LLM Prompt Context**: Untrusted resume and assessment text is wrapped in `<candidate_document_untrusted>` isolation delimiters, sanitized of adversarial prompt tokens, and parsed via strict JSON extraction with heuristic fallback.
6. **Cross-Site Browser vs Gateway (Anti-CSRF & CORS)**: Admin routes enforce double-submit `thinkwires_csrf_token` with `crypto.timingSafeEqual` and strictly scoped official Vercel staging regex (`thinkwires-git-[a-z0-9-]+-tanjil-alams-projects.vercel.app`).
7. **Rate Limiting & Availability**: Distributed Redis Lua script (`INCR` + `PEXPIRE` + `PTTL`) enforces compound IP and account throttling, failing closed for admin authentication in production during Redis outages.

---

## 6. Repository-Relative Starting Paths
- Gateway & Core Server: `apps/backend/src/app.js`, `apps/backend/src/server.js`
- Authentication & Sessions: `apps/backend/src/utils/auth.util.js`, `apps/backend/src/middlewares/auth.middleware.js`
- Access Control & CSRF: `apps/backend/src/middlewares/csrf.middleware.js`, `apps/backend/src/middlewares/rateLimiter.middleware.js`
- Candidate & Admin Controllers: `apps/backend/src/controllers/candidatePortal.controller.js`, `apps/backend/src/controllers/admin.controller.js`
- Datastore Configurations: `apps/backend/src/configs/db.js`, `apps/backend/src/configs/mongodb.js`, `apps/backend/src/configs/redis.js`
- Storage Service Adapter: `apps/backend/src/utils/storage.adapter.js`
- AI Microservice: `apps/ai_services/app/api/deps.py`, `apps/ai_services/app/services/resume_parser.py`
- Frontend Client: `apps/frontend/src/App.jsx`, `apps/frontend/src/admin/adminService.js`

---

## 7. Companion Selection Summary
Derived from `ATTACK-CLASSES.md`:
1. `WEB-PROTOCOL-AND-AUTH.md`: Web application gateway, JWT domain separation, cookie flags, and CSRF defense.
2. `AI-AND-LLM.md`: Internal AI microservice, prompt injection defense, model fallback cascade, and LLM output parsing.
3. `CLIENT-SIDE.md`: React 19 SPA, DOM XSS prevention, and client-side token storage.
4. `CLOUD-AND-DEPLOYMENT.md`: Multi-container Docker Compose, S3 storage adapter, and Vercel cloud hosting.
5. `DATA-ISOLATION-AND-LIFECYCLE.md`: MongoDB compound ESR indexing, soft deletion, and multi-tenant scoping.
6. `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`: Atomic Redis distributed rate limiting and body parser size constraints.
7. `SUPPLY-CHAIN-AND-RELEASE.md`: Non-root Docker container packaging and npm dependency auditing.
