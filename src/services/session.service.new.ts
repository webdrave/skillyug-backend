/* eslint-disable @typescript-eslint/no-explicit-any */
import { SessionStatus, StreamType, ScheduledSession } from '@prisma/client';
import { sessionRepository } from '../repositories/session.repository';
import { mentorRepository } from '../repositories/mentor.repository';
import { NotFoundError, BusinessLogicError, AuthorizationError } from '../utils/errors';
import { channelPoolService } from './channelPool.service';
import prisma from '../utils/prisma';

/**
 * Session Service - Enterprise Architecture
 * Mentors schedule sessions, system auto-assigns channels from pool
 */
export class SessionService {
  /**
   * MENTOR: Create a scheduled session (NO channel assignment yet)
   */
  async createSession(data: {
    userId: string;
    courseId?: string;
    title: string;
    description?: string;
    scheduledAt: Date;
    duration?: number;
    enableQuiz?: boolean;
    enableAttendance?: boolean;
    enableChat?: boolean;
    enableRecording?: boolean;
  }): Promise<{
    message: string;
    session: ScheduledSession;
  }> {
    // Get mentor profile
    const mentorProfile = await mentorRepository.getMentorProfileByUserId(data.userId);
    if (!mentorProfile) {
      throw new NotFoundError('Mentor profile not found');
    }

    // Validate course access if courseId provided
    if (data.courseId) {
      const course = await prisma.course.findUnique({
        where: { id: data.courseId },
      });

      if (!course) {
        throw new NotFoundError('Course not found');
      }

      if (course.mentorId !== data.userId) {
        throw new AuthorizationError('You can only schedule sessions for your own courses');
      }
    }

    // Create session (channel assigned later when session starts)
    const session = await sessionRepository.create({
      title: data.title,
      description: data.description,
      scheduledAt: data.scheduledAt,
      duration: data.duration || 60,
      mentorProfileId: mentorProfile.id,
      courseId: data.courseId,
      streamType: StreamType.RTMPS, // Default to RTMPS
      useWebRTC: false,
      enableQuiz: data.enableQuiz ?? false,
      enableAttendance: data.enableAttendance ?? true,
      enableChat: data.enableChat ?? true,
      enableRecording: data.enableRecording ?? false,
    });

    return {
      message: 'Session scheduled successfully. A channel will be auto-assigned when you start the class.',
      session,
    };
  }

  /**
   * MENTOR: Start a session - AUTO-ASSIGNS free channel from pool
   */
  async startSession(
    sessionId: string,
    userId: string
  ): Promise<{
    message: string;
    session: ScheduledSession;
    credentials: {
      streamKey: string;
      ingestEndpoint: string;
      playbackUrl: string;
      channelName: string;
    };
  }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Type assertion for session with mentorProfile
    const sessionWithProfile = session as typeof session & {
      mentorProfile: { userId: string };
    };

    // Authorization check
    if (sessionWithProfile.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can start it');
    }

    // Status checks
    if (sessionWithProfile.status === SessionStatus.LIVE) {
      throw new BusinessLogicError('Session is already live');
    }

    if (sessionWithProfile.status === SessionStatus.CANCELLED) {
      throw new BusinessLogicError('Cannot start a cancelled session');
    }

    if (sessionWithProfile.status === SessionStatus.ENDED) {
      throw new BusinessLogicError('Cannot restart an ended session');
    }

    // Check if already has a channel assigned
    if (sessionWithProfile.ivsChannelId) {
      const channel = await prisma.iVSChannel.findUnique({
        where: { id: sessionWithProfile.ivsChannelId },
      });

      if (!channel) {
        throw new BusinessLogicError('Assigned channel not found. Please contact admin.');
      }

      // Re-generate stream key for resumed session
      const { streamKey } = await channelPoolService.assignChannelToSession(
        channel.id,
        sessionId
      );

      // Update session status
      const updatedSession = await sessionRepository.update(sessionId, {
        status: SessionStatus.LIVE,
        startedAt: new Date(),
      });

      return {
        message: 'Session started successfully with existing channel',
        session: updatedSession,
        credentials: {
          streamKey,
          ingestEndpoint: channel.ingestEndpoint,
          playbackUrl: channel.playbackUrl,
          channelName: channel.channelName,
        },
      };
    }

    // === MAIN FLOW: Find and assign a free channel ===
    const freeChannel = await channelPoolService.findFreeChannel();

    if (!freeChannel) {
      throw new BusinessLogicError(
        'No free channels available. Please wait for another session to end or contact admin to add more channels.'
      );
    }

    // Assign channel to this session
    const credentials = await channelPoolService.assignChannelToSession(
      freeChannel.id,
      sessionId
    );

    // Update session with channel assignment and status
    const updatedSession = await sessionRepository.update(sessionId, {
      ivsChannelId: freeChannel.id,
      currentStreamKey: credentials.streamKey, // Store temporarily
      status: SessionStatus.LIVE,
      startedAt: new Date(),
    });

