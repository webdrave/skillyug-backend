import { Request, Response, NextFunction } from 'express';
import { studentService } from '../services/student.service';
import { ResponseUtil } from '../utils/response';

/**
 * Student Controller - Handle student session-related requests
 */
export class StudentController {
  /**
   * Get all sessions for courses the student is enrolled in
   * GET /api/student/sessions
   */
  async getMySessions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return ResponseUtil.error(res, 'User not authenticated', 401);
      }

      const sessions = await studentService.getEnrolledSessions(userId);
      
      return ResponseUtil.success(res, {
        sessions,
        count: sessions.length,
      }, 'Sessions retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Join a live session (get playback URL)
   * GET /api/student/session/:id/join
   */
  async joinSession(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const { id: sessionId } = req.params;

      if (!userId) {
        return ResponseUtil.error(res, 'User not authenticated', 401);
      }

      const result = await studentService.joinSession(sessionId, userId);
      
      if (!result.canJoin) {
        return ResponseUtil.success(res, result, result.message || 'Cannot join session at this time');
      }

      return ResponseUtil.success(res, result, 'Session ready to join');
    } catch (error) {
      next(error);
    }
  }
}

export const studentController = new StudentController();
