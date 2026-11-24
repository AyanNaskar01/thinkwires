# Detailed Vulnerability Findings & Remediation Guide

This document provides in-depth technical analysis, source-code traces, target-neutral reproduction steps, and exact remediation diffs for all confirmed vulnerabilities identified during the ThinkWires application security audit.

---

## 1. Finding SEC-STA-01: S3 Storage Driver Missing Object Upload & Public Redirect Bypassing Pre-Signed Access Control

- **Finding Fingerprint**: `SEC-STA-01`
- **Overall Severity**: **HIGH**
- **Likelihood**: High (Occurs deterministically on every file upload and download operation when `STORAGE_DRIVER=s3`)
- **Demonstrated Impact**: High (Permanent loss of uploaded resume files and failure of recruitment workflows)
- **Confidence**: High (Confirmed via direct source code analysis of `storage.adapter.js`, `candidatePortal.controller.js`, and `package.json`)
- **Affected Subsystem**: File Ingestion / Resume Storage (`apps/backend/src/utils/storage.adapter.js`)

### 1.1 Technical Summary & Root Cause
In `apps/backend/src/utils/storage.adapter.js`, the `StorageService` class was designed to decouple file storage from local ephemeral container disks by supporting AWS S3 and Cloudflare R2 object storage. However, inspection of `saveFile()` reveals that when `this.driver === 's3'`, the method computes and returns a formatted S3/CDN URL string without transmitting the file buffer to AWS S3 or Cloudflare R2 using an S3 SDK client (`PutObjectCommand`).

Furthermore, in `apps/backend/package.json`, neither `@aws-sdk/client-s3` nor `@aws-sdk/s3-request-presigner` is installed in `dependencies`.

In `apps/backend/src/controllers/candidatePortal.controller.js`, the resume download endpoint (`downloadResume`) verifies candidate ownership in the database, but if `storageService.driver === 's3'`, it executes:
```javascript
if (storageService.driver === 's3') {
  const remoteUrl = storageService.getFileUrl(safeFilename, 'resumes');
  return res.redirect(remoteUrl);
}
```
This issues an HTTP 302 redirect directly to the public S3 URL (`https://${bucket}.s3.${region}.amazonaws.com/resumes/${filename}`) without generating a time-limited pre-signed URL (`getSignedUrl`). As a result:
1. If the S3 bucket is private (the standard security posture for confidential resumes containing PII), the user's browser receives an XML `403 AccessDenied` error from AWS S3.
2. If the bucket is made public to allow downloads, any unauthenticated actor on the internet who discovers or guesses the filename can bypass backend authorization and download candidate resumes directly.
3. Because `saveFile()` never uploaded the file buffer, the file does not exist on S3, causing permanent data loss for applicants.

### 1.2 Source Code Trace
1. **Entrypoint**: `apps/backend/src/controllers/candidatePortal.controller.js:326` (`applyForJob`)
   Candidate uploads resume file during job application. Multer processes the multipart stream and stores it temporarily.
2. **Propagation**: `apps/backend/src/utils/storage.adapter.js:61` (`StorageService.saveFile`)
   Execution branches on `this.driver === 's3'`. Rather than issuing an S3 PutObject API call, it returns a formatted URL string:
   ```javascript
   if (this.driver === 's3') {
     const endpoint = process.env.S3_ENDPOINT;
     const key = `${folder}/${safeName}`;
     if (this.cdnDomain) return `https://${this.cdnDomain}/${key}`;
     if (endpoint) return `${endpoint.replace(/\/+$/, '')}/${this.bucket}/${key}`;
     return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
   }
   ```
3. **Sink**: `apps/backend/src/controllers/candidatePortal.controller.js:1563` (`downloadResume`)
   Executes `res.redirect(remoteUrl)`, redirecting client to an unauthenticated public bucket URL without generating an authorized pre-signed token.

### 1.3 Target-Neutral Reproduction Steps
1. Set environment variables:
   ```env
   STORAGE_DRIVER=s3
   S3_BUCKET=thinkwires-prod-storage
   S3_REGION=us-east-1
   ```
2. Authenticate as a candidate and submit a job application with an attached PDF resume via `POST /api/candidate/apply`.
3. Check the target S3 bucket in AWS: Observe that the resume file was never uploaded.
4. Request resume download via `GET /uploads/resumes/:filename`.
5. Observe that the backend responds with HTTP 302 redirecting to `https://thinkwires-prod-storage.s3.us-east-1.amazonaws.com/resumes/:filename`.
6. Follow redirect in browser: Observe HTTP 403 Access Denied or 404 NoSuchKey.

### 1.4 Remediation Plan
1. Install AWS SDK S3 packages in `apps/backend`:
   ```bash
   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
   ```
2. In `apps/backend/src/utils/storage.adapter.js`, initialize `S3Client` and implement real object persistence:
   ```javascript
   import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
   import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

   export class StorageService {
     constructor(options = {}) {
       // ... existing setup ...
       if (this.driver === 's3') {
         this.s3Client = new S3Client({
           region: this.region,
           ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
           credentials: process.env.AWS_ACCESS_KEY_ID ? {
             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
           } : undefined,
         });
       }
     }

     async saveFile(fileBuffer, filename, mimeType = 'application/octet-stream', folder = 'resumes') {
       const safeName = this.sanitizeFilename(filename);
       const key = `${folder}/${safeName}`;

       if (this.driver === 's3' && this.s3Client) {
         await this.s3Client.send(new PutObjectCommand({
           Bucket: this.bucket,
           Key: key,
           Body: fileBuffer,
           ContentType: mimeType,
           ServerSideEncryption: 'AES256',
         }));
         return `/uploads/${folder}/${safeName}`;
       }

       // Local disk fallback
       const filePath = this.resolveLocalPath(folder, safeName);
       await fs.promises.writeFile(filePath, fileBuffer);
       return `/uploads/${folder}/${safeName}`;
     }

     async getPresignedDownloadUrl(filename, folder = 'resumes', expiresIn = 900) {
       const safeName = this.sanitizeFilename(filename);
       const key = `${folder}/${safeName}`;
       const command = new GetObjectCommand({
         Bucket: this.bucket,
         Key: key,
         ResponseContentDisposition: `attachment; filename="${safeName}"`,
       });
       return getSignedUrl(this.s3Client, command, { expiresIn });
     }
   }
   ```
