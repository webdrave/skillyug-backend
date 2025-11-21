import { Router } from 'express';
import { mentorController } from '../controllers/mentor.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { authRateLimit } from '../middleware/rateLimiter.middleware';
import {
  inviteMentorSchema,
  verifyInviteSchema,
  mentorSetupSchema,
  updateMentorProfileSchema,
} from '../validators/schemas';
import { UserType } from '@prisma/client';

const mentorRouter = Router();

// ========================================
// PUBLIC ROUTES
// ========================================

/**
 * Verify invitation token
 * GET /auth/verify-invite?token=...
 */
mentorRouter.get(
  '/auth/verify-invite',
  authRateLimit,
  validateRequest({ query: verifyInviteSchema }),
  (req, res, next) => mentorController.verifyInvite(req, res, next)
);

/**
 * Setup mentor profile (complete onboarding)
 * POST /setup
 */
mentorRouter.post(
  '/setup',
  authRateLimit,
  validateRequest({ body: mentorSetupSchema }),
  (req, res, next) => mentorController.setupMentor(req, res, next)
);

/**
 * Get all mentors (public - for browse page)
 * GET /mentors
 */
mentorRouter.get(
  '/mentors',
  (req, res, next) => mentorController.getMentors(req, res, next)
);

/**
 * Get specific mentor profile (public)
 * GET /profile/:userId
 */
mentorRouter.get(
  '/profile/:userId',
  (req, res, next) => mentorController.getMentorProfile(req, res, next)
);

// ========================================
// MENTOR-ONLY ROUTES (Protected)
// ========================================

/**
 * Get current mentor's profile
 * GET /profile
 */
mentorRouter.get(
  '/profile',
  protect,
  restrictTo(UserType.MENTOR, UserType.ADMIN),
  (req, res, next) => mentorController.getMyProfile(req, res, next)
);

/**
 * Update mentor profile
 * PATCH /profile
 */
mentorRouter.patch(
  '/profile',
  protect,
  restrictTo(UserType.MENTOR, UserType.ADMIN),
  validateRequest({ body: updateMentorProfileSchema }),
  (req, res, next) => mentorController.updateMentorProfile(req, res, next)
);

// ========================================
// ADMIN-ONLY ROUTES
// ========================================

/**
 * Invite a mentor (admin only)
 * POST /admin/invite-mentor
 */
mentorRouter.post(
  '/admin/invite-mentor',
  protect,
  restrictTo(UserType.ADMIN),
  validateRequest({ body: inviteMentorSchema }),
  (req, res, next) => mentorController.inviteMentor(req, res, next)
);

/**
 * Get all mentor invitations (admin only)
 * GET /admin/mentor-invitations
 */
mentorRouter.get(
  '/admin/mentor-invitations',
  protect,
  restrictTo(UserType.ADMIN),
  (req, res, next) => mentorController.getInvitations(req, res, next)
);

/**
 * Cancel mentor invitation (admin only)
 * DELETE /admin/mentor-invitations/:token
 */
mentorRouter.delete(
  '/admin/mentor-invitations/:token',
  protect,
  restrictTo(UserType.ADMIN),
  (req, res, next) => mentorController.cancelInvitation(req, res, next)
);

export default mentorRouter;
