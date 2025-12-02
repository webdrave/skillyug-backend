import prisma from '../utils/prisma';
import { userRepository } from '../repositories/user.repository';
import {
  NotFoundError,
  ValidationError
} from '../utils/errors';

/**
 * Enrollment Service
 * Handles all enrollment-related business logic
 */
export class EnrollmentService {

  /**
   * Get all enrollments for a user
   */
  async getUserEnrollments(userId: string) {
    // Validate inputs
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    // Verify user exists
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    try {
      // Fetch enrollments with course details
      const enrollments = await prisma.enrollment.findMany({
        where: {
          userId
        },
        include: {
          course: {
            select: {
              id: true,
              courseName: true,
              description: true,
              imageUrl: true,
              category: true,
              difficulty: true,
              durationHours: true,
              mentor: {
                select: {
                  id: true,
                  fullName: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: {
          lastAccessedAt: 'desc'
        }
      });

      return enrollments;
    } catch (error) {
      console.error('Failed to fetch enrollments:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const enrollmentService = new EnrollmentService();
