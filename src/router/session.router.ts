import { Router } from 'express';
import {
  createSession,
  getSession,
  getMentorSessions,
  getUpcomingSessions,
  getLiveSessions,
  getSessionCredentials,
  startSession,
  endSession,
  updateSession,
  cancelSession,
  getEnrolledCourseSessions,
  getSessionForViewing,
} from '../controllers/session.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

// Public routes
router.get('/live', getLiveSessions);
router.get('/upcoming', getUpcomingSessions);

// Protected routes
router.use(protect);

// Student routes
router.get('/my-sessions', getEnrolledCourseSessions);
router.get('/:sessionId/view', getSessionForViewing);

// General route (for backward compatibility)
router.get('/:sessionId', getSession);

// Mentor only routes
router.post('/', restrictTo(UserType.MENTOR), createSession);
router.get('/mentor/my-sessions', restrictTo(UserType.MENTOR), getMentorSessions);
router.get('/:sessionId/credentials', restrictTo(UserType.MENTOR), getSessionCredentials);
router.post('/:sessionId/start', restrictTo(UserType.MENTOR), startSession);
router.post('/:sessionId/end', restrictTo(UserType.MENTOR), endSession);
router.patch('/:sessionId', restrictTo(UserType.MENTOR), updateSession);
router.delete('/:sessionId/cancel', restrictTo(UserType.MENTOR), cancelSession);

export default router;
