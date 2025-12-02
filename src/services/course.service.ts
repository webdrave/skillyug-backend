import { courseRepository } from '../repositories/course.repository';
import { userRepository } from '../repositories/user.repository';
import { Category, Difficulty, Course as _Course } from '@prisma/client';
import { 
  NotFoundError, 
  ValidationError, 
  BusinessLogicError,
  AuthorizationError 
} from '../utils/errors';
import { createPaginationMeta } from '../utils/response';

// Type for course with count information
type CourseWithCounts = _Course & {
  _count?: {
    enrollments?: number;
    reviews?: number;
  };
};

/**
 * Course Service
 * Handles all course-related business logic
 */
export class CourseService {
  async getAllCourses(
    page: number = 1,
    limit: number = 10,
    filters?: {
      category?: Category;
      difficulty?: Difficulty;
      featured?: boolean;
      search?: string;
    }
  ) {
    if (page < 1 || limit < 1 || limit > 100) {
      throw new ValidationError('Invalid pagination parameters');
    }

    const { courses, total } = await courseRepository.findMany(page, limit, filters);
    const pagination = createPaginationMeta(page, limit, total);

    return {
      courses,
      pagination
    };
  }

  /**
   * Get course by ID
   */
  async getCourseById(id: string) {
    if (!id) {
      throw new ValidationError('Course ID is required');
    }

    const course = await courseRepository.findById(id);
    if (!course) {
      throw new NotFoundError('Course');
    }

    return course;
  }

  /**
   * Create new course
   */
  async createCourse(
    mentorId: string,
    courseData: {
      courseName: string;
      description?: string;
      imageUrl: string;
      price: number;
      token?: number;
      category: Category;
      difficulty?: Difficulty;
      durationHours?: number;
      language?: string;
      isActive?: boolean;
      isFeatured?: boolean;
      learningPathId?: string;
    }
  ) {
    // Verify mentor exists and has correct user type
    const mentor = await userRepository.findById(mentorId);
    if (!mentor) {
      throw new NotFoundError('User not found');
    }

    if (mentor.userType !== 'MENTOR' && mentor.userType !== 'ADMIN') {
      throw new AuthorizationError('Only mentors and admins can create courses');
    }

    // Validate course data
    if (courseData.price < 0) {
      throw new ValidationError('Course price cannot be negative');
    }

    if (courseData.durationHours && courseData.durationHours < 0) {
      throw new ValidationError('Course duration cannot be negative');
    }

    // Create course
    const course = await courseRepository.create({
      courseName: courseData.courseName,
      description: courseData.description,
      imageUrl: courseData.imageUrl,
      price: courseData.price,
      category: courseData.category,
      difficulty: courseData.difficulty || 'BEGINNER',
      durationHours: courseData.durationHours,
      language: courseData.language || 'English',
      isFeatured: courseData.isFeatured || false,
      mentor: {
        connect: { id: mentorId }
      }
    });

    return course;
  }

  /**
   * Update course
   */
  async updateCourse(
    courseId: string,
    mentorId: string,
    updateData: {
      courseName?: string;
      description?: string;
      imageUrl?: string;
      price?: number;
      token?: number;
      category?: Category;
      difficulty?: Difficulty;
      durationHours?: number;
      language?: string;
      isActive?: boolean;
      isFeatured?: boolean;
      learningPathId?: string;
      mentorId?: string;
    }
  ) {
    // Check if course exists
    const existingCourse = await courseRepository.findById(courseId);
    if (!existingCourse) {
      throw new NotFoundError('Course');
    }

    // Verify mentor owns the course or is admin
    const requestingUser = await userRepository.findById(mentorId);
    if (!requestingUser) {
      throw new NotFoundError('User not found');
    }

    const isAdmin = requestingUser.userType === 'ADMIN';
    const isOwner = existingCourse.mentorId === mentorId;

    if (!isAdmin && !isOwner) {
      throw new AuthorizationError('You can only update your own courses');
    }

    // If updating mentorId, verify the new mentor exists and is valid (admin only)
    if (updateData.mentorId) {
      if (!isAdmin) {
        throw new AuthorizationError('Only admins can reassign course mentors');
      }

      const newMentor = await userRepository.findById(updateData.mentorId);
      if (!newMentor) {
        throw new NotFoundError('New mentor not found');
      }

      if (newMentor.userType !== 'MENTOR' && newMentor.userType !== 'ADMIN') {
        throw new ValidationError('New mentor must have MENTOR or ADMIN user type');
      }
    }

    // Validate update data
    if (updateData.price !== undefined && updateData.price < 0) {
      throw new ValidationError('Course price cannot be negative');
    }

    if (updateData.durationHours !== undefined && updateData.durationHours < 0) {
      throw new ValidationError('Course duration cannot be negative');
    }

    // Prepare update data for Prisma
    const prismaUpdateData: any = { ...updateData };
    
    // If mentorId is being updated, use connect syntax for Prisma relation
    if (updateData.mentorId) {
      prismaUpdateData.mentor = {
        connect: { id: updateData.mentorId }
      };
      delete prismaUpdateData.mentorId;
    }

    // Update course
    const updatedCourse = await courseRepository.updateById(courseId, prismaUpdateData);
    return updatedCourse;
  }

