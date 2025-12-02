/* eslint-disable @typescript-eslint/no-explicit-any */
import { SessionStatus, StreamType, ScheduledSession } from '@prisma/client';
import { sessionRepository } from '../repositories/session.repository';
import { mentorRepository } from '../repositories/mentor.repository';
import { liveStreamRepository } from '../repositories/liveStream.repository';
import { NotFoundError, BusinessLogicError, AuthorizationError } from '../utils/errors';
import { ivsService } from './ivs.service';

/**
 * Session Service - Business logic for scheduled sessions
 */
export class SessionService {
  /**
   * Create a scheduled session
   */
  async createSession(data: {
    userId: string;
    title: string;
    description?: string;
    scheduledAt: Date;
    duration?: number; // Duration in minutes
    courseId?: string;
    streamType: StreamType;
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

    // WebRTC not supported yet - throw error if attempted
    let stageArn: string | undefined;
    if (data.streamType === StreamType.WEBRTC) {
      throw new BusinessLogicError(
        'WebRTC streaming not yet supported. Please use RTMPS streaming with OBS Studio.'
      );
    }

    // Create session
    const session = await sessionRepository.create({
      title: data.title,
      description: data.description,
      scheduledAt: data.scheduledAt,
      duration: data.duration || 60,
      mentorProfileId: mentorProfile.id,
      courseId: data.courseId && data.courseId.trim() !== '' ? data.courseId : undefined,
      streamType: data.streamType,
      useWebRTC: data.streamType === (StreamType.WEBRTC as any), // Type assertion since enum comparison
      stageArn,
      enableQuiz: data.enableQuiz ?? false,
      enableAttendance: data.enableAttendance ?? true,
      enableChat: data.enableChat ?? true,
      enableRecording: data.enableRecording ?? false,
    });

    return {
      message: 'Session scheduled successfully',
      session,
    };
  }

  /**
   * Get streaming credentials for a scheduled session
   * Called by mentor to get OBS credentials before going live
   */
  async getSessionCredentials(
    sessionId: string,
    userId: string
  ): Promise<{
    streamKey: string;
    ingestEndpoint: string;
    streamUrl: string;
    playbackUrl: string;
    channelArn: string;
  }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const sessionWithProfile = session as typeof session & {
      mentorProfile: { userId: string; user?: { fullName?: string; email: string } };
    };

    if (sessionWithProfile.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can access credentials');
    }

    // Import mentor channel service
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { mentorChannelService } = require('./mentorChannel.service');
    
    // Get or create mentor's permanent channel
    const mentorUser = sessionWithProfile.mentorProfile.user;
    const credentials = await mentorChannelService.getOrCreateMentorChannel(
      userId,
      mentorUser?.fullName || mentorUser?.email || 'Mentor'
    );

    return {
      streamKey: credentials.streamKey,
      ingestEndpoint: credentials.ingestEndpoint,
      streamUrl: `rtmps://${credentials.ingestEndpoint}:443/app/`,
      playbackUrl: credentials.playbackUrl,
      channelArn: credentials.channelArn,
    };
  }

  /**
   * Start a session
   * Verifies mentor's stream is live and marks session as active
   */
  async startSession(
    sessionId: string,
    userId: string
  ): Promise<{
    message: string;
    session: ScheduledSession;
    credentials?: {
      participantToken?: string; // For WebRTC
      streamKey?: string; // For RTMPS
      ingestEndpoint?: string;
      playbackUrl?: string;
    };
  }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Type assertion for session with mentorProfile
    const sessionWithProfile = session as typeof session & {
      mentorProfile: { userId: string; user?: { fullName?: string; email: string } };
    };

    if (sessionWithProfile.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can start it');
    }

    if (sessionWithProfile.status === SessionStatus.LIVE) {
      throw new BusinessLogicError('Session is already live');
    }

    if (sessionWithProfile.status === SessionStatus.CANCELLED) {
      throw new BusinessLogicError('Cannot start a cancelled session');
    }

    let credentials: any = {};

    // Handle WebRTC sessions (disabled - AWS SDK doesn't support it yet)
    if (session.streamType === StreamType.WEBRTC && session.stageArn) {
      throw new BusinessLogicError(
        'WebRTC streaming not supported. Use RTMPS with OBS Studio instead.'
      );
    }
    // Handle RTMPS sessions with Mentor Channel System
    else if (sessionWithProfile.streamType === StreamType.RTMPS) {
      // Import mentor channel service
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { mentorChannelService } = require('./mentorChannel.service');
      
      // Verify stream is live before starting session
      const streamStatus = await mentorChannelService.checkStreamStatus(userId);
      
      if (!streamStatus.isLive) {
        throw new BusinessLogicError(
          'Your stream is not live. Please start OBS and begin streaming before starting the session.'
        );
      }

      // Get mentor's channel credentials
      const mentorUser = sessionWithProfile.mentorProfile.user;
      const channelCredentials = await mentorChannelService.getOrCreateMentorChannel(
        userId,
        mentorUser?.fullName || mentorUser?.email || 'Mentor'
      );

      credentials.streamKey = channelCredentials.streamKey;
      credentials.ingestEndpoint = channelCredentials.ingestEndpoint;
      credentials.playbackUrl = channelCredentials.playbackUrl;

      // Create class session record if courseId exists
      if (sessionWithProfile.courseId) {
        await mentorChannelService.startClassSession(
          sessionWithProfile.courseId,
          userId,
          sessionWithProfile.title
        );
      }
    }

