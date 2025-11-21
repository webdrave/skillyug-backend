import { Prisma, MentorInvitation, MentorProfile, MentorInvitationStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { DatabaseError, NotFoundError } from '../utils/errors';

/**
 * Mentor Repository - Handles all database operations for mentor invitations and profiles
 */
export class MentorRepository {
  /**
   * Create a new mentor invitation
   */
  async createInvitation(data: {
    email: string;
    token: string;
    invitedById: string;
    expiresAt: Date;
  }): Promise<MentorInvitation> {
    try {
      return await prisma.mentorInvitation.create({
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new DatabaseError('An active invitation already exists for this email');
        }
      }
      throw new DatabaseError('Failed to create mentor invitation', error);
    }
  }

  /**
   * Find invitation by token (without relations for faster lookup)
   */
  async findInvitationByToken(token: string): Promise<MentorInvitation | null> {
    try {
      return await prisma.mentorInvitation.findUnique({
        where: { token },
      });
    } catch (error) {
      throw new DatabaseError('Failed to find invitation by token', error);
    }
  }

  /**
   * Find invitation by token with admin details
   */
  async findInvitationByTokenWithAdmin(token: string) {
    try {
      return await prisma.mentorInvitation.findUnique({
        where: { token },
        include: {
          invitedBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      throw new DatabaseError('Failed to find invitation by token', error);
    }
  }

  /**
   * Find pending invitation by email
   */
  async findPendingInvitationByEmail(email: string): Promise<MentorInvitation | null> {
    try {
      return await prisma.mentorInvitation.findFirst({
        where: {
          email,
          status: MentorInvitationStatus.PENDING,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (error) {
      throw new DatabaseError('Failed to find pending invitation', error);
    }
  }

  /**
   * Update invitation status
   */
  async updateInvitationStatus(
    token: string,
    status: MentorInvitationStatus,
    usedAt?: Date
  ): Promise<MentorInvitation> {
    try {
      return await prisma.mentorInvitation.update({
        where: { token },
        data: {
          status,
          usedAt,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundError('Invitation');
        }
      }
      throw new DatabaseError('Failed to update invitation status', error);
    }
  }

  /**
   * Cancel invitation
   */
  async cancelInvitation(token: string): Promise<MentorInvitation> {
    return this.updateInvitationStatus(token, MentorInvitationStatus.CANCELLED);
  }

  /**
   * Get all invitations (with pagination and filters)
   */
  async findInvitations(params: {
    page?: number;
    limit?: number;
    status?: MentorInvitationStatus;
    email?: string;
  }): Promise<{ invitations: MentorInvitation[]; total: number }> {
    try {
      const { page = 1, limit = 10, status, email } = params;
      const skip = (page - 1) * limit;
      
      const where: Prisma.MentorInvitationWhereInput = {};
      if (status) where.status = status;
      if (email) where.email = { contains: email, mode: 'insensitive' };

      const [invitations, total] = await Promise.all([
        prisma.mentorInvitation.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            invitedBy: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        }),
        prisma.mentorInvitation.count({ where }),
      ]);

      return { invitations, total };
    } catch (error) {
      throw new DatabaseError('Failed to fetch invitations', error);
    }
  }

  /**
   * Create mentor profile
   */
  async createMentorProfile(data: Prisma.MentorProfileCreateInput): Promise<MentorProfile> {
    try {
      return await prisma.mentorProfile.create({
        data,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              image: true,
              userType: true,
            },
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new DatabaseError('Mentor profile already exists for this user');
        }
      }
      throw new DatabaseError('Failed to create mentor profile', error);
    }
  }

  /**
   * Update mentor profile
   */
  async updateMentorProfile(
    userId: string,
    data: Prisma.MentorProfileUpdateInput
  ): Promise<MentorProfile> {
    try {
      return await prisma.mentorProfile.update({
        where: { userId },
        data,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              image: true,
              userType: true,
            },
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundError('Mentor profile');
        }
      }
      throw new DatabaseError('Failed to update mentor profile', error);
    }
  }

  /**
   * Get mentor profile by user ID
   */
  async getMentorProfileByUserId(userId: string): Promise<MentorProfile | null> {
    try {
      return await prisma.mentorProfile.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              image: true,
              bio: true,
              userType: true,
              createdAt: true,
            },
          },
        },
      });
    } catch (error) {
      throw new DatabaseError('Failed to fetch mentor profile', error);
    }
  }

  /**
   * Get all mentors (with pagination)
   */
  async findMentors(params: {
    page?: number;
    limit?: number;
    expertise?: string;
  }): Promise<{ mentors: MentorProfile[]; total: number }> {
    try {
      const { page = 1, limit = 10, expertise } = params;
      const skip = (page - 1) * limit;
      
      const where: Prisma.MentorProfileWhereInput = {};
      if (expertise) {
        where.expertise = {
          has: expertise,
        };
      }

      const [mentors, total] = await Promise.all([
        prisma.mentorProfile.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                image: true,
                bio: true,
                userType: true,
                createdAt: true,
              },
            },
          },
        }),
        prisma.mentorProfile.count({ where }),
      ]);

      return { mentors, total };
    } catch (error) {
      throw new DatabaseError('Failed to fetch mentors', error);
    }
  }

  /**
   * Delete mentor profile
   */
  async deleteMentorProfile(userId: string): Promise<MentorProfile> {
    try {
      return await prisma.mentorProfile.delete({
        where: { userId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundError('Mentor profile');
        }
      }
      throw new DatabaseError('Failed to delete mentor profile', error);
    }
  }
}

// Export singleton instance
export const mentorRepository = new MentorRepository();
