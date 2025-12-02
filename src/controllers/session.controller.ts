import { Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/session.service';
import { StreamType, SessionStatus } from '@prisma/client';
import { getSocketServer } from '../socket/streaming.socket';

/**
 * Session Controller
 * Handles HTTP requests for session management
 */

/**
 * Create a new scheduled session
 */
export async function createSession(req: Request, res: Response, next: NextFunction) {
  try {
    const mentorId = req.user?.id;
    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      title,
      description,
      courseId,
      // Support both field naming conventions
      scheduledStartTime,
      scheduledAt,
      estimatedDuration,
      duration,
      streamType,
      isRecorded,
      enableRecording,
      enableQuiz,
      enableAttendance,
      enableChat,
    } = req.body;

    // Use scheduledAt if provided, otherwise fall back to scheduledStartTime
    const scheduledTime = scheduledAt || scheduledStartTime;
    const sessionDuration = duration || estimatedDuration || 60;
    const recording = enableRecording ?? isRecorded ?? false;

    const session = await sessionService.createSession({
      userId: mentorId!,
      title,
      description,
      courseId: courseId && courseId !== 'none' && courseId.trim() !== '' ? courseId : undefined,
      scheduledAt: new Date(scheduledTime),
      duration: sessionDuration,
      streamType: streamType as StreamType,
      enableRecording: recording,
      enableQuiz: enableQuiz ?? false,
      enableAttendance: enableAttendance ?? true,
      enableChat: enableChat ?? true,
    });

    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get session by ID
 */
export async function getSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    const session = await sessionService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get mentor's sessions
 */
export async function getMentorSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const mentorId = req.user?.id;
    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status } = req.query;

    const sessions = await sessionService.getMentorSessions(mentorId, {
      status: status as SessionStatus,
    });

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get upcoming sessions
 */
export async function getUpcomingSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const { courseId, limit } = req.query;

    const sessions = await sessionService.getUpcomingSessions({
      courseId: courseId as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get live sessions
 */
export async function getLiveSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await sessionService.getLiveSessions();

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get streaming credentials for a session
 * Mentor calls this to get OBS credentials before going live
 */
export async function getSessionCredentials(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const mentorId = req.user?.id;

    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const credentials = await sessionService.getSessionCredentials(sessionId, mentorId);

    res.json({
      success: true,
      data: credentials,
      message: 'Use these credentials in OBS to start streaming',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Start a session
 */
export async function startSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const mentorId = req.user?.id;

    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await sessionService.startSession(sessionId, mentorId);

    // Notify via socket
    try {
      const socketServer = getSocketServer();
      socketServer.notifySessionStarted(sessionId);
    } catch (socketError) {
      console.error('Socket notification failed:', socketError);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * End a session
 */
export async function endSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const mentorId = req.user?.id;

    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await sessionService.endSession(sessionId, mentorId);

    // Notify via socket
    try {
      const socketServer = getSocketServer();
      socketServer.notifySessionEnded(sessionId);
    } catch (socketError) {
      console.error('Socket notification failed:', socketError);
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a session
 */
export async function updateSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const mentorId = req.user?.id;

    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updateData = { ...req.body };
    if (updateData.scheduledStartTime) {
      updateData.scheduledStartTime = new Date(updateData.scheduledStartTime);
    }

    const session = await sessionService.updateSession(sessionId, mentorId, updateData);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel a session
 */
export async function cancelSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const mentorId = req.user?.id;

    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await sessionService.cancelSession(sessionId, mentorId);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get enrolled course sessions (for students)
 */
export async function getEnrolledCourseSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status, includeUpcoming, limit } = req.query;

    const result = await sessionService.getEnrolledCourseSessions(userId, {
      status: status as any,
      includeUpcoming: includeUpcoming === 'true',
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      success: true,
      data: result.sessions,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get session for viewing (with access check)
 */
export async function getSessionForViewing(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    const session = await sessionService.getSessionForViewing(sessionId, userId);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}
