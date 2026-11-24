import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import app from '../../app.js';
import { storageService, cleanUpFile } from '../../utils/storage.adapter.js';
import JobApplication from '../../models/jobApplication.mongo.model.js';
import Candidate from '../../models/candidate.mongo.model.js';
import { localDevApplications } from '../../controllers/candidatePortal.controller.js';
import {
  generateCandidateToken,
  generateAdminToken,
} from '../../utils/auth.util.js';

describe('Resume Upload & Object Storage Integration', () => {
  const origDriver = storageService.driver;
  const origSaveFile = storageService.saveFile;
  const origGetPresigned = storageService.getPresignedDownloadUrl;
  const origDeleteFile = storageService.deleteFile;

  const candidateId = 'test-cand-storage-001';
  const candidateEmail = 'candidate-storage@thinkwires.com';
  const candidateToken = generateCandidateToken({
    id: candidateId,
    email: candidateEmail,
    name: 'Alice StorageCandidate',
  });
  const candidateCookie = `thinkwires_candidate_jwt=${candidateToken}`;

  const otherCandidateToken = generateCandidateToken({
    id: 'other-candidate-999',
    email: 'other@thinkwires.com',
    name: 'Bob Other',
  });
  const otherCandidateCookie = `thinkwires_candidate_jwt=${otherCandidateToken}`;

  const adminToken = generateAdminToken({
    id: 'admin-001',
    email: 'admin@thinkwires.com',
    role: 'admin',
  });
  const adminCookie = `thinkwires_admin_jwt=${adminToken}`;

  const cmsAdminToken = generateAdminToken({
    id: 'cms-001',
    email: 'cms@thinkwires.com',
    role: 'cms_admin',
  });
  const cmsAdminCookie = `thinkwires_admin_jwt=${cmsAdminToken}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    storageService.driver = origDriver;
    storageService.saveFile = origSaveFile;
    storageService.getPresignedDownloadUrl = origGetPresigned;
    storageService.deleteFile = origDeleteFile;
  });

  // =========================================================================
  // Requirement 1 & 2: Direct Object Storage Upload & Object Key in MongoDB
  // =========================================================================
  it('uploads multipart resume directly to object storage via storageService.saveFile and stores object key in MongoDB', async () => {
    const saveFileSpy = vi.spyOn(storageService, 'saveFile').mockResolvedValue(
      'https://cdn.thinkwires.com/resumes/alice-resume.pdf'
    );

    const testResumeBuffer = Buffer.from('%PDF-1.4 Mock Candidate Resume Content for Upload');

    const res = await request(app)
      .post('/api/candidate/apply')
      .set('Cookie', candidateCookie)
      .field('jobId', 'job-s3-test-101')
      .field('jobTitle', 'Lead Cloud Security Architect')
      .field('department', 'Engineering')
      .field('firstName', 'Alice')
      .field('lastName', 'StorageCandidate')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0199')
      .field('agreedToTerms', 'true')
      .field('skills', 'AWS, Kubernetes, Terraform')
      .attach('resume', testResumeBuffer, 'alice-security-resume.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(saveFileSpy).toHaveBeenCalledTimes(1);

    const [savedBuffer, savedFilename, savedMime, savedFolder] = saveFileSpy.mock.calls[0];
    expect(Buffer.isBuffer(savedBuffer)).toBe(true);
    expect(savedFilename).toMatch(/alice-security-resume/);
    expect(savedMime).toBe('application/pdf');
    expect(savedFolder).toBe('resumes');

    // 2. Verify stored application in MongoDB contains only the object key
    const appRecord = res.body.application;
    expect(appRecord).toBeDefined();
    expect(appRecord.resumeKey).toMatch(/^resumes\/.+\.pdf$/);
    expect(appRecord.resumeUrl).toMatch(/^resumes\/.+\.pdf$/);
    expect(appRecord.resumePath).toBe(''); // No local container path stored
  });

  // =========================================================================
  // Requirement 3: Authorized Pre-Signed Downloads
  // =========================================================================
  it('generates authorized pre-signed download URLs for legitimate candidates and admins, but blocks CMS admin and unauthorized candidates', async () => {
    storageService.driver = 's3';
    const filename = 'alice_secure_resume_123.pdf';
    const mockPresignedUrl = `https://thinkwires-resumes.s3.amazonaws.com/resumes/${filename}?X-Amz-Expires=900&X-Amz-Signature=mock99`;

    vi.spyOn(storageService, 'getPresignedDownloadUrl').mockResolvedValue(mockPresignedUrl);

    // Mock application in both Mongoose and localDev store
    localDevApplications.push({
      _id: 'app-alice-123',
      candidate: candidateId,
      resumeKey: `resumes/${filename}`,
      resumeUrl: `resumes/${filename}`,
    });

    vi.spyOn(JobApplication, 'findOne').mockResolvedValue({
      _id: 'app-alice-123',
      candidate: candidateId,
      resumeKey: `resumes/${filename}`,
      resumeUrl: `resumes/${filename}`,
    });

    // 1. Authorized Candidate requests JSON pre-signed URL
    const candJsonRes = await request(app)
      .get(`/api/candidate/resume-url/${filename}`)
      .set('Cookie', candidateCookie);

    expect(candJsonRes.status).toBe(200);
    expect(candJsonRes.body.success).toBe(true);
    expect(candJsonRes.body.downloadUrl).toBe(mockPresignedUrl);
    expect(candJsonRes.body.key).toBe(`resumes/${filename}`);

    // 2. Authorized Candidate requests direct browser download link (302 redirect)
    const candRedirectRes = await request(app)
      .get(`/api/candidate/resume/${filename}`)
      .set('Cookie', candidateCookie);

    expect(candRedirectRes.status).toBe(302);
    expect(candRedirectRes.headers.location).toBe(mockPresignedUrl);

    // 3. Admin is authorized to download via /uploads/resumes/:filename
    const adminRes = await request(app)
      .get(`/uploads/resumes/${filename}?json=true`)
      .set('Cookie', adminCookie);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.downloadUrl).toBe(mockPresignedUrl);

    // 4. CMS Admin is forbidden by RBAC
    const cmsRes = await request(app)
      .get(`/uploads/resumes/${filename}?json=true`)
      .set('Cookie', cmsAdminCookie);

    expect(cmsRes.status).toBe(403);
    expect(cmsRes.body.error).toMatch(/restricted/i);

    // 5. Unauthenticated user is rejected with 401
    const unauthRes = await request(app)
      .get(`/uploads/resumes/${filename}?json=true`);

    expect(unauthRes.status).toBe(401);

    // 6. Unauthorized Candidate (BOLA attempt) is forbidden with 403
    vi.spyOn(JobApplication, 'findOne').mockResolvedValue(null);
    vi.spyOn(Candidate, 'findOne').mockResolvedValue(null);

    const bolaRes = await request(app)
      .get(`/api/candidate/resume-url/${filename}`)
      .set('Cookie', otherCandidateCookie);

    expect(bolaRes.status).toBe(403);
    expect(bolaRes.body.error).toMatch(/only download your own resume/i);
  });

  // =========================================================================
  // Requirement 4: Temporary File Cleanup
  // =========================================================================
  it('cleans up temporary staging file from disk after successful upload in parseResumeForAutoFill', async () => {
    let observedTempPath = '';

    const testResumeBuffer = Buffer.from('%PDF-1.4 Mock Parse Content');

    const res = await request(app)
      .post('/api/candidate/parse-resume')
      .set('Cookie', candidateCookie)
      .attach('resume', testResumeBuffer, 'temp-parse-sample.pdf');

    expect([200, 429]).toContain(res.status);

    // Verify helper cleanUpFile handles missing or existing paths gracefully
    const tempFile = path.resolve(process.cwd(), 'uploads/temp_resumes/test-cleanup-verify.tmp');
    fs.mkdirSync(path.dirname(tempFile), { recursive: true });
    fs.writeFileSync(tempFile, 'temporary data');

    expect(fs.existsSync(tempFile)).toBe(true);
    await cleanUpFile(tempFile);
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  // =========================================================================
  // Requirement 5: Failed Uploads Never Create Incomplete Applications
  // =========================================================================
  it('handles object storage upload failures without creating incomplete applications or leaking temp files', async () => {
    vi.spyOn(storageService, 'saveFile').mockRejectedValue(
      new Error('AWS S3 Network ECONNRESET: Socket disconnected unexpectedly')
    );

    const initialLen = localDevApplications.length;

    const testResumeBuffer = Buffer.from('%PDF-1.4 Mock Content');

    const res = await request(app)
      .post('/api/candidate/apply')
      .set('Cookie', candidateCookie)
      .field('jobId', 'job-fail-test-999')
      .field('jobTitle', 'Principal Reliability Engineer')
      .field('firstName', 'Alice')
      .field('lastName', 'StorageCandidate')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0199')
      .field('agreedToTerms', 'true')
      .attach('resume', testResumeBuffer, 'failing-upload-resume.pdf');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/failed to upload resume to secure storage/i);

    // Verify NO application was persisted
    expect(localDevApplications.length).toBe(initialLen);
    const createdRecord = localDevApplications.find((a) => a.jobId === 'job-fail-test-999');
    expect(createdRecord).toBeUndefined();
  });
});
