import { Response, NextFunction } from 'express';
import { enrollmentService } from '../services/enrollment.service';
import { ResponseUtil } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

/**
 * Enrollment Controller
 * Handles HTTP requests for enrollment operations
 */
export class EnrollmentController {

  /**
   * Get user's enrollments
   * GET /api/enrollments/my-enrollments
   */
  async getMyEnrollments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }

      const result = await enrollmentService.getUserEnrollments(userId);
      
      ResponseUtil.success(res, result, 'Enrollments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

// Export singleton instance
export const enrollmentController = new EnrollmentController();
