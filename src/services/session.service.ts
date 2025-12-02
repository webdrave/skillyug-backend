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
      courseId: data.courseId,
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
   * Start a session
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
      // TODO: Enable when AWS SDK adds IVS Stages support
      // const token = await ivsStageService.createParticipantToken({
      //   stageArn: session.stageArn,
      //   userId,
      //   capabilities: ['PUBLISH', 'SUBSCRIBE'],
      //   durationMinutes: session.duration + 60,
      // });
      // credentials.participantToken = token.token;
      // credentials.stageArn = session.stageArn;
    }
    // Handle RTMPS sessions
    else if (sessionWithProfile.streamType === StreamType.RTMPS) {
      // Create IVS channel if not exists
      if (!sessionWithProfile.liveStreamId) {
        const mentorUser = sessionWithProfile.mentorProfile.user;
        
        const ivsChannel = await ivsService.createChannel({
          mentorId: userId,
          mentorName: mentorUser?.fullName || mentorUser?.email || 'Mentor',
        });

        // Create live stream record
        const liveStream = await liveStreamRepository.create({
          mentorProfileId: sessionWithProfile.mentorProfileId,
          courseId: sessionWithProfile.courseId || undefined,
          title: sessionWithProfile.title,
          description: sessionWithProfile.description || '',
          channelArn: ivsChannel.channelArn,
          channelName: ivsChannel.channelName,
          ingestEndpoint: ivsChannel.ingestEndpoint,
          playbackUrl: ivsChannel.playbackUrl,
          streamKeyArn: ivsChannel.streamKeyArn,
          scheduledAt: sessionWithProfile.scheduledAt,
        });

        // Link session to live stream
        await sessionRepository.update(sessionId, {
          liveStreamId: liveStream.id,
        });

        credentials.streamKey = ivsChannel.streamKey;
        credentials.ingestEndpoint = ivsChannel.ingestEndpoint;
        credentials.playbackUrl = ivsChannel.playbackUrl;
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