    // Update session status
    const updatedSession = await sessionRepository.update(sessionId, {
      status: SessionStatus.LIVE,
      startedAt: new Date(),
    });

    return {
      message: 'Session started successfully',
      session: updatedSession,
      credentials,
    };
  }

  /**
   * End a session
   */
  async endSession(sessionId: string, userId: string): Promise<{
    message: string;
    session: ScheduledSession;
  }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Type assertion for session with mentorProfile
    const sessionWithProfile = session as typeof session & {
      mentorProfile: { userId: string };
    };

    if (sessionWithProfile.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can end it');
    }

    // Delete WebRTC stage if exists (disabled - AWS SDK doesn't support it)
    if (session.stageArn) {
      // TODO: Enable when AWS SDK adds IVS Stages support
      // try {
      //   await ivsStageService.deleteStage(session.stageArn);
      // } catch (error) {
      //   console.error('Error deleting stage:', error);
      // }
      console.log('WebRTC stage cleanup skipped - not supported yet');
    }

    // Update session
    const updatedSession = await sessionRepository.update(sessionId, {
      status: SessionStatus.ENDED,
      endedAt: new Date(),
    });

    return {
      message: 'Session ended successfully',
      session: updatedSession,
    };
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<ScheduledSession> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    return session;
  }

  /**
   * Get mentor sessions
   */
  async getMentorSessions(
    userId: string,
    filters?: {
      status?: SessionStatus;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    sessions: ScheduledSession[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const mentorProfile = await mentorRepository.getMentorProfileByUserId(userId);
    if (!mentorProfile) {
      throw new NotFoundError('Mentor profile not found');
    }

    const { sessions, total } = await sessionRepository.findByMentor(
      mentorProfile.id,
      filters
    );

    const page = filters?.page || 1;
    const limit = filters?.limit || 10;

    return {
      sessions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get upcoming sessions
   */
  async getUpcomingSessions(filters?: {
    courseId?: string;
    limit?: number;
  }): Promise<{
    sessions: ScheduledSession[];
    total: number;
  }> {
    const sessions = await sessionRepository.findUpcoming(filters);
    return {
      sessions,
      total: sessions.length,
    };
  }

  /**
   * Get live sessions
   */
  async getLiveSessions(): Promise<{
    sessions: ScheduledSession[];
    total: number;
  }> {
    const sessions = await sessionRepository.findLive();
    return {
      sessions,
      total: sessions.length,
    };
  }

  /**
   * Update session
   */
  async updateSession(
    sessionId: string,
    userId: string,
    data: Partial<{
      title: string;
      description: string;
      scheduledAt: Date;
      duration: number;
      enableQuiz: boolean;
      enableAttendance: boolean;
      enableChat: boolean;
      enableRecording: boolean;
    }>
  ): Promise<{
    message: string;
    session: ScheduledSession;
  }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Type assertion for session with mentorProfile
    const sessionWithProfile = session as typeof session & {
      mentorProfile: { userId: string };
    };

    if (sessionWithProfile.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can update it');
    }

    if (session.status === SessionStatus.LIVE) {
      throw new BusinessLogicError('Cannot update a live session');
    }

    const updatedSession = await sessionRepository.update(sessionId, data);

    return {
      message: 'Session updated successfully',
      session: updatedSession,
    };
  }

  /**
   * Cancel session
   */
  async cancelSession(sessionId: string, userId: string): Promise<{
    message: string;
  }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Type assertion for session with mentorProfile
    const sessionWithProfile = session as typeof session & {
      mentorProfile: { userId: string };
    };

    if (sessionWithProfile.mentorProfile.userId !== userId) {
      throw new AuthorizationError('Only the session owner can cancel it');
    }

    // Delete stage if exists (disabled - AWS SDK doesn't support it)
    if (session.stageArn) {
      // TODO: Enable when AWS SDK adds IVS Stages support
      // try {
      //   await ivsStageService.deleteStage(session.stageArn);
      // } catch (error) {
      //   console.error('Error deleting stage:', error);
      // }
      console.log('WebRTC stage cleanup skipped - not supported yet');
    }

    await sessionRepository.update(sessionId, {
      status: SessionStatus.CANCELLED,
    });

    return {
      message: 'Session cancelled successfully',
    };
  }

  /**
   * Get sessions for enrolled courses (student view)
   */
  async getEnrolledCourseSessions(
    userId: string,
    filters?: {
      status?: SessionStatus;
      includeUpcoming?: boolean;
      limit?: number;
    }
  ): Promise<{
    sessions: ScheduledSession[];
    total: number;
  }> {
    const sessions = await sessionRepository.findByEnrolledCourses(userId, filters);
    return {
      sessions,
      total: sessions.length,
    };
  }

  /**
   * Get session details for viewing (checks access)
   */
  async getSessionForViewing(
    sessionId: string,
    userId?: string
  ): Promise<ScheduledSession> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // If user is logged in, check if they have access
    if (userId) {
      const hasAccess = await sessionRepository.hasUserAccess(sessionId, userId);
      if (!hasAccess) {
        throw new AuthorizationError('You do not have access to this session');
      }
    }

    return session;
  }
}

export const sessionService = new SessionService();
