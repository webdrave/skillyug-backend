import { SessionStatus } from '@prisma/client';
import { sessionRepository } from '../repositories/session.repository';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';

// Type for session with relations
interface SessionWithRelations {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  scheduledAt: Date;
  duration: number;
  status: SessionStatus;
  enableQuiz: boolean;
  enableChat: boolean;
  enableAttendance: boolean;
  course?: {
    id: string;
    courseName: string;
    imageUrl: string | null;
    description?: string | null;
  } | null;
  mentorProfile?: {
    user?: {
      id: string;
      fullName: string | null;
      email: string | null;
      image: string | null;
    } | null;
  } | null;
  liveStream?: {
    id: string;
    playbackUrl: string | null;
    status: string | null;
    isActive: boolean;
  } | null;
  _count?: {
    attendance: number;
  };
}

/**
 * Student Service - Business logic for student session operations
 */
export class StudentService {
  /**
   * Get all sessions for courses the student is enrolled in
   */
  async getEnrolledSessions(userId: string): Promise<any[]> {
    const sessions: SessionWithRelations[] = await sessionRepository.findByEnrolledCourses(userId, {
      includeUpcoming: true,
      limit: 50,
    });

    // Format response to match frontend expectations
    return sessions.map((session: SessionWithRelations) => ({
      id: session.id,
      title: session.title,
      description: session.description,
      courseId: session.courseId,
      courseName: session.course?.courseName || 'General Session',
      courseImage: session.course?.imageUrl,
      scheduledAt: session.scheduledAt,
      duration: session.duration,
      status: session.status,
      mentorName: session.mentorProfile?.user?.fullName,
      mentorImage: session.mentorProfile?.user?.image,
      // Only include playback URL if session is LIVE and stream is active
      playbackUrl: 
        session.status === SessionStatus.LIVE && 
        session.liveStream?.isActive && 
        session.liveStream?.playbackUrl
          ? session.liveStream.playbackUrl
          : null,
      attendanceCount: session._count?.attendance || 0,
      enableQuiz: session.enableQuiz,
      enableChat: session.enableChat,
      enableAttendance: session.enableAttendance,
    }));
  }

  /**
   * Get session details and playback URL for joining a live session
   */
  async joinSession(sessionId: string, userId: string): Promise<{
    session: any;
    playbackUrl: string;
    canJoin: boolean;
    message?: string;
  }> {
    // Check if user has access to this session
    const hasAccess = await sessionRepository.hasUserAccess(sessionId, userId);
    
    if (!hasAccess) {
      throw new ForbiddenError('You are not enrolled in this course');
    }

    // Get the session with full details
    const session = await sessionRepository.findById(sessionId) as SessionWithRelations | null;
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Check if session is live
    if (session.status !== SessionStatus.LIVE) {
      return {
        session: {
          id: session.id,
          title: session.title,
          status: session.status,
          scheduledAt: session.scheduledAt,
        },
        playbackUrl: '',
        canJoin: false,
        message: session.status === SessionStatus.SCHEDULED 
          ? 'Session has not started yet. Please wait until the scheduled time.'
          : 'This session has ended.',
      };
    }

    // Check if live stream exists and is active
    if (!session.liveStream || !session.liveStream.isActive) {
      throw new BadRequestError('Live stream is not available. The mentor may not have started streaming yet.');
    }

    if (!session.liveStream.playbackUrl) {
      throw new BadRequestError('Stream playback URL is not available');
    }

    // Return session details with playback URL
    return {
      session: {
        id: session.id,
        title: session.title,
        description: session.description,
        courseId: session.courseId,
        courseName: session.course?.courseName || 'General Session',
        courseImage: session.course?.imageUrl,
        scheduledAt: session.scheduledAt,
        duration: session.duration,
        status: session.status,
        mentorName: session.mentorProfile?.user?.fullName,
        mentorImage: session.mentorProfile?.user?.image,
        enableQuiz: session.enableQuiz,
        enableChat: session.enableChat,
        enableAttendance: session.enableAttendance,
      },
      playbackUrl: session.liveStream.playbackUrl,
      canJoin: true,
    };
  }
}

export const studentService = new StudentService();
