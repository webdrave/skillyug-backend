import { Request, Response, NextFunction } from 'express';
import { streamingService } from '../services/streaming.service';
import { ResponseUtil } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

/**
 * Streaming Controller - Handles HTTP requests for live streaming
 */
export class StreamingController {
  /**
   * Create a new live stream
   * POST /streams
   * REMOVED: Mentors should use scheduled sessions instead
   */
  // async createStream(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  //   try {
  //     if (!req.user?.id) {
  //       return ResponseUtil.unauthorized(res, 'Authentication required');
  //     }
  //
  //     const { courseId, title, description, scheduledAt, latencyMode } = req.body;
  //
  //     const result = await streamingService.createStream({
  //       userId: req.user.id,
  //       courseId,
  //       title,
  //       description,
  //       scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
  //       latencyMode,
  //     });
  //
  //     ResponseUtil.created(res, result, result.message);
  //   } catch (error) {
  //     next(error);
  //   }
  // }

  /**
   * Get stream details for mentor
   * GET /streams/:streamId/manage
   */
  async getStreamForMentor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { streamId } = req.params;
      const result = await streamingService.getStreamForMentor(streamId, req.user.id);

      ResponseUtil.success(res, result, 'Stream details retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get stream details for viewer
   * GET /streams/:streamId
   */
  async getStreamForViewer(req: Request, res: Response, next: NextFunction) {
    try {
      const { streamId } = req.params;
      const result = await streamingService.getStreamForViewer(streamId);

      ResponseUtil.success(res, { stream: result }, 'Stream details retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Start a stream
   * POST /streams/:streamId/start
   */
  async startStream(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { streamId } = req.params;
      const result = await streamingService.startStream(streamId, req.user.id);

      ResponseUtil.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * End a stream
   * POST /streams/:streamId/end
   */
  async endStream(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { streamId } = req.params;
      const result = await streamingService.endStream(streamId, req.user.id);

      ResponseUtil.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update stream details
   * PATCH /streams/:streamId
   */
  async updateStream(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { streamId } = req.params;
      const { title, description, scheduledAt } = req.body;

      const result = await streamingService.updateStream(streamId, req.user.id, {
        title,
        description,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      });

      ResponseUtil.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a stream
   * DELETE /streams/:streamId
   */
  async deleteStream(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { streamId } = req.params;
      const result = await streamingService.deleteStream(streamId, req.user.id);

      ResponseUtil.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get mentor's streams
   * GET /mentor/streams
   */
  async getMentorStreams(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { status, page, limit } = req.query;

      const result = await streamingService.getMentorStreams(req.user.id, {
        status: status as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      ResponseUtil.success(res, result, 'Streams retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get active/live streams
   * GET /streams/active
   */
  async getActiveStreams(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit } = req.query;

      const result = await streamingService.getActiveStreams({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      ResponseUtil.success(res, result, 'Active streams retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Join a stream as a viewer
   * POST /streams/:streamId/join
   */
  async joinStream(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { streamId } = req.params;
      const result = await streamingService.joinStream(streamId, req.user.id);

      ResponseUtil.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Leave a stream
   * POST /streams/:streamId/leave
   */
  async leaveStream(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { streamId } = req.params;
      const result = await streamingService.leaveStream(streamId, req.user.id);

      ResponseUtil.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get stream viewers (mentor only)
   * GET /streams/:streamId/viewers
   */
  async getStreamViewers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        return ResponseUtil.unauthorized(res, 'Authentication required');
      }

      const { streamId } = req.params;
      const result = await streamingService.getStreamViewers(streamId, req.user.id);

      ResponseUtil.success(res, result, 'Viewers retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const streamingController = new StreamingController();
