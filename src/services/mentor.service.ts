import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { UserType, MentorInvitationStatus } from '@prisma/client';
import { mentorRepository } from '../repositories/mentor.repository';
import { userRepository } from '../repositories/user.repository';
import { emailService } from './email.service';
import {
  BusinessLogicError,
  ValidationError,
  NotFoundError,
  DuplicateError,
  AuthorizationError,
} from '../utils/errors';

/**
 * Mentor Service - Business logic for mentor invitation and profile management
 */
export class MentorService {
  private readonly INVITATION_TOKEN_EXPIRY_HOURS = 48; // 48 hours validity

  /**
   * Admin invites a mentor by email
   */
  async inviteMentor(adminId: string, email: string): Promise<{
    message: string;
    invitation: {
      email: string;
      expiresAt: Date;
      inviteLink: string;
    };
  }> {
    // Check admin, existing user, and pending invitation in parallel
    const [admin, existingUser, pendingInvitation] = await Promise.all([
      userRepository.findById(adminId),
      userRepository.findByEmail(email),
      mentorRepository.findPendingInvitationByEmail(email),
    ]);

    // Validate admin
    if (!admin) throw new NotFoundError('Admin user');
    if (admin.userType !== UserType.ADMIN) {
      throw new AuthorizationError('Only admins can invite mentors');
    }

    // Check user conflicts
    if (existingUser) {
      throw existingUser.userType === UserType.MENTOR
        ? new DuplicateError('Mentor', 'email')
        : new BusinessLogicError('User with this email already exists with a different role');
    }

    if (pendingInvitation) {
      throw new BusinessLogicError('A pending invitation already exists for this email');
    }

    // Generate token and create invitation
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.INVITATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    const inviteLink = `${process.env.FRONTEND_URL}/mentor/setup?token=${token}`;

    const invitation = await mentorRepository.createInvitation({
      email,
      token,
      invitedById: adminId,
      expiresAt,
    });

    // Send email (non-blocking on error)
    emailService.sendMentorInvitationEmail(email, inviteLink, admin.fullName || 'Admin')
      .catch(error => console.error('Failed to send invitation email:', error));

    return {
      message: 'Mentor invitation sent successfully',
      invitation: {
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        inviteLink,
      },
    };
  }

  /**
   * Verify invitation token
   */
  async verifyInvitation(token: string): Promise<{
    valid: boolean;
    email?: string;
    message: string;
  }> {
    const invitation = await mentorRepository.findInvitationByToken(token);

    if (!invitation) {
      return {
        valid: false,
        message: 'Invalid invitation token',
      };
    }

    if (invitation.status !== MentorInvitationStatus.PENDING) {
      return {
        valid: false,
        message: `Invitation has already been ${invitation.status.toLowerCase()}`,
      };
    }

    if (new Date() > invitation.expiresAt) {
      // Mark as expired
      await mentorRepository.updateInvitationStatus(token, MentorInvitationStatus.EXPIRED);
      return {
        valid: false,
        message: 'Invitation has expired',
      };
    }

    return {
      valid: true,
      email: invitation.email,
      message: 'Invitation is valid',
    };
  }