3. In `apps/backend/src/controllers/candidatePortal.controller.js`, update `downloadResume`:
   ```javascript
   if (storageService.driver === 's3') {
     const presignedUrl = await storageService.getPresignedDownloadUrl(safeFilename, 'resumes', 900);
     return res.redirect(presignedUrl);
   }
   ```

---

## 2. Finding SEC-CSRF-02: Candidate Portal Missing Synchronizer CSRF Token with SameSite None Cookie Default

- **Finding Fingerprint**: `SEC-CSRF-02`
- **Overall Severity**: **MEDIUM**
- **Likelihood**: Medium (Requires victim candidate to visit malicious site with active session while browser strips origin/referer headers)
- **Demonstrated Impact**: Medium (Unauthorized state mutations on candidate resources, including application withdrawal and profile tampering)
- **Confidence**: High (Confirmed via direct source code analysis of `candidate.route.js` and `auth.util.js`)
- **Affected Subsystem**: Candidate Portal Routing (`apps/backend/src/routes/candidate.route.js`)

### 2.1 Technical Summary & Root Cause
In `apps/backend/src/utils/auth.util.js`, `setAuthCookie()` configures candidate authentication cookies as follows:
```javascript
const isProduction = process.env.NODE_ENV === 'production';
const sameSite = process.env.COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax');
const secure = isProduction || sameSite.toLowerCase() === 'none';
res.cookie('thinkwires_candidate_jwt', token, {
  httpOnly: true,
  secure,
  sameSite,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
});
```
When `COOKIE_SAME_SITE` is unset in a production environment, `sameSite` defaults to `'none'`. Cookies with `SameSite=None; Secure` are automatically attached by browsers to cross-site requests.

Unlike the Admin Portal—which enforces double-submit CSRF token validation (`adminCsrfProtection`) on all mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`)—the Candidate Portal routes in `apps/backend/src/routes/candidate.route.js` only mount `candidateOriginProtection`:
```javascript
const origin = req.headers.origin;
const referer = req.headers.referer;
let effectiveOrigin = origin;
if (!effectiveOrigin && referer) {
  try { effectiveOrigin = new URL(referer).origin; } catch { effectiveOrigin = null; }
}

if (effectiveOrigin && !isAllowedOrigin(effectiveOrigin)) {
  return res.status(403).json({
    success: false,
    error: 'Cross-origin request blocked: Untrusted origin or referer.',
    origin: effectiveOrigin,
  });
}
next();
```
If an HTTP client or browser issues a request where both `Origin` and `Referer` headers are omitted (for example, via `<meta name="referrer" content="no-referrer">`, privacy-enhancing browser extensions, or specific cross-origin contexts), `effectiveOrigin` evaluates to `null`. The condition `if (effectiveOrigin && !isAllowedOrigin(effectiveOrigin))` evaluates to `false`, allowing the request to proceed directly to the authenticated controller without verifying anti-CSRF tokens.

### 2.2 Source Code Trace
1. **Entrypoint**: `apps/backend/src/routes/candidate.route.js:88-100` (`/apply`, `/profile`, `/applications/:id/withdraw`)
   State-changing endpoints receive requests authenticated by `thinkwires_candidate_jwt`.
2. **Propagation**: `apps/backend/src/routes/candidate.route.js:46-72` (`candidateOriginProtection`)
   Extracts `origin` and `referer`. If both are absent or stripped, `effectiveOrigin` is null, bypassing the origin rejection guard.
3. **Sink**: `apps/backend/src/controllers/candidatePortal.controller.js:320` (`withdrawApplication`, `updateCandidateProfile`)
   Executes the state change under the victim candidate's session.

### 2.3 Target-Neutral Reproduction Steps
1. Victim candidate logs into the ThinkWires Candidate Portal; browser holds valid `thinkwires_candidate_jwt` cookie.
2. Candidate visits an external attacker-controlled web page in another browser tab.
3. Attacker page includes:
   ```html
   <meta name="referrer" content="no-referrer">
   <form id="csrfForm" action="https://thinkwires.com/api/candidate/applications/67201b1e9f1a2b3c4d5e6f7a/withdraw" method="POST">
   </form>
   <script>document.getElementById('csrfForm').submit();</script>
   ```
4. Because `SameSite=None`, the browser attaches the `thinkwires_candidate_jwt` cookie.
5. Because `no-referrer` is specified, the `Referer` header is omitted, and the cross-origin request executes.
6. The application is withdrawn without the candidate's consent.

### 2.4 Remediation Plan
1. Change the default `sameSite` cookie attribute to `'lax'` in `apps/backend/src/utils/auth.util.js`:
   ```javascript
   // apps/backend/src/utils/auth.util.js:235
   const sameSite = process.env.COOKIE_SAME_SITE || 'lax';
   ```
2. Mount anti-CSRF token verification on Candidate Portal mutating routes:
   In `apps/backend/src/routes/candidate.route.js`, require `adminCsrfProtection` or a dedicated `candidateCsrfProtection` middleware that rejects any mutating request lacking a valid `X-CSRF-Token` header matching the `thinkwires_csrf_token` cookie.
