import { Response, NextFunction } from 'express';
import { courseService } from '../services/course.service';
import { ResponseUtil } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { Category, Difficulty } from '@prisma/client';
import { 
  createCourseSchema as _createCourseSchema,
  updateCourseSchema as _updateCourseSchema,
  paginationSchema as _paginationSchema
} from '../validators/schemas';
import type {
  CreateCourseInput,
  UpdateCourseInput,
  PaginationInput as _PaginationInput
} from '../validators/schemas';

/**
 * Course Controller
 * Handles HTTP requests for course operations
 * Business logic is delegated to CourseService
 */
export class CourseController {

  /**
   * Get all courses with pagination
   * GET /api/courses
   */
  async getAllCourses(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, category, difficulty, featured, search } = req.query;
      
      console.log('🔍 Controller debug:', {
        queryParams: req.query,
        parsedParams: { page, limit, category, difficulty, featured, search },
        featuredCheck: {
          featured,
          'featured === "true"': featured === 'true',
          'featured === "false"': featured === 'false',
          result: featured === 'true' ? true : featured === 'false' ? false : undefined
        }
      });
      
      const result = await courseService.getAllCourses(
        Number(page),
        Number(limit),
        {
          category: category as Category,
          difficulty: difficulty as Difficulty,
          featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
          search: search as string
        }
      );
      
      ResponseUtil.successWithPagination(res, result.courses, result.pagination, 'Courses retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get featured courses
   * GET /api/courses/featured
   */
  async getFeaturedCourses(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { limit = 6 } = req.query;
      const courses = await courseService.getFeaturedCourses(Number(limit));
      
      ResponseUtil.success(res, { courses }, 'Featured courses retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get course by ID
   * GET /api/courses/:id
   */
  async getCourseById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      const course = await courseService.getCourseById(id);
      
      ResponseUtil.success(res, course , 'Course retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search courses
   * GET /api/courses/search?q=query
   */
  async searchCourses(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { q: query, page = 1, limit = 10 } = req.query;
      
      if (!query || typeof query !== 'string') {
        return ResponseUtil.fail(res, 'Search query is required');
      }
      
      const result = await courseService.searchCourses(query, Number(page), Number(limit));
      
      ResponseUtil.successWithPagination(res, result.courses, result.pagination, 'Search results retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get courses by mentor
   * GET /api/courses/mentor/:mentorId
   */
  async getCoursesByMentor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { mentorId } = req.params;
      
      const courses = await courseService.getCoursesByMentor(mentorId);
      
      ResponseUtil.success(res, { courses }, 'Mentor courses retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create new course (Mentor/Admin only)
   * POST /api/courses
   */
  async createCourse(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const courseData: CreateCourseInput = req.body;
      const mentorId = req.user?.id;

      if (!mentorId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const course = await courseService.createCourse(mentorId, {
        courseName: courseData.courseName,
        description: courseData.description,
        imageUrl: courseData.imageUrl,
        price: courseData.price,
        token: courseData.token,
        category: courseData.category as Category,
        difficulty: courseData.difficulty,
        durationHours: courseData.durationHours,
        language: courseData.language,
        isActive: courseData.isActive,
        isFeatured: courseData.isFeatured,
        learningPathId: courseData.learningPathId,
      });
      
      ResponseUtil.created(res, { course }, 'Course created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update course (Mentor/Admin only)
   * PATCH /api/courses/:id
   */
  async updateCourse(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updateData: UpdateCourseInput = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const course = await courseService.updateCourse(id, userId, {
        courseName: updateData.courseName,
        description: updateData.description,
        imageUrl: updateData.imageUrl,
        price: updateData.price,
        token: updateData.token,
        category: updateData.category as Category,
        difficulty: updateData.difficulty,
        durationHours: updateData.durationHours,
        language: updateData.language,
        isActive: updateData.isActive,
        isFeatured: updateData.isFeatured,
        learningPathId: updateData.learningPathId,
        mentorId: updateData.mentorId,
      });
      
      ResponseUtil.success(res, { course }, 'Course updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete course (Mentor/Admin only)
   * DELETE /api/courses/:id
   */
  async deleteCourse(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const result = await courseService.deleteCourse(id, userId);
      
      ResponseUtil.successMessage(res, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle course featured status (Admin only)
   * PATCH /api/courses/:id/featured
   */
  async toggleFeatured(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const adminId = req.user?.id;

      if (!adminId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const result = await courseService.toggleFeaturedStatus(id, adminId);
      
      ResponseUtil.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get course analytics (Mentor/Admin only)
   * GET /api/courses/:id/analytics
   */
  async getCourseAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const analytics = await courseService.getCourseAnalytics(id, userId);
      
      ResponseUtil.success(res, { analytics }, 'Course analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get course categories with counts
   * GET /api/courses/categories
   */
  async getCategories(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const categories = await courseService.getCategoriesWithCount();
      
      ResponseUtil.success(res, { categories }, 'Categories retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get popular courses
   * GET /api/courses/popular
   */
  async getPopularCourses(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { limit = 6 } = req.query;
      const courses = await courseService.getPopularCourses(Number(limit));
      
      ResponseUtil.success(res, { courses }, 'Popular courses retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate course access
   * GET /api/courses/:id/validate-access
   */
  async validateCourseAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }
      
      const course = await courseService.validateCourseAccess(id, userId);
      
      ResponseUtil.success(res, { course }, 'Course access validated');
    } catch (error) {
      next(error);
    }
  }
}

// Export singleton instance
export const courseController = new CourseController();
