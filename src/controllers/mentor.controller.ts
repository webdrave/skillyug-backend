import { Request, Response, NextFunction } from 'express';
import { MentorInvitationStatus } from '@prisma/client';
import { mentorService } from '../services/mentor.service';
import { ResponseUtil } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import type {
  InviteMentorInput,
  VerifyInviteInput,
  MentorSetupInput,
  UpdateMentorProfileInput,
} from '../validators/schemas';

/**
 * Mentor Controller - Handles HTTP requests for mentor operations
 */
export class MentorController {
  /**
   * Admin invites a mentor
   * POST /admin/invite-mentor
   */
  async inviteMentor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { email } = req.body as InviteMentorInput;
      const result = await mentorService.inviteMentor(req.user.id, email);
      
      ResponseUtil.created(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify invitation token
   * GET /auth/verify-invite?token=...
   */
  async verifyInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.query as VerifyInviteInput;
      const result = await mentorService.verifyInvitation(token);
      
      if (result.valid) {
        ResponseUtil.success(res, result, result.message);
      } else {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Setup mentor profile (complete onboarding)
   * POST /mentor/setup
   */
  async setupMentor(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as MentorSetupInput;
      const result = await mentorService.setupMentor(data);
      
      ResponseUtil.created(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get mentor profile
   * GET /mentor/profile/:userId
   */
  async getMentorProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const mentorProfile = await mentorService.getMentorProfile(userId);
      
      ResponseUtil.success(res, { mentorProfile }, 'Mentor profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current mentor's profile
   * GET /mentor/profile
   */
  async getMyProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const mentorProfile = await mentorService.getMentorProfile(req.user.id);
      ResponseUtil.success(res, { mentorProfile }, 'Profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update mentor profile
   * PATCH /mentor/profile
   */
  async updateMentorProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const data = req.body as UpdateMentorProfileInput;
      const mentorProfile = await mentorService.updateMentorProfile(req.user.id, data);
      
      ResponseUtil.success(res, { mentorProfile }, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all mentors (with pagination and filters)
   * GET /mentors
   */
  async getMentors(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, expertise } = req.query;
      
      const result = await mentorService.getMentors({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        expertise: expertise as string,
      });
      
      ResponseUtil.success(res, result, 'Mentors retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all invitations (admin only)
   * GET /admin/mentor-invitations
   */
  async getInvitations(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, status, email } = req.query;
      
      const result = await mentorService.getInvitations({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        status: status as MentorInvitationStatus | undefined,
        email: email as string,
      });
      
      ResponseUtil.success(res, result, 'Invitations retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel invitation (admin only)
   * DELETE /admin/mentor-invitations/:token
   */
  async cancelInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const result = await mentorService.cancelInvitation(token);
      
      ResponseUtil.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }
}

export const mentorController = new MentorController();