    return {
      message: 'Session started successfully! Channel auto-assigned from pool.',
      session: updatedSession,
      credentials: {
        streamKey: credentials.streamKey,
        ingestEndpoint: credentials.ingestEndpoint,
        playbackUrl: credentials.playbackUrl,
        channelName: freeChannel.channelId,
      },
    };
  }

  /**
   * MENTOR: End a session - RELEASES channel back to pool
   */
  async endSession(
    sessionId: string,
    userId: string
  ): Promise<{
    message: string;
    session: ScheduledSession;
  }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const sessionWithProfile = session as typeof session & {
      mentorProfile: { userId: string };
    };

    if (sessionWithProfile.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can end it');
    }

    if (sessionWithProfile.status !== SessionStatus.LIVE) {
      throw new BusinessLogicError('Session is not currently live');
    }

    // Release the channel back to pool
    if (sessionWithProfile.ivsChannelId) {
      try {
        await channelPoolService.releaseChannel(sessionWithProfile.ivsChannelId);
      } catch (error) {
        console.error('Error releasing channel:', error);
        // Continue even if release fails
      }
    }

    // Calculate duration
    const startedAt = sessionWithProfile.startedAt || new Date();
    const endedAt = new Date();
    const durationHours = (endedAt.getTime() - startedAt.getTime()) / (1000 * 60 * 60);

    // Update channel usage statistics
    if (sessionWithProfile.ivsChannelId) {
      await prisma.iVSChannel.update({
        where: { id: sessionWithProfile.ivsChannelId },
        data: {
          totalUsageHours: {
            increment: durationHours,
          },
        },
      });
    }

    // Update session
    const updatedSession = await sessionRepository.update(sessionId, {
      status: SessionStatus.ENDED,
      endedAt,
      currentStreamKey: null, // Clear stream key
    });

    return {
      message: 'Session ended successfully. Channel released back to pool.',
      session: updatedSession,
    };
  }

  /**
   * STUDENT: Get sessions for enrolled courses
   */
  async getStudentSessions(
    userId: string,
    filters?: {
      status?: SessionStatus;
      courseId?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    sessions: Array<ScheduledSession & {
      course?: { id: string; title: string };
      mentorProfile?: { user?: { fullName?: string } };
      playbackUrl?: string;
    }>;
    total: number;
  }> {
    // Get courses student is enrolled in
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: userId },
      select: { courseId: true },
    });

    const enrolledCourseIds = enrollments.map((e) => e.courseId);

    if (enrolledCourseIds.length === 0) {
      return { sessions: [], total: 0 };
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      courseId: { in: enrolledCourseIds },
    };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.courseId) {
      where.courseId = filters.courseId;
    }

    const [sessions, total] = await Promise.all([
      prisma.scheduledSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        include: {
          course: {
            select: { id: true, courseName: true },
          },
          mentorProfile: {
            include: {
              user: {
                select: { fullName: true },
              },
            },
          },
          ivsChannel: {
            select: { playbackUrl: true },
          },
        },
      }),
      prisma.scheduledSession.count({ where }),
    ]);

    // Format response with playbackUrl from channel
    const formattedSessions = sessions.map((session) => ({
      ...session,
      playbackUrl: session.ivsChannel?.playbackUrl || null,
    }));

    return {
      sessions: formattedSessions as any,
      total,
    };
  }

  /**
   * MENTOR: Get my scheduled sessions
   */
  async getMentorSessions(
    userId: string,
    filters?: {
      status?: SessionStatus;
      courseId?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    sessions: ScheduledSession[];
    total: number;
  }> {
    const mentorProfile = await mentorRepository.getMentorProfileByUserId(userId);
    if (!mentorProfile) {
      throw new NotFoundError('Mentor profile not found');
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    return sessionRepository.findByMentor(mentorProfile.id, {
      status: filters?.status,
      page,
      limit,
    });
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string): Promise<ScheduledSession | null> {
    return sessionRepository.findById(sessionId);
  }

  /**
   * MENTOR: Cancel a session
   */
  async cancelSession(
    sessionId: string,
    userId: string
  ): Promise<{
    message: string;
    session: ScheduledSession;
  }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const sessionWithProfile = session as typeof session & {
      mentorProfile: { userId: string };
    };

    if (sessionWithProfile.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can cancel it');
    }

    if (sessionWithProfile.status === SessionStatus.LIVE) {
      throw new BusinessLogicError('Cannot cancel a live session. End it first.');
    }

    if (sessionWithProfile.status === SessionStatus.ENDED) {
      throw new BusinessLogicError('Cannot cancel an already ended session');
    }

    // Release channel if assigned
    if (sessionWithProfile.ivsChannelId) {
      try {
        await channelPoolService.releaseChannel(sessionWithProfile.ivsChannelId);
      } catch (error) {
        console.error('Error releasing channel:', error);
      }
    }

    const updatedSession = await sessionRepository.update(sessionId, {
      status: SessionStatus.CANCELLED,
    });

    return {
      message: 'Session cancelled successfully',
      session: updatedSession,
    };
  }
}

// Export singleton
export const sessionService = new SessionService();