  /**
   * Delete course
   */
  async deleteCourse(courseId: string, mentorId: string) {
    // Check if course exists
    const existingCourse = await courseRepository.findById(courseId);
    if (!existingCourse) {
      throw new NotFoundError('Course');
    }

    // Verify mentor owns the course or is admin
    if (existingCourse.mentorId !== mentorId) {
      const mentor = await userRepository.findById(mentorId);
      if (!mentor || mentor.userType !== 'ADMIN') {
        throw new AuthorizationError('You can only delete your own courses');
      }
    }

    // Note: In production, you might want to check for enrollments first
    // and implement soft delete instead of hard delete
    
    await courseRepository.deleteById(courseId);
    return { message: 'Course deleted successfully' };
  }

  /**
   * Get courses by mentor
   */
  async getCoursesByMentor(mentorId: string) {
    const mentor = await userRepository.findById(mentorId);
    if (!mentor) {
      throw new NotFoundError('Mentor');
    }

    const courses = await courseRepository.findByMentorId(mentorId);
    return courses;
  }

  /**
   * Get featured courses
   */
  async getFeaturedCourses(limit: number = 6) {
    if (limit < 1 || limit > 20) {
      throw new ValidationError('Invalid limit parameter');
    }

    const courses = await courseRepository.findFeatured(limit);
    return courses;
  }

  /**
   * Get popular courses
   */
  async getPopularCourses(limit: number = 6) {
    if (limit < 1 || limit > 20) {
      throw new ValidationError('Invalid limit parameter');
    }

    const courses = await courseRepository.findPopular(limit);
    return courses;
  }

  /**
   * Search courses
   */
  async searchCourses(
    query: string,
    page: number = 1,
    limit: number = 10
  ) {
    if (!query || query.trim().length < 2) {
      throw new ValidationError('Search query must be at least 2 characters');
    }

    if (page < 1 || limit < 1 || limit > 100) {
      throw new ValidationError('Invalid pagination parameters');
    }

    const { courses, total } = await courseRepository.search(query.trim(), page, limit);
    const pagination = createPaginationMeta(page, limit, total);

    return {
      courses,
      pagination
    };
  }

  /**
   * Get course categories with counts
   */
  async getCategoriesWithCount() {
    const categories = await courseRepository.getCategoriesWithCount();
    return categories;
  }

  /**
   * Toggle course featured status (admin only)
   */
  async toggleFeaturedStatus(courseId: string, adminId: string) {
    // Verify admin user
    const admin = await userRepository.findById(adminId);
    if (!admin || admin.userType !== 'ADMIN') {
      throw new AuthorizationError('Only administrators can modify featured status');
    }

    // Get course
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course');
    }

    // Toggle featured status
    const updatedCourse = await courseRepository.updateById(courseId, {
      isFeatured: !course.isFeatured
    });

    return {
      course: updatedCourse,
      message: `Course ${updatedCourse.isFeatured ? 'featured' : 'unfeatured'} successfully`
    };
  }

  /**
   * Update course activity status (admin only)
   */
  async toggleActiveStatus(courseId: string, adminId: string) {
    // Verify admin user
    const admin = await userRepository.findById(adminId);
    if (!admin || admin.userType !== 'ADMIN') {
      throw new AuthorizationError('Only administrators can modify course status');
    }

    // Get course
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course');
    }

    // Toggle active status
    const updatedCourse = await courseRepository.updateById(courseId, {
      isActive: !course.isActive
    });

    return {
      course: updatedCourse,
      message: `Course ${updatedCourse.isActive ? 'activated' : 'deactivated'} successfully`
    };
  }

  /**
   * Get course analytics (for mentors and admins)
   */
  async getCourseAnalytics(courseId: string, requesterId: string) {
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course');
    }

    const requester = await userRepository.findById(requesterId);
    if (!requester) {
      throw new NotFoundError('User');
    }

    // Check permissions
    const canViewAnalytics = 
      course.mentorId === requesterId || 
      requester.userType === 'ADMIN';

    if (!canViewAnalytics) {
      throw new AuthorizationError('You can only view analytics for your own courses');
    }

    // Return basic analytics (you can expand this)
    const courseWithCounts = await courseRepository.findById(courseId);
    
    return {
      courseId: course.id,
      courseName: course.courseName,
      enrollmentCount: (courseWithCounts as CourseWithCounts)?._count?.enrollments || 0,
      reviewCount: (courseWithCounts as CourseWithCounts)?._count?.reviews || 0,
      averageRating: course.ratingAverage,
      isActive: course.isActive,
      isFeatured: course.isFeatured,
      createdAt: course.createdAt,
    };
  }

  /**
   * Validate course access for enrollment
   */
  async validateCourseAccess(courseId: string, _userId: string) {
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError('Course');
    }

    if (!course.isActive) {
      throw new BusinessLogicError('This course is currently not available');
    }

    // Check if user already enrolled (you'd implement this with enrollment repository)
    // For now, we'll just return the course
    return course;
  }
}

// Export singleton instance
export const courseService = new CourseService();
