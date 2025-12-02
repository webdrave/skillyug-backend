/**
 * Mentor Channel Controller
 * 
 * HTTP endpoint handlers for the mentor channel streaming system.
 * Implements the ONE-CHANNEL-PER-MENTOR architecture for cost optimization.
 * 
 * API Endpoints:
 * - POST /api/streaming/get-mentor-channel - Get or create mentor's permanent channel
 * - POST /api/streaming/start-class - Start a live class session
 * - POST /api/streaming/end-class - End a live class session
 * - GET /api/streaming/active-class/:classId - Check if class is live
 * - GET /api/streaming/live-classes - Get all live classes
 * - GET /api/streaming/stream-status/:mentorId - Check stream health
 * - POST /api/streaming/regenerate-key - Regenerate stream key
 */

import { Request as _Request, Response, NextFunction } from 'express';
import { mentorChannelService } from '../services/mentorChannel.service';
import { ResponseUtil } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ValidationError, AuthorizationError } from '../utils/errors';

/**
 * Mentor Channel Controller Class
 */
export class MentorChannelController {
  
  /**
   * POST /api/streaming/get-mentor-channel
   * 
   * Get or create a mentor's permanent IVS channel.
   * Returns streaming credentials for OBS setup.
   * 
   * Request Body:
   * - mentorId: string (required)
   * - mentorName: string (required)
   * 
   * Response:
   * - channelArn: AWS IVS channel ARN
   * - streamKey: Secret key for OBS
   * - ingestEndpoint: RTMPS server URL (rtmps://xxx.ivs.amazonaws.com:443/app/)
   * - playbackUrl: HLS playback URL for students
   */
  async getMentorChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { mentorId, mentorName } = req.body;

      // Validation
      if (!mentorId) {
        throw new ValidationError('mentorId is required');
      }

      // Authorization: Only allow mentor to access their own channel or admin
      if (req.user?.id !== mentorId && req.user?.userType !== 'ADMIN') {
        throw new AuthorizationError('You can only access your own streaming credentials');
      }

      const credentials = await mentorChannelService.getOrCreateMentorChannel(
        mentorId,
        mentorName || req.user?.fullName || 'Mentor'
      );

      ResponseUtil.success(res, {
        channelArn: credentials.channelArn,
        streamKey: credentials.streamKey,
        streamUrl: `rtmps://${credentials.ingestEndpoint}:443/app/`,
        ingestEndpoint: credentials.ingestEndpoint,
        playbackUrl: credentials.playbackUrl,
      }, 'Mentor channel credentials retrieved successfully');

    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/streaming/start-class
   * 
   * Start a live class session. Verifies stream is live on AWS first.
   * 
   * Request Body:
   * - classId: string (required) - The course/class ID
   * - mentorId: string (required) - The mentor's user ID
   * - className: string (optional) - Display name for the class
   * 
   * Response:
   * - sessionId: Created session ID
   * - playbackUrl: URL for students to watch
   */
  async startClass(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { classId, mentorId, className } = req.body;

      // Validation
      if (!classId) {
        throw new ValidationError('classId is required');
      }
      if (!mentorId) {
        throw new ValidationError('mentorId is required');
      }

      // Authorization
      if (req.user?.id !== mentorId && req.user?.userType !== 'ADMIN') {
        throw new AuthorizationError('You can only start classes as yourself');
      }

      const session = await mentorChannelService.startClassSession(
        classId,
        mentorId,
        className || 'Live Class'
      );

      ResponseUtil.success(res, {
        sessionId: session.sessionId,
        playbackUrl: session.playbackUrl,
        startedAt: session.startedAt,
        viewerCount: session.viewerCount,
        streamHealth: session.streamHealth,
      }, 'Class session started successfully');

    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/streaming/end-class
   * 
   * End a live class session.
   * 
   * Request Body:
   * - sessionId: string (required) - The session to end
   * - classId: string (optional) - For validation
   */
  async endClass(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { sessionId, classId: _classId } = req.body;

      if (!sessionId) {
        throw new ValidationError('sessionId is required');
      }

      const result = await mentorChannelService.endClassSession(
        sessionId,
        req.user?.id as string
      );

      ResponseUtil.success(res, result, 'Class session ended successfully');

    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/streaming/active-class/:classId
   * 
   * Check if a class is currently live and get playback info.
   * Used by students to join a live session.
   * 
   * Response:
   * - isLive: boolean
   * - sessionId: string (if live)
   * - playbackUrl: string (if live)
   * - classTitle: string
   * - mentorName: string
   * - startedAt: Date
   * - viewerCount: number
   */
  async getActiveClass(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { classId } = req.params;

      if (!classId) {
        throw new ValidationError('classId is required');
      }

      const result = await mentorChannelService.getActiveClassSession(classId);

      ResponseUtil.success(res, result, result.isLive ? 'Class is live' : 'Class is not live');

    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/streaming/live-classes
   * 
   * Get all currently live classes across the platform.
   * Used for the student dashboard.
   */
  async getLiveClasses(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const liveClasses = await mentorChannelService.getAllLiveClasses();

      ResponseUtil.success(res, {
        count: liveClasses.length,
        classes: liveClasses,
      }, 'Live classes retrieved successfully');

    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/streaming/stream-status/:mentorId
   * 
   * Check the status/health of a mentor's stream.
   * Used to poll for stream status updates.
   */
  async getStreamStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { mentorId } = req.params;

      if (!mentorId) {
        throw new ValidationError('mentorId is required');
      }

      const status = await mentorChannelService.checkStreamStatus(mentorId);

      ResponseUtil.success(res, status, status.isLive ? 'Stream is live' : 'Stream is offline');

    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/streaming/regenerate-key
   * 
   * Regenerate the stream key for a mentor's channel.
   * Use if the key is compromised.
   */
  async regenerateStreamKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { mentorId } = req.body;

      if (!mentorId) {
        throw new ValidationError('mentorId is required');
      }

      // Authorization
      if (req.user?.id !== mentorId && req.user?.userType !== 'ADMIN') {
        throw new AuthorizationError('You can only regenerate your own stream key');
      }

      const result = await mentorChannelService.regenerateStreamKey(mentorId);

      ResponseUtil.success(res, result, 'Stream key regenerated successfully');

    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/streaming/mentor-channel/:mentorId
   * 
   * Delete a mentor's channel (admin only).
   */
  async deleteMentorChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { mentorId } = req.params;

      // Admin only
      if (req.user?.userType !== 'ADMIN') {
        throw new AuthorizationError('Only admins can delete mentor channels');
      }

      await mentorChannelService.deleteMentorChannel(mentorId);

      ResponseUtil.success(res, { success: true }, 'Mentor channel deleted successfully');

    } catch (error) {
      next(error);
    }
  }
}

// Export singleton instance
export const mentorChannelController = new MentorChannelController();
