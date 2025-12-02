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
          scheduledAt: {
            gte: now,
          },
          status: {
            in: [SessionStatus.SCHEDULED, SessionStatus.LIVE],
          },
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
   */
  async findByEnrolledCourses(
    userId: string,
    filters?: {
      status?: SessionStatus;
      includeUpcoming?: boolean;
      limit?: number;
    }
  ): Promise<ScheduledSession[]> {
    try {
      const now = new Date();
      
      // Build status filter
      let statusFilter: any = {};
      if (filters?.status) {
        statusFilter = { status: filters.status };
      } else if (filters?.includeUpcoming) {
        statusFilter = {
          status: {
            in: [SessionStatus.SCHEDULED, SessionStatus.LIVE],
          },
          scheduledAt: {
            gte: now,
          },
        };
      }

      return await prisma.scheduledSession.findMany({
        where: {
          ...statusFilter,
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
            // General sessions (no course assigned) - not included for now
            // Uncomment if you want students to see all general sessions
            // { courseId: null }
          ],
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
   * Check if a user has access to a session (enrolled in the course)
   */
  async hasUserAccess(sessionId: string, userId: string): Promise<boolean> {
    try {
      const session = await prisma.scheduledSession.findFirst({
        where: {
          id: sessionId,
          OR: [
            // Student enrolled in the course
            {
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

      return session !== null;
    } catch (error) {
      throw new DatabaseError('Failed to check user access', error);
    }
  }
}

export const sessionRepository = new SessionRepository();
