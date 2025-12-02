/**
 * Unified Streaming Controller
 * Handles all streaming-related HTTP requests
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { streamingService } from '../services/streaming.service.unified';

export class StreamingController {
  
  // ============================================
  // ADMIN: Channel Pool Management
  // ============================================

  static async createChannel(req: AuthenticatedRequest, res: Response) {
    if (req.user?.userType !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    try {
      const { name, type } = req.body;
      const channel = await streamingService.createChannel({ name, type });
      res.json({ success: true, data: channel });
    } catch (error: any) {
      console.error('Create channel error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async listChannels(req: AuthenticatedRequest, res: Response) {
    if (req.user?.userType !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    try {
      const result = await streamingService.listChannels();
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('List channels error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getChannelStats(req: AuthenticatedRequest, res: Response) {
    if (req.user?.userType !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    try {
      const stats = await streamingService.getChannelStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ============================================
  // MENTOR: Session Management
  // ============================================

  static async getSessionCredentials(req: AuthenticatedRequest, res: Response) {
    if (req.user?.userType !== 'MENTOR' && req.user?.userType !== 'ADMIN') {
      return res.status(403).json({ error: 'Mentor access required' });
    }

    try {
      const { sessionId } = req.params;
      const credentials = await streamingService.getSessionCredentials(
        sessionId,
        req.user!.id
      );
      res.json(credentials);
    } catch (error: any) {
      console.error('Get credentials error:', error);
      const status = error.name === 'NotFoundError' ? 404 : 
                     error.name === 'AuthorizationError' ? 403 : 500;
      res.status(status).json({ error: error.message });
    }
  }

  static async releaseSessionCredentials(req: AuthenticatedRequest, res: Response) {
    if (req.user?.userType !== 'MENTOR' && req.user?.userType !== 'ADMIN') {
      return res.status(403).json({ error: 'Mentor access required' });
    }

    try {
      const { sessionId } = req.params;
      const result = await streamingService.releaseSessionCredentials(
        sessionId,
        req.user!.id
      );
      res.json(result);
    } catch (error: any) {
      console.error('Release credentials error:', error);
      const status = error.name === 'NotFoundError' ? 404 : 
                     error.name === 'AuthorizationError' ? 403 : 500;
      res.status(status).json({ error: error.message });
    }
  }

  static async startSession(req: AuthenticatedRequest, res: Response) {
    if (req.user?.userType !== 'MENTOR' && req.user?.userType !== 'ADMIN') {
      return res.status(403).json({ error: 'Mentor access required' });
    }

    try {
      const { sessionId } = req.params;
      const result = await streamingService.startSession(sessionId, req.user!.id);
      res.json(result);
    } catch (error: any) {
      console.error('Start session error:', error);
      const status = error.name === 'NotFoundError' ? 404 : 
                     error.name === 'AuthorizationError' ? 403 :
                     error.name === 'BusinessLogicError' ? 400 : 500;
      res.status(status).json({ error: error.message });
    }
  }

  static async stopSession(req: AuthenticatedRequest, res: Response) {
    if (req.user?.userType !== 'MENTOR' && req.user?.userType !== 'ADMIN') {
      return res.status(403).json({ error: 'Mentor access required' });
    }

    try {
      const { sessionId } = req.params;
      const result = await streamingService.endSession(sessionId, req.user!.id);
      res.json(result);
    } catch (error: any) {
      console.error('Stop session error:', error);
      const status = error.name === 'NotFoundError' ? 404 : 
                     error.name === 'AuthorizationError' ? 403 : 500;
      res.status(status).json({ error: error.message });
    }
  }

  // ============================================
  // STUDENT: View Sessions
  // ============================================

  static async getLiveClasses(req: AuthenticatedRequest, res: Response) {
    try {
      const classes = await streamingService.getLiveSessions();
      res.json({
        success: true,
        count: classes.length,
        classes,
      });
    } catch (error: any) {
      console.error('Get live classes error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getActiveCourseSession(req: AuthenticatedRequest, res: Response) {
    try {
      const { courseId } = req.params;
      const result = await streamingService.getActiveCourseSession(courseId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Get active course session error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async joinSession(req: AuthenticatedRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      const result = await streamingService.joinSession(sessionId, req.user!.id);
      res.json(result);
    } catch (error: any) {
      console.error('Join session error:', error);
      const status = error.name === 'NotFoundError' ? 404 : 
                     error.name === 'AuthorizationError' ? 403 :
                     error.name === 'BusinessLogicError' ? 400 : 500;
      res.status(status).json({ error: error.message });
    }
  }

  static async getStreamStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      const status = await streamingService.getStreamStatus(sessionId);
      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error('Get stream status error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}