  /**
   * Setup mentor profile (complete onboarding)
   */
  async setupMentor(data: {
    token: string;
    fullName: string;
    password: string;
    expertise: string[];
    experience?: number;
    linkedin?: string;
    twitter?: string;
    website?: string;
    tagline?: string;
    description?: string;
    bio?: string;
    image?: string;
  }): Promise<{
    message: string;
    user: {
      id: string;
      email: string | null;
      fullName: string | null;
      userType: UserType;
      image: string | null;
      bio: string | null;
    };
    mentorProfile: unknown;
  }> {
    // Get and validate invitation
    const invitation = await mentorRepository.findInvitationByToken(data.token);
    if (!invitation) throw new NotFoundError('Invitation');
    if (invitation.status !== MentorInvitationStatus.PENDING) {
      throw new ValidationError(`Invitation has already been ${invitation.status.toLowerCase()}`);
    }
    if (new Date() > invitation.expiresAt) {
      throw new ValidationError('Invitation has expired');
    }

    // Check if user already exists
    const existingUser = await userRepository.findByEmail(invitation.email);
    if (existingUser) throw new DuplicateError('User', 'email');

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const user = await userRepository.create({
      email: invitation.email,
      fullName: data.fullName,
      password: hashedPassword,
      userType: UserType.MENTOR,
      isVerified: true,
      emailVerified: new Date(),
      bio: data.bio,
      image: data.image,
    });

    // Create mentor profile and mark invitation as used in parallel
    const [mentorProfile] = await Promise.all([
      mentorRepository.createMentorProfile({
        user: { connect: { id: user.id } },
        expertise: data.expertise,
        experience: data.experience,
        linkedin: data.linkedin,
        twitter: data.twitter,
        website: data.website,
        tagline: data.tagline,
        description: data.description,
      }),
      mentorRepository.updateInvitationStatus(data.token, MentorInvitationStatus.USED, new Date()),
    ]);

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail(invitation.email, data.fullName)
      .catch(error => console.error('Failed to send welcome email:', error));

    return {
      message: 'Mentor profile created successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        userType: user.userType,
        image: user.image,
        bio: user.bio,
      },
      mentorProfile,
    };
  }

  /**
   * Get mentor profile by user ID
   */
  async getMentorProfile(userId: string): Promise<unknown> {
    const mentorProfile = await mentorRepository.getMentorProfileByUserId(userId);
    if (!mentorProfile) {
      throw new NotFoundError('Mentor profile');
    }
    return mentorProfile;
  }

  /**
   * Update mentor profile
   */
  async updateMentorProfile(
    userId: string,
    data: {
      expertise?: string[];
      experience?: number;
      linkedin?: string;
      twitter?: string;
      website?: string;
      tagline?: string;
      description?: string;
    }
  ): Promise<unknown> {
    // Validate user type before updating (repository will handle not found)
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    if (user.userType !== UserType.MENTOR) {
      throw new AuthorizationError('User is not a mentor');
    }

    return mentorRepository.updateMentorProfile(userId, data);
  }

  /**
   * Get all mentors (with pagination)
   */
  async getMentors(params: {
    page?: number;
    limit?: number;
    expertise?: string;
  }): Promise<{ mentors: unknown[]; total: number; page: number; totalPages: number }> {
    const page = params.page || 1;
    const limit = params.limit || 10;

    const { mentors, total } = await mentorRepository.findMentors({
      page,
      limit,
      expertise: params.expertise,
    });

    return {
      mentors,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all invitations (admin only)
   */
  async getInvitations(params: {
    page?: number;
    limit?: number;
    status?: MentorInvitationStatus;
    email?: string;
  }): Promise<{
    invitations: unknown[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = params.page || 1;
    const limit = params.limit || 10;

    const { invitations, total } = await mentorRepository.findInvitations({
      page,
      limit,
      status: params.status,
      email: params.email,
    });

    return {
      invitations,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Cancel invitation (admin only)
   */
  async cancelInvitation(token: string): Promise<{ message: string }> {
    const invitation = await mentorRepository.findInvitationByToken(token);
    if (!invitation) {
      throw new NotFoundError('Invitation');
    }

    if (invitation.status !== MentorInvitationStatus.PENDING) {
      throw new BusinessLogicError('Only pending invitations can be cancelled');
    }

    await mentorRepository.cancelInvitation(token);

    return { message: 'Invitation cancelled successfully' };
  }

  /**
   * Decommission mentor (admin only) - Changes user type to STUDENT
   */
  async decommissionMentor(adminId: string, mentorUserId: string): Promise<{ message: string }> {
    // Verify admin
    const admin = await userRepository.findById(adminId);
    if (!admin || admin.userType !== UserType.ADMIN) {
      throw new AuthorizationError('Only admins can decommission mentors');
    }

    // Verify mentor exists
    const mentor = await userRepository.findById(mentorUserId);
    if (!mentor) {
      throw new NotFoundError('Mentor user');
    }

    if (mentor.userType !== UserType.MENTOR) {
      throw new BusinessLogicError('User is not a mentor');
    }

    // Check if mentor has active courses
    const mentorProfile = await mentorRepository.getMentorProfileByUserId(mentorUserId);
    if (mentorProfile) {
      // We'll keep the profile but change user type to deactivate mentor status
      // Courses remain associated but mentor can't access mentor features
    }

    // Change user type to STUDENT (decommissioned)
    await userRepository.updateById(mentorUserId, {
      userType: UserType.STUDENT,
    });

    return { message: 'Mentor decommissioned successfully. User type changed to STUDENT.' };
  }

  /**
   * Delete mentor completely (admin only)
   * WARNING: This will remove the mentor and reassign their courses to admin
   */
  async deleteMentor(
    adminId: string,
    mentorUserId: string,
    reassignToUserId?: string
  ): Promise<{ message: string }> {
    // Verify admin
    const admin = await userRepository.findById(adminId);
    if (!admin || admin.userType !== UserType.ADMIN) {
      throw new AuthorizationError('Only admins can delete mentors');
    }

    // Verify mentor exists
    const mentor = await userRepository.findById(mentorUserId);
    if (!mentor) {
      throw new NotFoundError('Mentor user');
    }

    // Verify reassignment user if provided
    if (reassignToUserId) {
      const reassignUser = await userRepository.findById(reassignToUserId);
      if (!reassignUser) {
        throw new NotFoundError('Reassignment user not found');
      }
      if (reassignUser.userType !== UserType.MENTOR && reassignUser.userType !== UserType.ADMIN) {
        throw new ValidationError('Reassignment user must be a MENTOR or ADMIN');
      }
    }

    // Get mentor's courses count for validation
    const mentorProfile = await mentorRepository.getMentorProfileByUserId(mentorUserId);
    
    // Reassign courses if mentor has any
    // This is handled at the database level with onDelete: Cascade or SetNull
    // But we should explicitly reassign to avoid data loss
    const targetUserId = reassignToUserId || adminId;
    await mentorRepository.reassignMentorCourses(mentorUserId, targetUserId);

    // Delete mentor profile if exists
    if (mentorProfile) {
      await mentorRepository.deleteMentorProfile(mentorUserId);
    }

    // Delete user account
    await userRepository.deleteById(mentorUserId);

    return {
      message: `Mentor deleted successfully. Courses reassigned to ${reassignToUserId ? 'specified user' : 'admin'}.`,
    };
  }

  /**
   * Get mentor's assigned courses
   */
  async getMentorCourses(userId: string): Promise<{
    courses: Array<{
      id: string;
      courseName: string;
      description: string | null;
      imageUrl: string;
      category: string;
      difficulty: string;
      isActive: boolean;
      enrollmentCount: number;
      scheduledSessions: Array<{
        id: string;
        title: string;
        scheduledAt: Date;
        status: string;
        duration: number;
      }>;
    }>;
  }> {
    const courses = await mentorRepository.getMentorCourses(userId);
    
    return {
      courses: courses.map(course => ({
        id: course.id,
        courseName: course.courseName,
        description: course.description,
        imageUrl: course.imageUrl,
        category: course.category,
        difficulty: course.difficulty,
        isActive: course.isActive,
        enrollmentCount: course.enrollments?.length || 0,
        scheduledSessions: course.scheduledSessions?.map(session => ({
          id: session.id,
          title: session.title,
          scheduledAt: session.scheduledAt,
          status: session.status,
          duration: session.duration,
        })) || [],
      })),
    };
  }
}

// Export singleton instance
export const mentorService = new MentorService();
