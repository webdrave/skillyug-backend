import { Router } from 'express';
import { studentController } from '../controllers/student.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const studentRouter = Router();

// All routes require authentication as a student
studentRouter.use(protect);
studentRouter.use(restrictTo(UserType.STUDENT, UserType.ENTERPRISE_USER));

/**
 * GET /api/student/sessions
 * Get all sessions for enrolled courses
 */
studentRouter.get('/sessions', studentController.getMySessions);

/**
 * GET /api/student/session/:id/join
 * Get session details and playback URL for joining
 */
studentRouter.get('/session/:id/join', studentController.joinSession);

export default studentRouter;
