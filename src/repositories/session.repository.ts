import { ScheduledSession, SessionStatus, StreamType, Prisma, EnrollmentStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { DatabaseError } from '../utils/errors';

/**
 * Session Repository - Database operations for scheduled sessions
 */
export class SessionRepository {
  /**
   * Create a scheduled session
   */
  async create(data: {
    title: string;
    description?: string;
    scheduledAt: Date;
    duration: number;
    mentorProfileId: string;
    courseId?: string;
    streamType: StreamType;
    useWebRTC: boolean;
    stageArn?: string;
    enableQuiz: boolean;
    enableAttendance: boolean;
    enableChat: boolean;
    enableRecording: boolean;
  }): Promise<ScheduledSession> {
    try {
      return await prisma.scheduledSession.create({
        data,
        include: {
          mentorProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
          course: {
            select: {
              id: true,
              courseName: true,
              imageUrl: true,
            },
          },
        },
      });
    } catch (error) {
      throw new DatabaseError('Failed to create session', error);
    }
  }

  /**
   * Find session by ID
   */
  async findById(id: string): Promise<ScheduledSession | null> {
    try {
      return await prisma.scheduledSession.findUnique({
        where: { id },
        include: {
          mentorProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
          course: {
            select: {
              id: true,
              courseName: true,
              imageUrl: true,
            },
          },
          quizzes: true,
          liveStream: true,
          ivsChannel: true, // Include IVS Channel for playback URL (new channel pool architecture)
        },
      });
    } catch (error) {
      throw new DatabaseError('Failed to find session', error);
    }
  }

  /**
   * Update session
   */
  async update(
    id: string,
    data: Partial<ScheduledSession>
  ): Promise<ScheduledSession> {
    try {
      return await prisma.scheduledSession.update({
        where: { id },
        data,
        include: {
          mentorProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
          course: true,
        },
      });
    } catch (error) {
      throw new DatabaseError('Failed to update session', error);
    }
  }

  /**
   * Delete session
   */
  async delete(id: string): Promise<void> {
    try {
      await prisma.scheduledSession.delete({
        where: { id },
      });
    } catch (error) {
      throw new DatabaseError('Failed to delete session', error);
    }
  }

  /**
   * Find sessions by mentor
   */
  async findByMentor(
    mentorProfileId: string,
    filters?: {
      status?: SessionStatus;
      page?: number;
      limit?: number;
    }
  ): Promise<{ sessions: ScheduledSession[]; total: number }> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 10;
      const skip = (page - 1) * limit;

      const where: Prisma.ScheduledSessionWhereInput = {
        mentorProfileId,
        ...(filters?.status && { status: filters.status }),
      };

      const [sessions, total] = await Promise.all([
        prisma.scheduledSession.findMany({
          where,
          include: {
            course: {
              select: {
                id: true,
                courseName: true,
                imageUrl: true,
              },
            },
            liveStream: true,
            _count: {
              select: {
                attendance: true,
                quizzes: true,
              },
            },
          },
          orderBy: { scheduledAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.scheduledSession.count({ where }),
      ]);

      return { sessions, total };
    } catch (error) {
      throw new DatabaseError('Failed to find mentor sessions', error);
    }
  }

  /**
   * Find upcoming sessions
   */
  async findUpcoming(filters?: {
    courseId?: string;
    limit?: number;
  }): Promise<ScheduledSession[]> {
    try {
      const now = new Date();
      
      return await prisma.scheduledSession.findMany({
        where: {
          OR: [
            { status: SessionStatus.LIVE },
            {
              status: SessionStatus.SCHEDULED,
              scheduledAt: {
                gte: now,
              },
            },
          ],
          ...(filters?.courseId && { courseId: filters.courseId }),
        },
        include: {
          mentorProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
          course: {
            select: {
              id: true,
              courseName: true,
              imageUrl: true,
            },
          },
          _count: {
            select: {
              attendance: true,
            },
          },
        },
        orderBy: { scheduledAt: 'asc' },
        take: filters?.limit || 20,
      });
    } catch (error) {
      throw new DatabaseError('Failed to find upcoming sessions', error);
    }
  }

  /**
   * Find live sessions
   */
  async findLive(): Promise<ScheduledSession[]> {
    try {
      return await prisma.scheduledSession.findMany({
        where: {
          status: SessionStatus.LIVE,
        },
        include: {
          mentorProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
          course: {
            select: {
              id: true,
              courseName: true,
              imageUrl: true,
            },
          },
          liveStream: true,
          _count: {
            select: {
              attendance: true,
            },
          },
        },
        orderBy: { startedAt: 'desc' },
      });
    } catch (error) {
      throw new DatabaseError('Failed to find live sessions', error);
    }
  }

  /**
   * Find sessions for courses that a student is enrolled in
   * Also includes general sessions (no courseId) from mentors whose courses the student is enrolled in
   */
  async findByEnrolledCourses(
    userId: string,
    filters?: {
      status?: SessionStatus;
      includeUpcoming?: boolean;
      limit?: number;
    }
  ): Promise<any[]> {
    try {
      const now = new Date();
      
      // First, get mentor profile IDs for mentors whose courses the student is enrolled in
      const enrolledCourses = await prisma.enrollment.findMany({
        where: {
          userId,
          status: EnrollmentStatus.ACTIVE,
        },
        select: {
          course: {
            select: {
              mentorId: true,
            },
          },
        },
      });

      // Get unique mentor IDs
      const enrolledMentorIds = [...new Set(enrolledCourses.map(e => e.course.mentorId).filter(Boolean))] as string[];

      // Get mentor profile IDs for those user IDs
      const mentorProfiles = await prisma.mentorProfile.findMany({
        where: {
          userId: { in: enrolledMentorIds },
        },
        select: { id: true },
      });
      const mentorProfileIds = mentorProfiles.map(mp => mp.id);
      
      // Build where clause
      const whereInput: Prisma.ScheduledSessionWhereInput = {
        AND: [
          {
            OR: [
              // Sessions for courses the student is enrolled in
              {
                courseId: { not: null },
                course: {
                  enrollments: {
                    some: {
                      userId,
                      status: EnrollmentStatus.ACTIVE,
                    },
                  },
                },
              },
              // General sessions (no course) from mentors whose courses the student is enrolled in
              {
                courseId: null,
                mentorProfileId: { in: mentorProfileIds },
              },
            ],
          }
        ]
      };

      // Add status/time filters
      if (filters?.status) {
        (whereInput.AND as any[]).push({ status: filters.status });
      } else if (filters?.includeUpcoming) {
        // Include LIVE sessions, SCHEDULED sessions, and recently COMPLETED sessions (last 24 hours)
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        (whereInput.AND as any[]).push({
          OR: [
            { status: SessionStatus.LIVE },
            { status: SessionStatus.SCHEDULED },
            {
              status: SessionStatus.ENDED,
              endedAt: { gte: oneDayAgo },
            },
          ],
        });
      }

      return await prisma.scheduledSession.findMany({
        where: whereInput,
        include: {
          mentorProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
          course: {
            select: {
              id: true,
              courseName: true,
              imageUrl: true,
              description: true,
            },
          },
          liveStream: {
            select: {
              id: true,
              playbackUrl: true,
              status: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              attendance: true,
            },
          },
        },
        orderBy: { scheduledAt: 'asc' },
        take: filters?.limit || 50,
      });
    } catch (error) {
      throw new DatabaseError('Failed to find sessions for enrolled courses', error);
    }
  }

  /**
   * Check if a user has access to a session (enrolled in the course or general session from enrolled mentor)
   */
  async hasUserAccess(sessionId: string, userId: string): Promise<boolean> {
    try {
      // First check direct access cases
      const directAccess = await prisma.scheduledSession.findFirst({
        where: {
          id: sessionId,
          OR: [
            // Student enrolled in the course
            {
              courseId: { not: null },
              course: {
                enrollments: {
                  some: {
                    userId,
                    status: EnrollmentStatus.ACTIVE,
                  },
                },
              },
            },
            // Mentor owns the session
            {
              mentorProfile: {
                userId,
              },
            },
          ],
        },
      });

      if (directAccess) return true;

      // Check if it's a general session from a mentor whose courses the student is enrolled in
      const session = await prisma.scheduledSession.findUnique({
        where: { id: sessionId },
        include: {
          mentorProfile: true,
        },
      });

      if (!session || session.courseId !== null) return false;

      // Check if user is enrolled in any of this mentor's courses
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId,
          status: EnrollmentStatus.ACTIVE,
          course: {
            mentorId: session.mentorProfile.userId,
          },
        },
      });

      return enrollment !== null;
    } catch (error) {
      throw new DatabaseError('Failed to check user access', error);
    }
  }
}

export const sessionRepository = new SessionRepository();
