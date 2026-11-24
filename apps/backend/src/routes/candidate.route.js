import express from 'express';
import {
  getCandidateDashboard,
  updateCandidateProfile,
  getMyApplications,
  applyForJob,
  parseResumeForAutoFill,
  getApplicationAssessment,
  submitApplicationAssessment,
  saveAssessmentDraft,
  withdrawApplication,
  getApplicationDossier,
  uploadAvatar,
  setAvatarPreset,
  removeAvatar,
  downloadResume,
} from '../controllers/candidatePortal.controller.js';
import {
  requireCandidateAuth,
  optionalCandidateAuth,
} from '../middlewares/auth.middleware.js';
import {
  resumeUpload,
  avatarUpload,
  validateUploadedResume,
  validateUploadedAvatar,
} from '../middlewares/upload.middleware.js';
import { candidateCsrfProtection } from '../middlewares/csrf.middleware.js';
import { aiEndpointRateLimiter } from '../middlewares/rateLimiter.middleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Throttle job applications to prevent abuse and spam submissions (Issue #187)
const candidateApplyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  message: {
    success: false,
    error:
      'Too many job applications submitted from this network. Please wait 15 minutes before applying again.',
  },
});

router.post(
  '/parse-resume',
  aiEndpointRateLimiter,
  candidateCsrfProtection,
  resumeUpload.single('resume'),
  validateUploadedResume,
  parseResumeForAutoFill
);

router.use(candidateCsrfProtection);
router.use(requireCandidateAuth);

router.get('/dashboard', getCandidateDashboard);
router.put('/profile', updateCandidateProfile);

router.post(
  '/apply',
  candidateApplyRateLimiter,
  resumeUpload.single('resume'),
  validateUploadedResume,
  applyForJob
);
router.get('/applications', getMyApplications);
router.post('/applications/:applicationId/withdraw', withdrawApplication);

router.get('/applications/:applicationId/assessment', getApplicationAssessment);
router.put('/applications/:applicationId/assessment/draft', saveAssessmentDraft);
router.post('/applications/:applicationId/assessment/draft', saveAssessmentDraft);
router.post(
  '/applications/:applicationId/assessment/submit',
  submitApplicationAssessment
);

// Evaluation Dossier & Avatar Routes
router.get('/applications/:applicationId/dossier', getApplicationDossier);
router.post(
  '/avatar/upload',
  avatarUpload.single('avatar'),
  validateUploadedAvatar,
  uploadAvatar
);
router.put('/avatar/preset', setAvatarPreset);
router.delete('/avatar', removeAvatar);
router.get('/resume/:filename', downloadResume);
router.get('/resume-url/:filename', (req, res, next) => {
  req.query.json = 'true';
  return downloadResume(req, res, next);
});

export default router;
