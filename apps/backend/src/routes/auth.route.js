import express from 'express';
import {
  candidateLoginRateLimiter,
  candidateRegisterRateLimiter,
  passwordResetRateLimiter,
  tokenRefreshRateLimiter,
} from '../middlewares/rateLimiter.middleware.js';
import {
  registerCandidate,
  loginCandidate,
  getMe,
  logoutCandidate,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js';
import { requireCandidateAuth } from '../middlewares/auth.middleware.js';
import { getCsrfTokenHandler } from '../middlewares/csrf.middleware.js';

const router = express.Router();

// Anti-CSRF Token Provider
router.get('/csrf-token', getCsrfTokenHandler);

// Candidate Registration & Login
router.post('/register', candidateRegisterRateLimiter, registerCandidate);
router.post('/login', candidateLoginRateLimiter, loginCandidate);
router.post('/logout', logoutCandidate);

// Password recovery
router.post('/forgot-password', passwordResetRateLimiter, forgotPassword);
router.post('/reset-password', passwordResetRateLimiter, resetPassword);

// Session check / restoration
router.get('/me', tokenRefreshRateLimiter, requireCandidateAuth, getMe);

export default router;
